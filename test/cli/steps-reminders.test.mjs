// Issue #340 (part 2 of #338), docs/design.md §13, §19, §21: a step that waits for the person is listed by `huddle queue`, `huddle next` (the «Stalled» block)
// and `huddle status`, is asked again with the record of Issue #335 (`huddle asked <n>`), and holds only the work that depends on it. Canned adapters only.
import test from 'node:test';
import assert from 'node:assert/strict';
import { run } from '../../lib/cli/run.mjs';
import { stepsBody } from '../../lib/core/steps.mjs';
import { harness, fakeNow } from './harness.mjs';

const body = (files, deps = '- None') => `## Depends on\n\n${deps}\n\n## Effort\n\n1\n\n## Allowed files\n\n${files.map((f) => `- \`${f}\``).join('\n')}\n`;
const step = (what) => ({ do: what, see: 'The Console is empty.', else: 'Send a screenshot to the Coach.' });
const list = () => stepsBody({ reason: 'only a person can use the tablet', steps: [step('Open the app on the tablet.'), step('Press Play.')] });
const COACH = 'SrProfessional';
const T1 = Date.parse('2026-11-24T10:00:00Z');

const world = (w) => {
  w.issue({ number: 117, title: 'Tablet one', body: body(['lib/tablet.mjs', 'CHANGELOG.md']), assignees: [COACH], labels: ['in progress'] });
  w.comment(117, { id: 1, author: 'ana', body: list(), createdAt: '2026-11-02T09:00:00Z' });
  w.issue({ number: 120, title: 'Waits for 117', body: body(['lib/b.mjs'], '- #117'), assignees: [COACH], labels: ['in review'], reviews: [200] });
  w.review({ number: 200, head: 'aaa1111' });
  w.issue({ number: 121, title: 'Shares a file, in review', body: body(['lib/tablet.mjs']), assignees: [COACH], labels: ['in review'], reviews: [210] });
  w.review({ number: 210, head: 'bbb2222' });
  w.issue({ number: 150, title: 'Independent, in review', body: body(['lib/free.mjs']), assignees: [COACH], labels: ['in review'], reviews: [250] });
  w.review({ number: 250, head: 'ccc3333' });
};
const mk = (extra = {}) => {
  const h = harness({ setup: world, ...extra });
  h.ctx.sharedDir = '/shared';
  h.ctx.now = fakeNow(T1);
  return h;
};
const json = async (h) => { h.out.length = 0; assert.equal(await run(['queue', '--json'], h.ctx), 0); return JSON.parse(h.text()); };

for (const gitlab of [false, true]) {
  const on = gitlab ? 'GitLab' : 'GitHub';

  test(`${on}: queue lists the step that waits for the person, with what it holds`, async () => {
    const h = mk({ gitlab });
    const q = await json(h);
    assert.equal(q.steps.length, 1);
    assert.deepEqual([q.steps[0].issue, q.steps[0].step, q.steps[0].of, q.steps[0].do], [117, 1, 2, 'Open the app on the tablet.']);
    assert.deepEqual(q.steps[0].holds, [120, 121], 'the dependent and the Issue that shares lib/tablet.mjs (CHANGELOG.md alone is no share)');
    h.out.length = 0;
    await run(['queue'], h.ctx);
    assert.match(h.text(), /waits for you: step 1 of 2 of #117: Open the app on the tablet\./);
    assert.match(h.text(), /holds #120, #121/);
    assert.doesNotMatch(h.text(), /Nothing is waiting for the Coach/);
  });

  test(`${on}: only the dependent work is held: its reviews wait, independent reviews go on`, async () => {
    const h = mk({ gitlab });
    const q = await json(h);
    const rev = Object.fromEntries(q.waiting.filter((w) => w.waits === 'review').map((w) => [w.issue, w]));
    assert.equal(rev[120].heldBy, 117);
    assert.equal(rev[120].heldFor, 'step');
    assert.equal(rev[121].heldBy, 117);
    assert.equal(rev[150].heldBy, undefined);
    h.out.length = 0;
    await run(['queue'], h.ctx);
    assert.match(h.text(), /#120  review .*held: waits for the step on #117/);
    assert.doesNotMatch(h.text(), /#150 .*held/);
  });

  test(`${on}: a step is asked again with the record of #335, and the count shows in queue`, async () => {
    const h = mk({ gitlab });
    assert.equal((await json(h)).steps[0].asked, undefined, 'never asked');
    h.out.length = 0;
    assert.equal(await run(['asked', '117'], h.ctx), 0);
    assert.match(h.text(), /#117 asked 1 time, last at 2026-11-24 10:00Z/);
    h.ctx.now = fakeNow(T1 + 3600_000);
    await run(['asked', '117'], h.ctx);
    assert.deepEqual((await json(h)).steps[0].asked, { count: 2, at: '2026-11-24T11:00:00.000Z' });
    h.out.length = 0;
    await run(['queue'], h.ctx);
    assert.match(h.text(), /step 1 of 2 of #117: .*\(asked 2 times, last at 2026-11-24 11:00Z\)/);
  });

  test(`${on}: asking a step keeps the record of a waiting decision, and an Issue with neither is refused`, async () => {
    const h = mk({ gitlab, setup: (w) => { world(w); w.issue({ number: 47, title: 'Which one?', body: body(['x.mjs']), labels: ['needs decision'] }); w.comment(47, { id: 9, author: 'ana', body: '❓ Decision for the Coach: which?', createdAt: '2026-11-10T10:00:00Z' }); } });
    await run(['asked', '47'], h.ctx);
    await run(['asked', '117'], h.ctx);
    const q = await json(h);
    assert.equal(q.waiting.find((w) => w.issue === 47).asked.count, 1);
    assert.equal(q.steps[0].asked.count, 1);
    h.err.length = 0;
    assert.equal(await run(['asked', '150'], h.ctx), 1);
    assert.match(h.errText(), /#150 does not wait for a decision or a step/);
  });

  test(`${on}: a closed list asks nothing and holds nothing`, async () => {
    const h = mk({ gitlab });
    await run(['steps', '117', '--done'], h.ctx);
    await run(['steps', '117', '--done'], h.ctx);
    h.err.length = 0;
    assert.equal(await run(['asked', '117'], h.ctx), 1);
    const q = await json(h);
    assert.equal(q.steps, undefined, 'no key when no step waits');
    assert.ok(q.waiting.every((w) => w.heldBy === undefined));
  });

  test(`${on}: the Stalled block of next says the step`, async () => {
    const h = harness({ gitlab, wrap: (a) => ({ ...a, me: async () => 'ana' }), setup: (w) => {
      w.issue({ number: 117, title: 'Tablet one', body: body(['a.mjs']), assignees: ['ana'], labels: ['in progress'] });
      w.comment(117, { id: 1, author: 'ana', body: list(), createdAt: '2026-11-02T09:00:00Z' });
    } });
    Object.assign(h.ctx, { updateCachePath: '/data/u.json', sharedDir: '/home/.huddle', now: fakeNow(T1), session: { tool: 'claude', id: 'S1' } });
    assert.equal(await run(['next', '--json'], h.ctx), 0);
    const r = JSON.parse(h.text());
    assert.equal(r.stalled.reasons.find((x) => x.issue === 117).text, 'waits for you: step 1 of 2 of #117: Open the app on the tablet.');
    h.out.length = 0;
    await run(['next'], h.ctx);
    assert.match(h.text(), /Stalled: nothing can start or resume\.\n[\s\S]*  #117: waits for you: step 1 of 2 of #117/);
  });

  test(`${on}: status repeats the step in one line, with no network`, async () => {
    const h = mk({ gitlab });
    await run(['queue'], h.ctx);
    h.out.length = 0;
    assert.equal(await run(['status'], h.ctx), 0);
    assert.match(h.text(), /ℹ waits for you: step 1 of 2 of #117: Open the app on the tablet\./);
    h.ctx.now = fakeNow(T1 + 2 * 3600_000);
    h.out.length = 0;
    await run(['status'], h.ctx);
    assert.doesNotMatch(h.text(), /waits for you/, 'older than an hour it is not repeated');
  });
}
