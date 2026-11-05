import test from 'node:test';
import assert from 'node:assert/strict';
import { LABELS, loadOf, plan, reviewing, statusOf } from '../../lib/core/issue-status.mjs';

const done = new Map([[40, { open: false, merged: true }]]);
const body = '## Depends on\n\n- #40\n\n## Branch\n';

test('an Issue with an open, non-draft PR that resolves it is in review', () => {
  const open = new Set([59]);
  assert.equal(reviewing({ reviews: [59] }, open), true);
  assert.equal(reviewing({ reviews: [12] }, open), false, 'a closed or draft PR does not count');
  assert.equal(reviewing({}, open), false);
});

test('in review beats in progress and assigned, but never a missing dependency', () => {
  assert.equal(statusOf({ deps: [40], assigned: true, started: true, review: true, issues: done }).label, LABELS.review.name);
  assert.equal(statusOf({ deps: [40], assigned: true, started: false, review: true, issues: done }).label, LABELS.review.name);
  assert.equal(statusOf({ deps: [41], assigned: true, started: true, review: true, issues: done }).label, LABELS.blocked.name);
});

test('the plan puts «in review» and drops «assigned» and «in progress»', () => {
  const open = [{ number: 33, body, assignees: ['a'], labels: [LABELS.assigned.name], reviews: [59] }];
  assert.deepEqual(plan({ open, issues: done, openPrs: new Set([59]) }).map((c) => [c.number, c.add, c.remove]), [[33, LABELS.review.name, [LABELS.assigned.name]]]);
});

test('an Issue in review does not count toward the cap, so its person can take the next one', () => {
  const open = [
    { number: 1, assignees: ['ana'], reviews: [9] },
    { number: 2, assignees: ['ana'] },
    { number: 3, assignees: ['luis'] },
  ];
  assert.deepEqual([...loadOf(open, new Set([9]))], [['ana', 1], ['luis', 1]]);
});
