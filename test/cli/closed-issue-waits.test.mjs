import test from 'node:test';
import assert from 'node:assert/strict';
import { labelsFiles, run } from '../../lib/cli/run.mjs';
import { LABELS } from '../../lib/core/issue-status.mjs';
import { CONFIG, GITLAB_CONFIG, fakeNow, harness } from './harness.mjs';

const NOW = Date.parse('2026-11-22T12:00:00Z');
const stale = { at: NOW - 3600_000, every: 120 };
const live = { ...stale, pid: 222 };
const managed = '## Depends on\n\n- None\n';
const worktree = '/repo/.claude/worktrees/player';
const localGit = (args) => args[0] === 'worktree'
  ? 'worktree /repo\nHEAD main\n\nworktree ' + worktree + '\nHEAD player\n'
  : '';

function fixture(gitlab = false) {
  const config = { ...(gitlab ? GITLAB_CONFIG : CONFIG), staging_branch: 'staging' };
  const h = harness({
    gitlab, config,
    wrap: (adapter) => ({ ...adapter, listLabels: async () => Object.values(LABELS).map((label) => label.name) }),
    setup(w) {
      w.branch('staging');
      w.issue({ number: 5, body: managed });
      w.issue({ number: 6, body: managed, state: 'closed-by-hand' });
      w.issue({ number: 7, body: managed });
      w.review({ number: 30, base: 'staging', merged: true, body: 'Closes #5\nCloses #6' });
    },
  });
  Object.assign(h.ctx, { now: fakeNow(NOW), pid: 111, isAlive: (pid) => pid === 222 });
  const file = labelsFiles(h.ctx).waitBeats;
  const seed = (entries) => h.ctx.writeFile(file, JSON.stringify(entries));
  const saved = () => JSON.parse(h.ctx.readFile(file));
  const command = async (...args) => {
    h.out.length = 0;
    const code = await run(args, h.ctx);
    assert.equal(code, 0, h.errText() || h.text());
    return h.text();
  };
  return { ...h, file, seed, saved, command };
}

for (const gitlab of [false, true]) {
  const platform = gitlab ? 'GitLab' : 'GitHub';
  test(platform + ': land clears dead waits for newly and previously closed Issues', async () => {
    const h = fixture(gitlab);
    h.seed({ 5: stale, 6: { at: NOW - 60_000, every: 120, pid: 333 }, 7: stale });
    await h.command('land', '30', '--check');
    assert.ok(h.saved()[5]);
    await h.command('land', '30');
    assert.deepEqual(h.saved(), { 7: stale });
    const doctor = await h.command('doctor');
    assert.doesNotMatch(doctor, /waiting: #[56]/);
    assert.match(doctor, /waiting: #7: .*run \/huddle-play 7/);
  });

  test(platform + ': scoped labels clears the closed wait without extra platform calls', async () => {
    const h = fixture(gitlab);
    const control = fixture(gitlab);
    h.seed({ 6: stale, 7: stale });
    await h.command('labels', '--issue', '6', '--dry-run');
    assert.ok(h.saved()[6]);
    const before = h.calls().length;
    await h.command('labels', '--issue', '6');
    await control.command('labels', '--issue', '6');
    assert.deepEqual(h.calls().slice(before).map((c) => c.args), control.calls().map((c) => c.args));
    await h.command('labels', '--issue', '7');
    assert.deepEqual(h.saved(), { 7: stale });
    assert.doesNotMatch(await h.command('doctor'), /waiting: #6/);
  });
}

test('a live wait keeps its marker after closure, even with an overdue heartbeat', async () => {
  const h = fixture();
  h.seed({ 5: live, 6: live });
  await h.command('land', '30');
  await h.command('labels', '--issue', '6');
  await h.command('wait', '6');
  assert.deepEqual(h.saved(), { 5: live, 6: live });
  assert.doesNotMatch(await h.command('status'), /waiting: #[56]/);

  h.ctx.isAlive = () => false;
  const before = h.calls().length;
  const status = await h.command('status');
  assert.match(status, /#6: .*Issue is closed.*huddle wait 6/);
  assert.doesNotMatch(status, /huddle-play/);
  assert.equal(h.calls().length, before);
  await h.command('wait', '6');
  assert.deepEqual(h.saved(), { 5: live });
});

test('an unwritable heartbeat leaves a local recovery message for a closed Issue', async () => {
  const h = fixture();
  h.seed({ 6: stale });
  const write = h.ctx.writeFile;
  h.ctx.writeFile = (file, value) => {
    if (file === h.file) throw new Error('read-only heartbeat');
    write(file, value);
  };
  await h.command('labels', '--issue', '6');
  const status = await h.command('status');
  assert.match(status, /#6: .*Issue is closed.*huddle wait 6/);
  assert.doesNotMatch(status, /huddle-play/);
});

test('clean checks abandoned markers in other worktrees and keeps open or live waits', async () => {
  const h = fixture();
  Object.assign(h.ctx, { git: localGit, touchedAt: () => NOW });
  const worktreeFile = labelsFiles({ ...h.ctx, root: worktree }).waitBeats;
  h.seed({ 6: live });
  h.ctx.writeFile(worktreeFile, JSON.stringify({ 6: stale, 7: stale }));
  await h.command('clean', '--dry-run');
  await h.command('clean', '--no-fetch');
  assert.equal(h.calls().length, 0);
  assert.match(h.ctx.readFile(worktreeFile), /"6"/);
  await h.command('clean');
  assert.deepEqual(JSON.parse(h.ctx.readFile(worktreeFile)), { 7: stale });
  assert.deepEqual(h.saved(), { 6: live });
});

test('a wait records its process and labels preserves it until that process ends', async () => {
  const h = fixture();
  h.world.issue({ number: 6, body: managed, state: 'open' });
  h.ctx.writeFile(worktree + '/huddle.json', h.huddleJson());
  const player = { ...h.ctx, git: localGit, root: worktree, sleep: async () => { throw new Error('interrupted'); } };
  assert.equal(await run(['wait', '6'], player), 1);
  assert.equal(h.saved()[6].pid, 111);
  h.world.issue({ number: 6, body: managed, state: 'closed-by-hand' });
  h.ctx.isAlive = (pid) => pid === 111;
  await h.command('labels', '--issue', '6');
  assert.ok(h.saved()[6]);
  h.ctx.isAlive = () => false;
  await h.command('labels', '--issue', '6');
  assert.deepEqual(h.saved(), {});
});

test('scoped labels keeps a recent legacy heartbeat and clears its closure note when the Issue reopens', async () => {
  const h = fixture();
  const recent = { at: NOW - 60_000, every: 120 };
  h.seed({ 6: recent });
  await h.command('labels', '--issue', '6');
  assert.deepEqual(h.saved(), { 6: recent });
  assert.doesNotMatch(await h.command('doctor'), /waiting: #6/);
  h.world.issue({ number: 6, body: managed });
  await h.command('labels', '--issue', '6');
  h.ctx.now = fakeNow(NOW + 3600_000);
  assert.match(await h.command('status'), /waiting: #6: .*run \/huddle-play 6/);
});
