// Issue #302: when nothing can start or resume, `huddle next`, `huddle status` and the Player's watch say why and who must act, and name a
// circle of waits. Canned adapters for GitHub and GitLab, no real call.
import test from 'node:test';
import assert from 'node:assert/strict';
import { run } from '../../lib/cli/run.mjs';
import { pauseBody } from '../../lib/core/pause.mjs';
import { harness } from './harness.mjs';

const body = (effort, files, deps = '- None') => `## Depends on\n\n${deps}\n\n## Effort\n\n${effort}\n\n## Allowed files\n\n${files.map((f) => `- \`${f}\``).join('\n')}\n`;
const NOW = Date.parse('2026-11-22T12:00:00Z');
function mk(setup, { gitlab = false, sleep } = {}) {
  const h = harness({ gitlab, setup, wrap: (a) => ({ ...a, me: async () => 'ana' }), sleep });
  Object.assign(h.ctx, { updateCachePath: '/data/u.json', sharedDir: '/home/.huddle', now: () => NOW, session: { tool: 'claude', id: 'S1' } });
  return h;
}
const next = async (h) => { h.out.length = 0; assert.equal(await run(['next', '--json'], h.ctx), 0); return JSON.parse(h.text()); };

/** Nothing can start: a decision, a review, a step for the person, an open dependency and a pause. */
const stuck = (w) => {
  w.issue({ number: 5, title: 'Asked', body: body(1, ['a.mjs']), assignees: ['ana'], labels: ['needs decision'] });
  w.issue({ number: 6, title: 'In review', body: body(1, ['b.mjs']), assignees: ['ana'], labels: ['in review'], reviews: [60] });
  w.review({ number: 60 });
  w.issue({ number: 7, title: 'Measure', body: body(1, ['c.mjs']), assignees: ['ana'], labels: ['in progress'] });
  w.comment(7, { id: 701, author: 'ana', createdAt: '2026-11-22T09:00:00Z', body: '⛔ Issue #7 stopped\n\n## 🙋 Only you\n\n1. Run the measurement on a Windows computer and paste the numbers here.\n2. Tell me when done.\n' });
  w.issue({ number: 8, title: 'Blocked', body: body(1, ['d.mjs'], '- #99'), assignees: ['ana'], labels: ['blocked'] });
  w.issue({ number: 99, title: 'Open dep', body: body(1, ['q.mjs']), assignees: ['luis'], labels: ['assigned'] });
  w.issue({ number: 9, title: 'Paused', body: body(1, ['e.mjs']), assignees: ['ana'], labels: ['in progress'] });
  w.comment(9, { id: 901, author: 'SrProfessional', createdAt: '2026-11-22T10:00:00Z', body: pauseBody('staging on hold') });
};

for (const gitlab of [false, true]) {
  const on = gitlab ? 'GitLab' : 'GitHub';

  test(`${on}: with nothing to start or resume, next --json says why for each Issue and who must act`, async () => {
    const r = await next(mk(stuck, { gitlab }));
    assert.deepEqual(r.start, []);
    assert.deepEqual(r.resume, []);
    const why = Object.fromEntries(r.stalled.reasons.map((x) => [x.issue, x]));
    assert.deepEqual(Object.keys(why).map(Number).sort((a, b) => a - b), [5, 6, 7, 8, 9]);
    assert.equal(why[5].who, 'coach');
    assert.equal(why[5].text, 'waits for the Coach: decision on #5');
    assert.equal(why[6].who, 'coach');
    assert.match(why[6].text, /^waits for the Coach: review of (PR #60|MR !60) \(#6\)$/);
    assert.equal(why[7].who, 'you');
    assert.equal(why[7].text, 'waits for you: Run the measurement on a Windows computer and paste the numbers here.');
    assert.equal(why[8].text, 'waits for #99');
    assert.equal(why[9].text, 'paused: #9 (staging on hold)');
    assert.deepEqual(r.stalled.cycles, []);
    assert.match(r.stalled.key, /^stalled:[0-9a-f]{8}$/);
  });

  test(`${on}: next in words has a Stalled block`, async () => {
    const h = mk(stuck, { gitlab });
    assert.equal(await run(['next'], h.ctx), 0);
    assert.match(h.text(), /Stalled: nothing can start or resume\.\n[\s\S]*  #5: waits for the Coach: decision on #5/);
    assert.match(h.text(), /  #8: waits for #99/);
  });

  test(`${on}: it is not stalled while something can start, or while an Issue is being worked`, async () => {
    const startable = await next(mk((w) => { stuck(w); w.issue({ number: 20, title: 'Ready', body: body(1, ['z.mjs']), assignees: ['ana'], labels: ['assigned'] }); }, { gitlab }));
    assert.deepEqual(startable.start.map((s) => s.issue), [20]);
    assert.equal(startable.stalled, null);
    const working = await next(mk((w) => { stuck(w); w.issue({ number: 21, title: 'Working', body: body(1, ['y.mjs']), assignees: ['ana'], labels: ['in progress'] }); }, { gitlab }));
    assert.equal(working.stalled, null, 'an Issue in progress with no step for the person is being worked');
  });

  test(`${on}: a circle of dependencies is named with the Issue whose Depends on changes`, async () => {
    const r = await next(mk((w) => {
      w.issue({ number: 10, title: 'A', body: body(1, ['a.mjs'], '- #11'), assignees: ['ana'], labels: ['blocked'] });
      w.issue({ number: 11, title: 'B', body: body(1, ['b.mjs'], '- #10'), assignees: ['ana'], labels: ['blocked'] });
    }, { gitlab }));
    assert.equal(r.stalled.cycles.length, 1);
    assert.equal(r.stalled.cycles[0].text, 'circular wait: #10 → #11 → #10');
    assert.match(r.stalled.cycles[0].breakIt, /«Depends on» of #10/);
  });

  test(`${on}: the real circle through a shared file: #311 waits for #309, #309 for the file of #318, #318 for #311`, async () => {
    const r = await next(mk((w) => {
      w.issue({ number: 311, title: 'C', body: body(1, ['c.mjs'], '- #309'), assignees: ['ana'], labels: ['blocked'] });
      w.issue({ number: 309, title: 'A', body: body(1, ['lib/cli/run.mjs']), assignees: ['ana'], labels: ['assigned'] });
      w.issue({ number: 318, title: 'B', body: body(1, ['lib/cli/run.mjs'], '- #311'), assignees: ['ana'], labels: ['blocked'], reviews: [318] });
      w.review({ number: 318, draft: true, open: true, commits: ['2026-11-21T10:00:00Z'] });
    }, { gitlab }));
    assert.deepEqual(r.start, []);
    assert.equal(r.stalled.cycles.length, 1);
    assert.equal(r.stalled.cycles[0].text, 'circular wait: #309 → #318 → #311 → #309');
    assert.match(r.stalled.cycles[0].breakIt, /pause #318/);
  });

  test(`${on}: status repeats the summary from the shared folder with no network call, and drops it when it is old`, async () => {
    const h = mk(stuck, { gitlab });
    await next(h);
    h.out.length = 0;
    const before = h.calls().length;
    assert.equal(await run(['status'], h.ctx), 0);
    assert.match(h.text(), /the flow waits for: .*#5: waits for the Coach: decision on #5/);
    assert.equal(h.calls().length, before, 'status reads files only');
    h.out.length = 0;
    await run(['status', '--json'], h.ctx);
    assert.match(JSON.parse(h.text()).stalled.text, /#8: waits for #99/);
    h.ctx.now = () => NOW + 90 * 60 * 1000;
    h.out.length = 0;
    await run(['status'], h.ctx);
    assert.doesNotMatch(h.text(), /the flow waits for/);
  });

  test(`${on}: the Player's watch takes a stalled flow as its baseline, tells it when the set of reasons changes, and not twice`, async () => {
    // Round 1 sees the stalled flow (no wake: the session that started the watch has just seen it); round 2 sees a new reason.
    let h;
    h = mk(stuck, { gitlab, sleep: async () => { h.world.issue({ number: 30, title: 'Asked too', body: body(1, ['f.mjs']), assignees: ['ana'], labels: ['needs decision'] }); } });
    assert.equal(await run(['role', 'player'], h.ctx), 0);
    assert.equal(await run(['next', '--wait'], h.ctx), 0);
    const woke = JSON.parse(h.text());
    assert.deepEqual(woke.actionable.start, []);
    assert.equal(woke.actionable.stalled.reasons.length, 6);
    assert.deepEqual(woke.actionable.keys, [woke.actionable.stalled.key]);
    // The same set for many rounds wakes nobody.
    let rounds = 0;
    const same = mk(stuck, { gitlab, sleep: async () => { rounds += 1; if (rounds > 3) throw new Error('stop'); } });
   assert.equal(await run(['role', 'player'], same.ctx), 0);
    await run(['next', '--wait'], same.ctx).catch(() => {});
    assert.doesNotMatch(same.text(), /actionable/);
    // A restarted watch that was told that key does not tell it again.
    let again = 0;
    const seen = mk((w) => { stuck(w); w.issue({ number: 30, title: 'Asked too', body: body(1, ['f.mjs']), assignees: ['ana'], labels: ['needs decision'] }); }, { gitlab, sleep: async () => { again += 1; if (again > 2) throw new Error('stop'); } });
   assert.equal(await run(['role', 'player'], seen.ctx), 0);
    await run(['next', '--wait', '--seen', woke.actionable.stalled.key], seen.ctx).catch(() => {});
    assert.doesNotMatch(seen.text(), /actionable/);
  });
}
