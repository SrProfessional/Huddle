// Issue #222: take over a stuck watch, when the person asks. While the owner's loop runs, nobody takes it. While the owner only holds it
// to review (its loop returned items), the refusal says what it took and when, and `--take-over` takes it. The «always» start never does.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { run, labelsFiles } from '../../lib/cli/run.mjs';
import { harness } from './harness.mjs';

const MANAGED = '## Depends on\n\n- None\n';
const review = (w) => { w.issue({ number: 214, body: MANAGED, assignees: ['ana'], reviews: [220] }); w.review({ number: 220, head: 'db42' }); };
function mk({ clock, session, setup = review, files, me = async () => 'SrProfessional' }) {
  let n = 0;
  const h = harness({ setup, wrap: (a) => ({ ...a, me }), sleep: async () => { n += 1; if (n >= 1) throw new Error('stop'); } });
  Object.assign(h.ctx, { updateCachePath: '/data/huddle-update.json', sharedDir: '/home/.huddle', session, now: () => clock.t });
  if (files) { h.ctx.readFile = files.ctx.readFile; h.ctx.writeFile = files.ctx.writeFile; }
  return h;
}
const T0 = Date.parse('2026-11-20T20:24:00Z');

test('an owner that took a PR to review is named with what it took and when; --take-over takes it', async () => {
  const clock = { t: T0 };
  const first = mk({ clock, session: { tool: 'codex', id: 'T1' } });
  assert.equal(await run(['queue', '--wait', '300'], first.ctx), 0, 'the PR waits: the loop returns it');
  clock.t += 30 * 60 * 1000;
  const second = mk({ clock, session: { tool: 'codex', id: 'T2' }, files: first });
  assert.equal(await run(['queue', '--wait', '300'], second.ctx), 1);
  assert.match(second.text(), /Another session \(Codex\) took PR #220 to review 30 minutes ago and has not checked since\. If it is stuck, take over with --take-over \(ask the person first\)\./);
  const taker = mk({ clock, session: { tool: 'codex', id: 'T2' }, files: first });
  assert.equal(await run(['queue', '--wait', '300', '--take-over'], taker.ctx), 0);
  assert.match(taker.text(), /Took over the watch from another Codex session/);
  assert.equal(JSON.parse(first.ctx.readFile(labelsFiles(first.ctx).watchOwner)).session, 'T2', 'the owner is now this session');
});

test('a running watch loop is never taken over', async () => {
  const clock = { t: T0 };
  const first = mk({ clock, session: { tool: 'claude', id: 'S1' }, setup: (w) => w.issue({ number: 5, body: MANAGED }) });
  await run(['queue', '--wait', '300'], first.ctx).catch(() => {});
  const taker = mk({ clock, session: { tool: 'codex', id: 'T2' }, files: first, setup: (w) => w.issue({ number: 5, body: MANAGED }) });
  assert.equal(await run(['queue', '--wait', '300', '--take-over'], taker.ctx), 1);
  assert.match(taker.text(), /The watch already runs in Claude Code \(another session\)/);
});

test('--take-over works with --codex too: the detached watch is started for this session', async () => {
  const clock = { t: T0 };
  const first = mk({ clock, session: { tool: 'codex', id: 'T1' } });
  await run(['queue', '--wait', '300'], first.ctx);
  const started = [];
  const taker = mk({ clock, session: { tool: 'codex', id: 'T2' }, files: first });
  Object.assign(taker.ctx, { codexThread: 'T2', startDetached: (args) => started.push(args) });
  assert.equal(await run(['queue', '--wait', '300', '--codex', '--take-over'], taker.ctx), 0);
  assert.deepEqual(started, [['queue', '--wait', '300', '--take-over', '--codex-thread', 'T2']]);
  // Review of PR #224: the detached worker's output is discarded, so the Codex caller itself must see the takeover.
  assert.match(taker.text(), /Took over the watch from another Codex session \(it took PR #220 to review and did not come back\)\./);
});

test('with --codex the takeover is confirmed only after this session is recorded as the owner (second review of PR #224)', async () => {
  const clock = { t: T0 };
  const first = mk({ clock, session: { tool: 'codex', id: 'T1' } });
  await run(['queue', '--wait', '300'], first.ctx);
  const taker = mk({ clock, session: { tool: 'codex', id: 'T2' }, files: first });
  Object.assign(taker.ctx, { codexThread: 'T2', startDetached: () => {} });
  assert.equal(await run(['queue', '--wait', '300', '--codex', '--take-over'], taker.ctx), 0);
  assert.equal(JSON.parse(first.ctx.readFile(labelsFiles(first.ctx).watchOwner)).session, 'T2', 'recorded before it says so');
});

test('with --codex, when the old owner claims the watch back in the meantime, the takeover is never reported and nothing starts', async () => {
  const clock = { t: T0 };
  const first = mk({ clock, session: { tool: 'codex', id: 'T1' } });
  await run(['queue', '--wait', '300'], first.ctx);
  const ownerFile = labelsFiles(first.ctx).watchOwner;
  const started = [];
  const taker = mk({ clock, session: { tool: 'codex', id: 'T2' }, files: first });
  const write = taker.ctx.writeFile;
  // The old owner resumes right after this session writes its claim: its own record wins.
  taker.ctx.writeFile = (p, t) => { write(p, t); if (p === ownerFile && t.includes('"T2"')) write(p, JSON.stringify({ tool: 'codex', session: 'T1' })); };
  Object.assign(taker.ctx, { codexThread: 'T2', startDetached: (a) => started.push(a) });
  assert.equal(await run(['queue', '--wait', '300', '--codex', '--take-over'], taker.ctx), 1);
  assert.doesNotMatch(taker.text(), /Took over/);
  assert.match(taker.text(), /The watch was not taken over: another session claimed it meanwhile\./);
  assert.deepEqual(started, []);
});

for (const [label, me] of [['a login that is not the Coach', async () => 'ana'], ['a failed authentication', async () => { throw new Error('gh: not logged in'); }]]) {
  test(`with --codex --take-over, ${label} keeps the owner and its heartbeat, says no success and starts nothing (third review of PR #224)`, async () => {
    const clock = { t: T0 };
    const first = mk({ clock, session: { tool: 'codex', id: 'T1' } });
    await run(['queue', '--wait', '300'], first.ctx);
    const files = labelsFiles(first.ctx);
    const owner = first.ctx.readFile(files.watchOwner);
    const beat = first.ctx.readFile(files.watchBeat);
    const started = [];
    const taker = mk({ clock, session: { tool: 'codex', id: 'T2' }, files: first, me });
    Object.assign(taker.ctx, { codexThread: 'T2', startDetached: (a) => started.push(a) });
    assert.notEqual(await run(['queue', '--wait', '300', '--codex', '--take-over'], taker.ctx), 0);
    assert.equal(first.ctx.readFile(files.watchOwner), owner);
    assert.equal(first.ctx.readFile(files.watchBeat), beat);
    assert.doesNotMatch(taker.text(), /Took over|waits in the background/);
    assert.deepEqual(started, []);
  });
}

const skill = readFileSync(fileURLToPath(new URL('../../skills/huddle-watch/SKILL.md', import.meta.url)), 'utf8').replace(/\s+/g, ' ');
test('the watch skill asks the person before --take-over, and the «always» start never passes it', () => {
  assert.match(skill, /has not checked since/);
  assert.match(skill, /ask the person «Another session took <what> <when> and has not come back\. Take over\?»/);
  assert.match(skill, /pass `--take-over` only on yes/);
  assert.match(skill, /The «always» start at a session start never passes `--take-over`/);
});
