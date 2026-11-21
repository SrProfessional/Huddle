// Issue #240: `huddle next` never offers a start that would put the used points above the capacity, counting an Issue whose review asked
// for changes as active again (docs/design.md §24). Canned adapter only.
import test from 'node:test';
import assert from 'node:assert/strict';
import { run } from '../../lib/cli/run.mjs';
import { harness, request } from './harness.mjs';

const body = (effort, files) => `## Depends on\n\n- None\n\n## Effort\n\n${effort}\n\n## Allowed files\n\n${files.map((f) => `- \`${f}\``).join('\n')}\n`;
const mk = (setup) => {
  const h = harness({ setup, wrap: (a) => ({ ...a, me: async () => 'ana' }) });
  h.ctx.updateCachePath = '/data/u.json';
  return h;
};
const next = async (h) => { h.out.length = 0; assert.equal(await run(['next', '--json'], h.ctx), 0); return JSON.parse(h.text()); };

// Capacity 5: #1 and #2 run (4 points). #3 (2 points) was in review and came back with changes requested: it needs room that is not free.
const sequence = (w) => {
  w.issue({ number: 1, title: 'Runs', body: body(2, ['a.mjs']), assignees: ['ana'], labels: ['in progress'] });
  w.issue({ number: 2, title: 'Runs too', body: body(2, ['b.mjs']), assignees: ['ana'], labels: ['in progress'] });
  w.issue({ number: 3, title: 'Came back', body: body(2, ['c.mjs']), assignees: ['ana'], labels: ['changes requested from Coach'], reviews: [30] });
  w.review({ number: 30 });
  w.comment(30, request(300));
  w.issue({ number: 10, title: 'Ready small', body: body(1, ['d.mjs']), assignees: ['ana'], labels: ['assigned'] });
};

test('an Issue that came back with changes requested and waits for room still holds its points: no new start passes the capacity', async () => {
  const h = mk(sequence);
  const r = await next(h);
  assert.equal(r.used, 6, '#1 + #2 + #3 (active again)');
  assert.deepEqual(r.start, [], '#10 would make it worse');
  assert.deepEqual(r.resume, []);
});

test('over capacity, next starts nothing and says why, in --json and in words', async () => {
  const h = mk(sequence);
  const r = await next(h);
  const why = Object.fromEntries(r.wait.map((w) => [w.issue, w.why]));
  assert.match(why[10], /6 of 5 points in use: finish one first/);
  h.out.length = 0;
  assert.equal(await run(['next'], h.ctx), 0);
  assert.match(h.text(), /Capacity: 5 points, 6 in use/);
  assert.match(h.text(), /Start now: nothing\./);
  assert.match(h.text(), /6 of 5 points in use: finish one first/);
});

test('with room, a waiting request holds its points: a start that would leave it no room waits', async () => {
  const h = mk((w) => {
    w.issue({ number: 1, title: 'Runs', body: body(3, ['a.mjs']), assignees: ['ana'], labels: ['in progress'] });
    w.issue({ number: 3, title: 'Came back', body: body(2, ['c.mjs']), assignees: ['ana'], labels: ['changes requested from Coach'], reviews: [30] });
    w.review({ number: 30 });
    w.comment(30, request(300));
    w.issue({ number: 10, title: 'Ready small', body: body(1, ['d.mjs']), assignees: ['ana'], labels: ['assigned'] });
  });
  const r = await next(h);
  assert.deepEqual(r.resume.map((x) => x.issue), [3], '3 + 2 fits');
  assert.deepEqual(r.start, [], '#10 would make 6 of 5');
  assert.equal(r.used, 5);
});

test('a request that waits for a dependency holds its points, so the start round never reads used above capacity', async () => {
  const h = mk((w) => {
    w.issue({ number: 1, title: 'Runs', body: body(3, ['a.mjs']), assignees: ['ana'], labels: ['in progress'] });
    w.issue({ number: 3, title: 'Came back', body: body(2, ['c.mjs']), assignees: ['ana'], labels: ['changes requested from Coach'], reviews: [30] });
    w.review({ number: 30 });
    w.comment(30, request(300));
    w.issue({ number: 10, title: 'Ready', body: body(2, ['d.mjs']), assignees: ['ana'], labels: ['assigned'] });
  });
  const r = await next(h);
  assert.ok(r.used + r.start.reduce((n, s) => n + s.effort, 0) <= r.capacity);
});
