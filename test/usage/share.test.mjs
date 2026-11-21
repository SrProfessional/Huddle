// Issue #230: each person's token summary goes to the orphan branch huddle-usage (numbers only), written with git plumbing so the
// working tree, the index and the current branch are never touched. A local bare repo stands in for the remote: no network.
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pushUsage, readTeamUsage, sumRows, gitRunner } from '../../lib/usage/share.mjs';
import { run } from '../../lib/cli/run.mjs';
import { harness } from '../cli/harness.mjs';

const sh = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
function world() {
  const dir = mkdtempSync(path.join(tmpdir(), 'huddle-share-'));
  const remote = path.join(dir, 'remote.git');
  sh(dir, 'init', '-q', '--bare', remote);
  const clone = (name) => {
    const at = path.join(dir, name);
    sh(dir, 'clone', '-q', remote, at);
    sh(at, 'config', 'user.email', 'test@example.com');
    sh(at, 'config', 'user.name', 'Test');
    return at;
  };
  const a = clone('a');
  writeFileSync(path.join(a, 'README.md'), 'hello\n');
  sh(a, 'add', 'README.md');
  sh(a, 'commit', '-q', '-m', 'first');
  sh(a, 'push', '-q', 'origin', 'HEAD:main');
  return { dir, remote, a, clone };
}
const row = (day, input) => ({ day, tool: 'Claude Code', model: 'claude-opus-5-5', issue: 230, input, output: 1, cacheRead: 2, cacheWrite: 3, reasoning: 0 });

test('pushUsage writes usage/<login>/<day>.json on huddle-usage and leaves HEAD, the index and the working tree alone', () => {
  const w = world();
  const before = { head: sh(w.a, 'rev-parse', 'HEAD'), branch: sh(w.a, 'branch', '--show-current') };
  writeFileSync(path.join(w.a, 'wip.txt'), 'not committed\n'); // a Player's work in progress
  pushUsage({ run: gitRunner(w.a), person: 'ana', rows: [row('2026-11-20', 10)] });
  assert.equal(sh(w.a, 'rev-parse', 'HEAD'), before.head);
  assert.equal(sh(w.a, 'branch', '--show-current'), before.branch);
  assert.equal(sh(w.a, 'status', '--porcelain'), '?? wip.txt', 'nothing staged, nothing changed');
  const text = sh(w.remote, 'show', 'huddle-usage:usage/ana/2026-11-20.json');
  assert.deepEqual(JSON.parse(text), { person: 'ana', day: '2026-11-20', rows: [row('2026-11-20', 10)] });
  assert.equal(sh(w.remote, 'log', '--format=%P', '-1', 'huddle-usage'), '', 'an orphan branch: its first commit has no parent');
});

test('a second day adds a file and keeps the first; the same day is replaced, not duplicated', () => {
  const w = world();
  const r = gitRunner(w.a);
  pushUsage({ run: r, person: 'ana', rows: [row('2026-11-20', 10)] });
  pushUsage({ run: r, person: 'ana', rows: [row('2026-11-20', 15), row('2026-11-21', 7)] });
  const files = sh(w.remote, 'ls-tree', '-r', '--name-only', 'huddle-usage').split('\n');
  assert.deepEqual(files, ['usage/ana/2026-11-20.json', 'usage/ana/2026-11-21.json']);
  assert.equal(JSON.parse(sh(w.remote, 'show', 'huddle-usage:usage/ana/2026-11-20.json')).rows[0].input, 15);
});

test('a push rejected because someone pushed meanwhile fetches and retries once on top of their commit', () => {
  const w = world();
  const b = w.clone('b');
  const r = gitRunner(w.a);
  let raced = false;
  const racing = (args, opts) => {
    if (args[0] === 'push' && !raced) { raced = true; pushUsage({ run: gitRunner(b), person: 'luis', rows: [row('2026-11-20', 4)] }); }
    return r(args, opts);
  };
  pushUsage({ run: racing, person: 'ana', rows: [row('2026-11-20', 10)] });
  const files = sh(w.remote, 'ls-tree', '-r', '--name-only', 'huddle-usage').split('\n');
  assert.deepEqual(files, ['usage/ana/2026-11-20.json', 'usage/luis/2026-11-20.json'], 'both people, nobody lost');
});

