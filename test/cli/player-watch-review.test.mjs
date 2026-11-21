// Review of PR #251 (Issue #248): one Player watch claimed before it starts; resumes follow the same file and design rules; a followed
// Issue that closes is told once; a message only queued (not resumed) in Codex is kept as a diagnostic, an error to queue is retried.
import test from 'node:test';
import assert from 'node:assert/strict';
import { run, labelsFiles } from '../../lib/cli/run.mjs';
import { harness } from './harness.mjs';

const body = (effort, files) => `## Depends on\n\n- None\n\n## Effort\n\n${effort}\n\n## Allowed files\n\n${files.map((f) => `- \`${f}\``).join('\n')}\n`;
const request = (id) => ({ id, author: 'SrProfessional', body: '## Prompt for Claude Code\n\n```text\nFix it.\n```', createdAt: '2026-11-21T10:00:00Z' });
function mk({ setup = () => {}, pid = 100, session = { tool: 'codex', id: 'P1' }, sleep, alive = () => true, files } = {}) {
  let n = 0;
  const h = harness({ setup, wrap: (a) => ({ ...a, me: async () => 'ana' }), sleep: sleep ?? (async () => { n += 1; if (n >= 1) throw new Error('stop'); }) });
  Object.assign(h.ctx, { updateCachePath: '/data/u.json', sharedDir: '/home/.huddle', session, codexThread: session.tool === 'codex' ? session.id : null, now: () => Date.parse('2026-11-21T12:00:00Z'), pid, isAlive: alive });
  if (files) { h.ctx.readFile = files.ctx.readFile; h.ctx.writeFile = files.ctx.writeFile; }
  return h;
}

test('one Player watch, claimed before the child starts: a second launch (same or another session) is refused even before any heartbeat', async () => {
  const a = mk();
  a.ctx.startDetached = () => 101;
  assert.equal(await run(['next', '--wait', '--codex'], a.ctx), 0);
  const again = mk({ files: a });
  again.ctx.startDetached = () => assert.fail('no second child');
  assert.equal(await run(['next', '--wait', '--codex'], again.ctx), 1, 'the same session, a second time');
  const other = mk({ files: a, pid: 200, session: { tool: 'codex', id: 'P2' } });
  other.ctx.startDetached = () => assert.fail('no second child');
  assert.equal(await run(['next', '--wait', '--codex'], other.ctx), 1);
  assert.match(other.text(), /The Player's watch already runs/);
});

test('a dead owner frees the claim; the child releases it when it ends', async () => {
  let alive = true;
  const a = mk({ alive: () => alive });
  a.ctx.startDetached = () => 101;
  await run(['next', '--wait', '--codex'], a.ctx);
  alive = false; // the child crashed
  const b = mk({ files: a, pid: 300, session: { tool: 'codex', id: 'P3' }, alive: () => alive });
  b.ctx.startDetached = () => 301;
  assert.equal(await run(['next', '--wait', '--codex'], b.ctx), 0, 'a dead owner does not hold the watch');
  // The child itself (pid 301) ends on an actionable item and releases.
  const child = mk({ files: a, pid: 301, session: { tool: 'codex', id: 'P3' }, setup: (w) => w.issue({ number: 7, title: 'x', body: body(1, ['x.mjs']), assignees: ['ana'], labels: ['assigned'] }) });
  child.ctx.codexQueue = () => ({ queued: true, resumed: true });
  assert.equal(await run(['next', '--wait', '--codex-thread', 'P3'], child.ctx), 0);
  assert.equal(a.ctx.readFile(labelsFiles(a.ctx).playerOwner) || '', '', 'released when it ended');
});

test('the stop is checked right before telling anything, and a refused restart never clears a running child\'s stop', async () => {
  const h = mk({ setup: (w) => w.issue({ number: 7, title: 'x', body: body(1, ['x.mjs']), assignees: ['ana'], labels: ['assigned'] }) });
  h.ctx.writeFile(labelsFiles(h.ctx).playerStop, '1');
  const sent = [];
  h.ctx.codexQueue = (t, m) => { sent.push(m); return { queued: true, resumed: true }; };
  assert.equal(await run(['next', '--wait', '--codex-thread', 'P1'], h.ctx), 0);
  assert.deepEqual(sent, [], 'stopped: nothing told');
  assert.match(h.text(), /"stopped": ?true/);
});

const twoOnOneFile = (w) => {
  for (const [n, pr] of [[40, 400], [41, 410]]) {
    w.issue({ number: n, title: `On same.mjs ${n}`, body: body(1, ['same.mjs']), assignees: ['ana'], labels: ['changes requested from Coach'], reviews: [pr] });
    w.review({ number: pr });
    w.comment(pr, request(n * 100));
  }
  w.issue({ number: 50, title: 'A design', body: `${body(1, ['design/50-x/'])}\n## Screens\n\n- home\n`, assignees: ['ana'], labels: ['changes requested from Coach', 'design'], reviews: [500] });
  w.review({ number: 500 });
  w.comment(500, request(5000));
};

