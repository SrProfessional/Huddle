// Review of PR #251 (Issue #248): one Player watch, owned by one run at a time and claimed under an exclusive lock; a stop and a restart
// are per run, so an old child never wakes anyone; resumes follow the scheduler's capacity, file, dependency and design rules; a
// followed Issue that really closed is told until the telling succeeds; a message only queued (not resumed) in Codex is kept as a
// diagnostic, an error to queue is retried.
import test from 'node:test';
import assert from 'node:assert/strict';
import { run, labelsFiles } from '../../lib/cli/run.mjs';
import { harness } from './harness.mjs';

const body = (effort, files, deps = []) => `## Depends on\n\n${deps.length ? deps.map((n) => `- #${n}`).join('\n') : '- None'}\n\n## Effort\n\n${effort}\n\n## Allowed files\n\n${files.map((f) => `- \`${f}\``).join('\n')}\n`;
const request = (id) => ({ id, author: 'SrProfessional', body: '## Prompt for Claude Code\n\n```text\nFix it.\n```', createdAt: '2026-11-21T10:00:00Z' });
const assigned7 = (w) => w.issue({ number: 7, title: 'x', body: body(1, ['x.mjs']), assignees: ['ana'], labels: ['assigned'] });

/** One simulated process. `files` shares the disk of another one; `alive` says which pids still run. */
function mk({ setup = () => {}, pid = 100, session = { tool: 'codex', id: 'P1' }, sleep, alive = () => true, files } = {}) {
  let n = 0;
  const h = harness({ setup, wrap: (a) => ({ ...a, me: async () => 'ana' }), sleep: sleep ?? (async () => { n += 1; if (n >= 1) throw new Error('stop'); }) });
  Object.assign(h.ctx, { updateCachePath: '/data/u.json', sharedDir: '/home/.huddle', session, codexThread: session.tool === 'codex' ? session.id : null, now: () => Date.parse('2026-11-21T12:00:00Z'), pid, isAlive: alive });
  if (files) { h.ctx.readFile = files.ctx.readFile; h.ctx.writeFile = files.ctx.writeFile; }
  // An exclusive create on the shared disk, as the real one (writeFileSync with flag 'wx').
  h.ctx.createExclusive = (p, text) => { if (h.ctx.readFile(p)) return false; h.ctx.writeFile(p, text); return true; };
  h.ctx.removeFile = (p) => h.ctx.writeFile(p, '');
  return h;
}
/** A launcher: `next --wait --codex`, whose child gets `childPid`; returns the child's argv. */
async function launch(h, childPid) {
  let argv = null;
  h.ctx.startDetached = (args) => { argv = args; return childPid; };
  const code = await run(['next', '--wait', '--codex'], h.ctx);
  return { code, argv };
}
const owner = (h) => JSON.parse(h.ctx.readFile(labelsFiles(h.ctx).playerOwner) || 'null');