test('readTeamUsage sums the team and keeps each person apart', () => {
  const w = world();
  pushUsage({ run: gitRunner(w.a), person: 'ana', rows: [row('2026-11-20', 10)] });
  pushUsage({ run: gitRunner(w.a), person: 'luis', rows: [row('2026-11-20', 5)] });
  const team = readTeamUsage({ run: gitRunner(w.a) });
  assert.deepEqual(Object.keys(team.people).sort(), ['ana', 'luis']);
  assert.equal(team.people.ana[0].input, 10);
  assert.equal(team.team.length, 1);
  assert.equal(team.team[0].input, 15);
  assert.deepEqual(sumRows([row('2026-11-20', 1), row('2026-11-20', 2)])[0].input, 3);
});

test('readTeamUsage with no huddle-usage branch yet is an empty team, not an error', () => {
  const w = world();
  assert.deepEqual(readTeamUsage({ run: gitRunner(w.a) }), { team: [], people: {} });
});

test('the session start pushes the summary in the background at most once an hour', async () => {
  const started = [];
  const clock = { t: Date.parse('2026-11-21T10:00:00Z') };
  const h = harness();
  Object.assign(h.ctx, { sharedDir: '/home/.huddle', updateCachePath: '/data/huddle-update.json', now: () => clock.t, startDetached: (a) => started.push(a) });
  await run(['hook'], h.ctx);
  await run(['hook'], h.ctx);
  assert.deepEqual(started, [['usage', '--push']]);
  clock.t += 61 * 60 * 1000;
  await run(['hook'], h.ctx);
  assert.equal(started.length, 2);
});

test('usage --push and usage --team --json reach the sharing functions', async () => {
  const pushed = [];
  const h = harness();
  h.ctx.collectUsage = () => [row('2026-11-20', 10)];
  h.ctx.pushUsage = (args) => pushed.push(args);
  h.ctx.readTeamUsage = () => ({ team: [row('2026-11-20', 10)], people: { SrProfessional: [row('2026-11-20', 10)] } });
  assert.equal(await run(['usage', '--push'], h.ctx), 0);
  assert.equal(pushed[0].person, 'SrProfessional');
  assert.equal(pushed[0].rows.length, 1);
  h.out.length = 0;
  assert.equal(await run(['usage', '--team', '--json'], h.ctx), 0);
  assert.equal(JSON.parse(h.text()).team[0].input, 10);
});

for (const gitlab of [false, true]) {
  test(`[${gitlab ? 'gitlab' : 'github'}] usage --push shares only in a private repo unless share_usage says otherwise (the Coach's privacy rule)`, async () => {
    const cases = [['private', undefined, true], ['internal', undefined, true], ['public', undefined, false], ['public', true, true], ['private', false, false]];
    for (const [vis, share, pushes] of cases) {
      const pushed = [];
      const h = harness({ gitlab, config: { ...(gitlab ? { platform: 'gitlab' } : {}), platform: gitlab ? 'gitlab' : 'github', project: 'acme/app', ai_manager: 'SrProfessional', assignees: ['ana'], ...(share !== undefined && { share_usage: share }) }, setup: (w) => w.visibility(vis) });
      h.ctx.collectUsage = () => [row('2026-11-20', 10)];
      h.ctx.pushUsage = (a) => pushed.push(a);
      assert.equal(await run(['usage', '--push'], h.ctx), 0, `${vis}/${share}`);
      assert.equal(pushed.length, pushes ? 1 : 0, `${vis}/${share}`);
      if (!pushes) assert.match(h.text(), /Usage not shared/);
    }
  });
}
