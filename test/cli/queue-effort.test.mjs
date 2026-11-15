// Issue #165: each `review` item of `huddle queue --json` (and of `queue --wait`) carries the Issue's effort (docs/design.md §24), 2 when it
// has none, so the Coach's watch can review several PRs at once within its review capacity. Canned adapter only.
import test from 'node:test';
import assert from 'node:assert/strict';
import { run } from '../../lib/cli/run.mjs';
import { harness, CONFIG } from './harness.mjs';
import { loadConfig } from '../../lib/cli/config.mjs';

const body = (effort) => `## Depends on\n\n- None\n\n${effort ? `## Effort\n\n${effort}\n\n` : ''}## Allowed files\n\n- \`a.mjs\`\n`;
const world = (w) => {
  w.issue({ number: 42, title: 'Big one', body: body('3'), assignees: ['ana'], reviews: [51] });
  w.review({ number: 51, head: 'aaa' });
  w.issue({ number: 43, title: 'No effort', body: body(null), assignees: ['ana'], reviews: [52] });
  w.review({ number: 52, head: 'bbb' });
  w.issue({ number: 47, title: 'A question', body: body('1'), labels: ['needs decision'] });
  w.comment(47, { id: 1, author: 'ana', body: '❓ Decision for the Coach: which?', createdAt: '2026-11-10T10:00:00Z' });
};

test('queue --json: review items carry the Issue\'s effort, 2 when it has none; other items carry none', async () => {
  const h = harness({ setup: world });
  assert.equal(await run(['queue', '--json'], h.ctx), 0);
  const items = JSON.parse(h.text()).waiting;
  assert.deepEqual(items.map((w) => [w.issue, w.waits, w.effort]), [[42, 'review', 3], [43, 'review', 2], [47, 'decision', undefined]]);
});

test('queue --wait prints the effort of the new review items too', async () => {
  const h = harness({ setup: world });
  h.ctx.updateCachePath = '/data/u.json';
  assert.equal(await run(['queue', '--wait', '300', '--seen', '#47'], h.ctx), 0);
  assert.deepEqual(JSON.parse(h.text()).waiting.map((w) => w.effort), [3, 2]);
});

test('review_capacity is read from huddle.json: default 5, at least 1', () => {
  const load = (extra) => loadConfig('/r', () => JSON.stringify({ ...CONFIG, ...extra }));
  assert.equal(load({}).review_capacity, 5);
  assert.equal(load({ review_capacity: 3 }).review_capacity, 3);
  assert.throws(() => load({ review_capacity: 0 }), /review_capacity/);
});