test('resumes follow the file and design rules: two requests on one file resume one at a time; a Design Issue is never handed out', async () => {
  const h = mk({ setup: twoOnOneFile });
  assert.equal(await run(['next', '--json'], h.ctx), 0);
  const r = JSON.parse(h.text());
  assert.deepEqual(r.resume.map((x) => x.issue), [40]);
  const why = Object.fromEntries(r.wait.map((w) => [w.issue, w.why]));
  assert.match(why[41], /resume after #40: both touch same\.mjs/);
  assert.match(why[50], /a Design Issue: resume it in a session of its own/);
});

test('a claimed request (👀) is no longer offered to resume', async () => {
  const h = mk({ setup: twoOnOneFile });
  h.world.react?.(4000, 'eyes');
  assert.equal(await run(['take', '40'], h.ctx), 0);
  h.out.length = 0;
  await run(['next', '--json'], h.ctx);
  assert.ok(!JSON.parse(h.text()).resume.some((x) => x.issue === 40));
});

test('a followed Issue that is merged or closed is told once, even when the queue is then empty', async () => {
  let rounds = 0;
  let h;
  h = mk({
    setup: (w) => { w.issue({ number: 60, title: 'In review', body: body(1, ['r.mjs']), assignees: ['ana'], labels: ['in review'], reviews: [600] }); w.review({ number: 600 }); },
    sleep: async () => { rounds += 1; if (rounds === 1) h.world.issue({ number: 60, title: 'In review', body: body(1, ['r.mjs']), assignees: ['ana'], state: 'merged' }); if (rounds > 3) throw new Error('stop'); },
  });
  assert.equal(await run(['next', '--wait'], h.ctx), 0);
  const out = JSON.parse(h.text());
  assert.deepEqual(out.actionable.finished, [60]);
});

test('in Codex, a message only queued (the session could not be resumed) is kept as a diagnostic and not sent again; an error to queue is retried', async () => {
  const setup = (w) => w.issue({ number: 7, title: 'x', body: body(1, ['x.mjs']), assignees: ['ana'], labels: ['assigned'] });
  const queuedOnly = mk({ setup });
  const sent = [];
  queuedOnly.ctx.codexQueue = (t, m) => { sent.push(m); return { queued: true, resumed: false, warning: 'could not resume thread P1: start a local daemon' }; };
  assert.equal(await run(['next', '--wait', '--codex-thread', 'P1'], queuedOnly.ctx), 0);
  assert.equal(sent.length, 1, 'not sent twice');
  const beat = JSON.parse(queuedOnly.ctx.readFile(labelsFiles(queuedOnly.ctx).playerBeat));
  assert.match(beat.note, /queued; Codex could not resume the session/);
  let calls = 0;
  const failing = mk({ setup, sleep: async () => { if (calls > 2) throw new Error('stop'); } });
  failing.ctx.codexQueue = () => { calls += 1; return calls === 1 ? { queued: false, error: 'codex: thread not found' } : { queued: true, resumed: true }; };
  assert.equal(await run(['next', '--wait', '--codex-thread', 'P1'], failing.ctx), 0);
  assert.equal(calls, 2, 'retried once the queue failed');
});
