// Issue #248: the Player's watch. `huddle next --json` lists the Coach's requests to resume as well as the Issues to start; `huddle next
// --wait` waits with no tokens and wakes the Player's session when something becomes actionable (a start, or a request to resume); in
// Codex it runs as a process of its own and wakes the chat with `codex queue`. One per Player and repo on a machine; `--wait-off` stops it.
import test from 'node:test';
import assert from 'node:assert/strict';
import { run } from '../../lib/cli/run.mjs';
import { harness } from './harness.mjs';

const body = (effort, files) => `## Depends on\n\n- None\n\n## Effort\n\n${effort}\n\n## Allowed files\n\n${files.map((f) => `- \`${f}\``).join('\n')}\n`;
const request = (id, createdAt = '2026-11-21T10:00:00Z') => ({ id, author: 'SrProfessional', body: '## Prompt for Claude Code\n\n```text\nFix it.\n```', createdAt });
/** #230 of the live run: in review, a Coach request nobody took, sharing run.mjs with #239, which therefore waits. */
const stuck = (w) => {
  w.issue({ number: 230, title: 'Share usage', body: body(2, ['lib/cli/run.mjs']), assignees: ['ana'], labels: ['changes requested from Coach'], reviews: [245] });
  w.review({ number: 245 });
  w.comment(245, request(9001));
  w.issue({ number: 239, title: 'Stale pending', body: body(1, ['lib/cli/run.mjs']), assignees: ['ana'], labels: ['assigned'] });
};
function mk({ setup = stuck, rounds = 1, session = { tool: 'codex', id: 'P1' }, sleep } = {}) {
  let n = 0;
  const slept = [];
  const h = harness({ setup, wrap: (a) => ({ ...a, me: async () => 'ana' }), sleep: sleep ?? (async (ms) => { slept.push(ms); n += 1; if (n >= rounds) throw new Error('stop'); }) });
  Object.assign(h.ctx, { updateCachePath: '/data/u.json', sharedDir: '/home/.huddle', session, codexThread: session.tool === 'codex' ? session.id : null, now: () => Date.parse('2026-11-21T12:00:00Z') });
  h.slept = slept;
  return h;
}

test('a cold start with no new starts resumes the Issue that has an unclaimed Coach request, instead of reporting an empty queue', async () => {
  const h = mk();
  assert.equal(await run(['next', '--json'], h.ctx), 0);
  const r = JSON.parse(h.text());
  assert.deepEqual(r.start, []);
  assert.deepEqual(r.resume.map((x) => x.issue), [230]);
  assert.match(r.resume[0].key, /^resume:#230:9001$/);
});

test('next --wait wakes at once for that request, and exactly once: with its key seen it waits instead', async () => {
  const h = mk();
  assert.equal(await run(['role', 'player'], h.ctx), 0);
  assert.equal(await run(['next', '--wait'], h.ctx), 0);
  const woke = JSON.parse(h.text());
  assert.deepEqual(woke.actionable.resume.map((x) => x.issue), [230]);
  const again = mk();
 assert.equal(await run(['role', 'player'], again.ctx), 0);
  await run(['next', '--wait', '--seen', woke.actionable.resume[0].key], again.ctx).catch(() => {});
  assert.doesNotMatch(again.text(), /actionable/);
});

test('an empty queue stays idle on a 120-second poll and wakes when an Issue becomes eligible', async () => {
  let h;
  h = mk({
    setup: () => {},
    sleep: async (ms) => { h.slept.push(ms); if (h.slept.length === 2) h.world.issue({ number: 300, title: 'New', body: body(1, ['x.mjs']), assignees: ['ana'], labels: ['assigned'] }); if (h.slept.length > 3) throw new Error('stop'); },
  });
  h.slept = [];
  assert.equal(await run(['role', 'player'], h.ctx), 0);
  assert.equal(await run(['next', '--wait'], h.ctx), 0);
  assert.deepEqual(h.slept, [120000, 120000]);
  assert.deepEqual(JSON.parse(h.text()).actionable.start.map((x) => x.issue), [300]);
});

test('in Codex, next --wait --codex starts the watch as a process of its own and returns at once; outside Codex it says why', async () => {
  const started = [];
  const h = mk();
  h.ctx.startDetached = (a) => { started.push(a); return 4242; };
  assert.equal(await run(['role', 'player'], h.ctx), 0);
  assert.equal(await run(['next', '--wait', '--codex'], h.ctx), 0);
  assert.equal(started.length, 1);
  assert.deepEqual(started[0].slice(0, 5), ['next', '--wait', '120', '--codex-thread', 'P1']);
  assert.equal(started[0][5], '--run', 'the child gets the run its launcher claimed');
  assert.match(h.text(), /The Player's watch waits in the background/);
  const c = mk({ session: { tool: 'claude', id: 'S1' } });
  c.ctx.startDetached = () => assert.fail('nothing starts');
  assert.equal(await run(['role', 'player'], c.ctx), 0);
  assert.equal(await run(['next', '--wait', '--codex'], c.ctx), 1);
});

test('after the last active Issue finishes, the empty Codex round rearms one detached watch for future work', async () => {
  const issue = { number: 300, title: 'Last Issue', body: body(1, ['x.mjs']), assignees: ['ana'] };
  const launches = [];
  const sent = [];
  const h = mk({
    setup: (w) => w.issue({ ...issue, labels: ['assigned'] }),
    sleep: async (ms) => {
      h.slept.push(ms);
      assert.ok(h.slept.length <= 2, 'the next assignment wakes the watch');
      if (h.slept.length === 2) h.world.issue({ ...issue, number: 301, title: 'Next Issue', labels: ['assigned'] });
    },
  });
  Object.assign(h.ctx, {
    pid: 100, isAlive: () => true,
    startDetached: (args) => {
      const pid = 101 + launches.length;
      launches.push({ args, pid });
      return pid;
    },
    codexQueue: (thread, message) => {
      sent.push({ thread, message });
      return { queued: true, resumed: true };
    },
  });
  const runChild = async ({ args, pid }) => {
    h.ctx.pid = pid;
    try { return await run(args, h.ctx); } finally { h.ctx.pid = 100; }
  };

  assert.equal(await run(['role', 'player'], h.ctx), 0);
  assert.equal(await run(['next', '--wait', '--codex'], h.ctx), 0);
  h.out.length = 0;
  assert.equal(await runChild(launches[0]), 0);
  const { keys } = JSON.parse(h.text()).actionable;
  h.world.issue({ ...issue, labels: ['in progress'] });
  h.out.length = 0;
  assert.equal(await run(['next', '--json'], h.ctx), 0);
  assert.deepEqual(JSON.parse(h.text()).active.map((x) => x.issue), [300]);

  h.world.issue({ ...issue, state: 'merged' });
  h.out.length = 0;
  assert.equal(await run(['next', '--json'], h.ctx), 0);
  const { active, start, resume } = JSON.parse(h.text());
  assert.deepEqual({ active, start, resume }, { active: [], start: [], resume: [] });
  const rearm = ['next', '--wait', '--seen', keys.join(','), '--codex'];
  assert.equal(await run(rearm, h.ctx), 0);
  assert.equal(await run(rearm, h.ctx), 1, 'the same session keeps its existing watch');
  assert.equal(launches.length, 2, 'one initial watch and one rearm');

  assert.equal(await runChild(launches[1]), 0);
  assert.deepEqual(h.slept, [120000, 120000]);
  assert.deepEqual(sent.map(({ thread, message }) => [thread, message.match(/start #\d+/)?.[0]]), [['P1', 'start #300'], ['P1', 'start #301']]);
});

test('the detached Player watch queues one message into the Codex chat; a failed delivery is recorded and retried, never lost', async () => {
  const sent = [];
  let ok = false;
  const h = mk({ rounds: 3 });
  h.ctx.codexQueue = (thread, message) => { sent.push({ thread, message }); const r = ok; ok = true; return r; };
  assert.equal(await run(['role', 'player'], h.ctx), 0);
  assert.equal(await run(['next', '--wait', '--codex-thread', 'P1'], h.ctx), 0);
  assert.equal(sent.length, 2, 'the first delivery failed, the second went through');
  assert.match(sent[1].message, /Huddle \(Player\): resume #230.*Run \$huddle-play and do it/);
  assert.equal(h.slept.length, 1, 'it waited one round before retrying');
});

test('one Player watch per repo: another session is refused while it runs; --wait-off stops it and frees it', async () => {
  const a = mk({ setup: () => {} });
  Object.assign(a.ctx, { pid: 100, isAlive: () => true, startDetached: () => 101 });
  assert.equal(await run(['role', 'player'], a.ctx), 0);
  assert.equal(await run(['next', '--wait', '--codex'], a.ctx), 0);
  const b = mk({ setup: () => {}, session: { tool: 'codex', id: 'P2' } });
  Object.assign(b.ctx, { pid: 200, isAlive: () => true });
  b.ctx.readFile = a.ctx.readFile; b.ctx.writeFile = a.ctx.writeFile;
  assert.equal(await run(['role', 'player'], b.ctx), 0);
  assert.equal(await run(['next', '--wait'], b.ctx), 1);
  assert.match(b.text(), /The Player's watch already runs in Codex \(another session\)/);
  assert.equal(await run(['role', 'player'], b.ctx), 0);
  assert.equal(await run(['next', '--wait-off'], b.ctx), 0);
  const c = mk({ setup: () => {}, session: { tool: 'codex', id: 'P2' } });
  c.ctx.readFile = a.ctx.readFile; c.ctx.writeFile = a.ctx.writeFile;
 assert.equal(await run(['role', 'player'], c.ctx), 0);
  await run(['next', '--wait'], c.ctx).catch(() => {});
  assert.doesNotMatch(c.text(), /already runs/);
});

test('huddle status shows the Player\'s watch apart from the Coach\'s', async () => {
  const h = mk({ setup: () => {} });
 assert.equal(await run(['role', 'player'], h.ctx), 0);
  await run(['next', '--wait'], h.ctx).catch(() => {});
  h.out.length = 0;
  await run(['status'], h.ctx);
  assert.match(h.text(), /player watch: on, last check/);
});

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
test('the parallel play skill resumes first, never ends on an empty queue, and keeps one Player watch (Issue #248)', () => {
  const t = readFileSync(fileURLToPath(new URL('../../skills/huddle-play/parallel.md', import.meta.url)), 'utf8').replace(/\s+/g, ' ');
  assert.match(t, /Resume first \(step 4\), then start \(step 2\)/);
  assert.match(t, /Nothing to resume or start is not the end/);
  assert.match(t, /next --wait --seen <keys> --codex/);
  assert.match(t, /never start from the old answer/);
  assert.match(t, /next --wait-off/);
  assert.match(t, /After the last active Issue finishes, if no Issue is eligible, follow step 5 before closing the foreground round/);
  assert.doesNotMatch(t, /nothing is active and no wait is running, say so and end/);
  assert.doesNotMatch(t, /Nothing starts: say so and stop/);
});