test('one Player watch, claimed before the child starts: a second launch (same or another session) is refused even before any heartbeat', async () => {
  const a = mk();
  assert.equal((await launch(a, 101)).code, 0);
  const again = mk({ files: a });
  again.ctx.startDetached = () => assert.fail('no second child');
  assert.equal(await run(['next', '--wait', '--codex'], again.ctx), 1, 'the same session, a second time');
  const other = mk({ files: a, pid: 200, session: { tool: 'codex', id: 'P2' } });
  other.ctx.startDetached = () => assert.fail('no second child');
  assert.equal(await run(['next', '--wait', '--codex'], other.ctx), 1);
  assert.match(other.text(), /The Player's watch already runs/);
});

test('two launches at the same moment: while one holds the lock, the other is refused', async () => {
  const a = mk();
  a.ctx.writeFile(labelsFiles(a.ctx).playerLock, JSON.stringify({ pid: 999, at: Date.parse('2026-11-21T12:00:00Z') }));
  const b = mk({ files: a, pid: 200, session: { tool: 'codex', id: 'P2' } });
  b.ctx.startDetached = () => assert.fail('no child while another launch holds the lock');
  assert.equal(await run(['next', '--wait', '--codex'], b.ctx), 1);
  assert.match(b.text(), /being started by another command/);
  // A lock left by a dead process is broken.
  const c = mk({ files: a, pid: 300, session: { tool: 'codex', id: 'P3' }, alive: (p) => p !== 999 });
  assert.equal((await launch(c, 301)).code, 0);
});

test('a dead owner frees the claim; the child adopts its run and releases it when it ends', async () => {
  let alive = true;
  const a = mk({ alive: () => alive });
  await launch(a, 101);
  alive = false; // the child crashed
  const b = mk({ files: a, pid: 300, session: { tool: 'codex', id: 'P3' }, alive: () => alive });
  const { code, argv } = await launch(b, 301);
  assert.equal(code, 0, 'a dead owner does not hold the watch');
  assert.ok(argv.includes('--run'));
  const child = mk({ files: a, pid: 301, session: { tool: 'codex', id: 'P3' }, setup: assigned7 });
  child.ctx.codexQueue = () => ({ queued: true, resumed: true });
  assert.equal(await run(argv, child.ctx), 0);
  assert.equal(owner(a), null, 'released when it ended');
});

test('stop, an immediate restart, then the old child\'s next poll: the old child stands down and never wakes anyone', async () => {
  const a = mk();
  const first = await launch(a, 101);
  // A stop while the first child runs: it keeps its ownership, marked stopped, until it can exit.
  assert.equal(await run(['next', '--wait-off'], a.ctx), 0);
  assert.equal(owner(a).stopped, true);
  // An immediate restart from another session takes over.
  const b = mk({ files: a, pid: 200, session: { tool: 'codex', id: 'P2' } });
  const second = await launch(b, 201);
  assert.equal(second.code, 0);
  const runOf = (argv) => argv[argv.indexOf('--run') + 1];
  assert.notEqual(runOf(second.argv), runOf(first.argv));
  // The old child (pid 101) polls now: work is there, yet it tells nothing and leaves the new owner alone.
  const sent = [];
  const old = mk({ files: a, pid: 101, setup: assigned7 });
  old.ctx.codexQueue = (t, m) => { sent.push(m); return { queued: true, resumed: true }; };
  assert.equal(await run(first.argv, old.ctx), 0);
  assert.deepEqual(sent, []);
  assert.equal(owner(a).run, runOf(second.argv), 'the new run still owns the watch');
  assert.equal(owner(a).pid, 201);
  // The new child works as usual.
  const fresh = mk({ files: a, pid: 201, session: { tool: 'codex', id: 'P2' }, setup: assigned7 });
  fresh.ctx.codexQueue = (t, m) => { sent.push({ t, m }); return { queued: true, resumed: true }; };
  assert.equal(await run(second.argv, fresh.ctx), 0);
  assert.equal(sent.length, 1);
  assert.equal(sent[0].t, 'P2');
});

test('a stopped child that polls before any restart says it stopped, tells nothing, and frees the watch', async () => {
  const a = mk();
  const { argv } = await launch(a, 101);
  await run(['next', '--wait-off'], a.ctx);
  const sent = [];
  const child = mk({ files: a, pid: 101, setup: assigned7 });
  child.ctx.codexQueue = (t, m) => { sent.push(m); return { queued: true, resumed: true }; };
  assert.equal(await run(argv, child.ctx), 0);
  assert.deepEqual(sent, []);
  assert.match(child.text(), /"stopped": ?true/);
  assert.equal(owner(a), null);
});

const twoOnOneFile = (effort) => (w) => {
  for (const [n, pr] of [[40, 400], [41, 410]]) {
    w.issue({ number: n, title: `On same.mjs ${n}`, body: body(effort, ['same.mjs']), assignees: ['ana'], labels: ['changes requested from Coach'], reviews: [pr] });
    w.review({ number: pr });
    w.comment(pr, request(n * 100));
  }
  w.issue({ number: 50, title: 'A design', body: `${body(1, ['design/50-x/'])}\n## Screens\n\n- home\n`, assignees: ['ana'], labels: ['changes requested from Coach', 'design'], reviews: [500] });
  w.review({ number: 500 });
  w.comment(500, request(5000));
};

test('resumes follow the file and design rules: two requests on one file resume one at a time; a Design Issue is never handed out', async () => {
  const h = mk({ setup: twoOnOneFile(1) });
  assert.equal(await run(['next', '--json'], h.ctx), 0);
  const r = JSON.parse(h.text());
  assert.deepEqual(r.resume.map((x) => x.issue), [40]);
  const why = Object.fromEntries(r.wait.map((w) => [w.issue, w.why]));
  assert.match(why[41], /resume after #40: both touch same\.mjs/);
  assert.match(why[50], /a Design Issue: resume it in a session of its own/);
});

test('after take, a resume is weighed against the work already running: two 3-point requests on one file, #40 taken, #41 waits', async () => {
  const h = mk({ setup: twoOnOneFile(3) });
  assert.equal(await run(['take', '40'], h.ctx), 0);
  h.out.length = 0;
  assert.equal(await run(['next', '--json'], h.ctx), 0);
  const r = JSON.parse(h.text());
  assert.deepEqual(r.resume, [], '#40 runs, and #41 shares its file and would pass the capacity');
  assert.match(Object.fromEntries(r.wait.map((w) => [w.issue, w.why]))[41], /resume after #40: both touch same\.mjs/);
});

test('a resume waits for a capacity that is full, and for an open dependency', async () => {
  const h = mk({
    setup: (w) => {
      w.issue({ number: 70, title: 'Runs', body: body(3, ['a.mjs']), assignees: ['ana'], labels: ['in progress'] });
      w.issue({ number: 71, title: 'Request', body: body(3, ['b.mjs']), assignees: ['ana'], labels: ['changes requested from Coach'], reviews: [710] });
      w.review({ number: 710 });
      w.comment(710, request(7100));
      w.issue({ number: 99, title: 'Dependency', body: body(1, ['d.mjs']), assignees: ['luis'], labels: ['in progress'] });
      w.issue({ number: 72, title: 'Blocked request', body: body(1, ['c.mjs'], [99]), assignees: ['ana'], labels: ['changes requested from Coach'], reviews: [720] });
      w.review({ number: 720 });
      w.comment(720, request(7200));
    },
  });
  assert.equal(await run(['next', '--json'], h.ctx), 0);
  const r = JSON.parse(h.text());
  assert.deepEqual(r.resume, []);
  const why = Object.fromEntries(r.wait.map((w) => [w.issue, w.why]));
  assert.match(why[71], /resume later: no room: 3 of 5 points in use, it needs 3/);
  assert.match(why[72], /resume after #99: it depends on it/);
});

test('starts are weighed against running work and the resumes chosen now: #72 waits on #99, the independent #80 starts', async () => {
  const h = mk({
    setup: (w) => {
      w.issue({ number: 99, title: 'Dependency', body: body(1, ['d.mjs']), assignees: ['luis'], labels: ['in progress'] });
      w.issue({ number: 72, title: 'Blocked request', body: body(3, ['c.mjs'], [99]), assignees: ['ana'], labels: ['changes requested from Coach'], reviews: [720] });
      w.review({ number: 720 });
      w.comment(720, request(7200));
      w.issue({ number: 80, title: 'Independent', body: body(3, ['e.mjs']), assignees: ['ana'], labels: ['assigned'] });
    },
  });
  assert.equal(await run(['next', '--json'], h.ctx), 0);
  const r = JSON.parse(h.text());
  assert.deepEqual(r.resume, []);
  assert.deepEqual(r.start.map((x) => x.issue), [80]);
  assert.equal(r.used, 0, 'nothing runs');
  assert.match(Object.fromEntries(r.wait.map((w) => [w.issue, w.why]))[72], /resume after #99/);
});

test('a closure check that fails is tried again next round, and the confirmed closure reaches the thread once', async () => {
  let rounds = 0;
  let h;
  let lookups = 0;
  h = mk({
    setup: (w) => { w.issue({ number: 60, title: 'In review', body: body(1, ['r.mjs']), assignees: ['ana'], labels: ['in review'], reviews: [600] }); w.review({ number: 600 }); },
    sleep: async () => { rounds += 1; if (rounds === 1) h.world.issue({ number: 60, title: 'In review', body: body(1, ['r.mjs']), assignees: ['ana'], state: 'merged' }); if (rounds > 4) throw new Error('stop'); },
  });
  const make = h.ctx.createPlatform;
  h.ctx.createPlatform = async (cfg) => {
    const a = await make(cfg);
    return { ...a, issueState: async (n) => { lookups += 1; if (lookups === 1) throw new Error('read ECONNRESET'); return a.issueState(n); } };
  };
  const sent = [];
  h.ctx.codexQueue = (t, m) => { sent.push({ t, m }); return { queued: true, resumed: true }; };
  assert.equal(await run(['next', '--wait', '--codex-thread', 'P1'], h.ctx), 0);
  assert.equal(lookups, 2, 'tried again after the reset');
  assert.equal(sent.length, 1);
  assert.equal(sent[0].t, 'P1');
  assert.match(sent[0].m, /#60 is finished/);
});

test('a claimed request (👀) is no longer offered to resume', async () => {
  const h = mk({ setup: twoOnOneFile(1) });
  assert.equal(await run(['take', '40'], h.ctx), 0);
  h.out.length = 0;
  await run(['next', '--json'], h.ctx);
  assert.ok(!JSON.parse(h.text()).resume.some((x) => x.issue === 40));
});

test('a followed Issue that is merged is told once, even when the queue is then empty', async () => {
  let rounds = 0;
  let h;
  h = mk({
    setup: (w) => { w.issue({ number: 60, title: 'In review', body: body(1, ['r.mjs']), assignees: ['ana'], labels: ['in review'], reviews: [600] }); w.review({ number: 600 }); },
    sleep: async () => { rounds += 1; if (rounds === 1) h.world.issue({ number: 60, title: 'In review', body: body(1, ['r.mjs']), assignees: ['ana'], state: 'merged' }); if (rounds > 3) throw new Error('stop'); },
  });
  assert.equal(await run(['next', '--wait'], h.ctx), 0);
  assert.deepEqual(JSON.parse(h.text()).actionable.finished, [60]);
});

test('an Issue that only lost its Player (still open) is not told as finished', async () => {
  let rounds = 0;
  let h;
  h = mk({
    setup: (w) => { w.issue({ number: 61, title: 'Mine', body: body(1, ['r.mjs']), assignees: ['ana'], labels: ['in review'], reviews: [610] }); w.review({ number: 610 }); },
    sleep: async () => { rounds += 1; if (rounds === 1) h.world.issue({ number: 61, title: 'Mine', body: body(1, ['r.mjs']), assignees: ['luis'], labels: ['in review'] }); if (rounds > 2) throw new Error('stop'); },
  });
  await run(['next', '--wait'], h.ctx).catch(() => {});
  assert.doesNotMatch(h.text(), /finished/);
});

test('a finished Issue whose first delivery failed is told again, to the same thread, exactly once', async () => {
  let rounds = 0;
  let h;
  h = mk({
    setup: (w) => { w.issue({ number: 60, title: 'In review', body: body(1, ['r.mjs']), assignees: ['ana'], labels: ['in review'], reviews: [600] }); w.review({ number: 600 }); },
    sleep: async () => { rounds += 1; if (rounds === 1) h.world.issue({ number: 60, title: 'In review', body: body(1, ['r.mjs']), assignees: ['ana'], state: 'merged' }); if (rounds > 5) throw new Error('stop'); },
  });
  const sent = [];
  h.ctx.codexQueue = (t, m) => { sent.push({ t, m }); return sent.length === 1 ? { queued: false, error: 'codex: busy' } : { queued: true, resumed: true }; };
  assert.equal(await run(['next', '--wait', '--codex-thread', 'P1'], h.ctx), 0);
  assert.equal(sent.length, 2);
  assert.ok(sent.every((x) => x.t === 'P1' && /#60 is finished/.test(x.m)));
  assert.deepEqual(JSON.parse(h.text()).actionable.finished, [60]);
});

test('in Codex, a message only queued (the session could not be resumed) is kept as a diagnostic and not sent again; an error to queue is retried', async () => {
  const queuedOnly = mk({ setup: assigned7 });
  const sent = [];
  queuedOnly.ctx.codexQueue = (t, m) => { sent.push(m); return { queued: true, resumed: false, warning: 'could not resume thread P1: start a local daemon' }; };
  assert.equal(await run(['next', '--wait', '--codex-thread', 'P1'], queuedOnly.ctx), 0);
  assert.equal(sent.length, 1, 'not sent twice');
  const beat = JSON.parse(queuedOnly.ctx.readFile(labelsFiles(queuedOnly.ctx).playerBeat));
  assert.match(beat.note, /queued; Codex could not resume the session/);
  let calls = 0;
  const failing = mk({ setup: assigned7, sleep: async () => { if (calls > 2) throw new Error('stop'); } });
  failing.ctx.codexQueue = () => { calls += 1; return calls === 1 ? { queued: false, error: 'codex: thread not found' } : { queued: true, resumed: true }; };
  assert.equal(await run(['next', '--wait', '--codex-thread', 'P1'], failing.ctx), 0);
  assert.equal(calls, 2, 'retried once the queue failed');
});
