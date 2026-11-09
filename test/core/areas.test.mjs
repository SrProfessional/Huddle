// Huddle: the pure logic of `huddle areas` (Issue #42): the description of a milestone, the list and the check-up. No network.
import test from 'node:test';
import assert from 'node:assert/strict';
import { areasList, checkOf, describeMilestone } from '../../lib/core/areas.mjs';
import { remainingOf } from '../../lib/core/progress.mjs';

const milestone = (title, description, issues = [], state = 'open') => ({ title, description, state, closedAt: null, issues });
const merged = (number) => ({ number, open: false, merged: true });
const open = (number) => ({ number, open: true, merged: false });

// --- describeMilestone ------------------------------------------------------------------------------------------------------------------

test('a new milestone gets the purpose and the «Huddle remaining» line, which the progress code reads back', () => {
  const text = describeMilestone({ existing: null, remaining: 4, purpose: 'Posts and videos.' });
  assert.equal(text, 'Posts and videos.\n\nHuddle remaining: 4');
  assert.equal(remainingOf(text).remaining, 4);
  assert.equal(describeMilestone({ existing: null, remaining: 0 }), 'Huddle remaining: 0');
});

test('updating without a purpose changes only the remaining line and keeps every other line', () => {
  const existing = 'Posts and videos.\n\nHuddle remaining: 4\n\nOwner: ana\nSee the spec.';
  assert.equal(describeMilestone({ existing, remaining: 7 }), 'Posts and videos.\n\nHuddle remaining: 7\n\nOwner: ana\nSee the spec.');
});

test('with no remaining line yet, one is added after the existing text', () => {
  assert.equal(describeMilestone({ existing: 'Posts and videos.', remaining: 3 }), 'Posts and videos.\n\nHuddle remaining: 3');
  assert.equal(describeMilestone({ existing: '', remaining: 3 }), 'Huddle remaining: 3');
  assert.equal(describeMilestone({ existing: 'Posts.\n', remaining: 3 }), 'Posts.\n\nHuddle remaining: 3');
});

test('a malformed remaining line («four») is the one that is replaced, so the first line still wins', () => {
  const text = describeMilestone({ existing: 'Posts.\nHuddle remaining: four', remaining: 2 });
  assert.equal(text, 'Posts.\nHuddle remaining: 2');
  assert.deepEqual(remainingOf(text), { remaining: 2, missing: false, malformed: false });
});

test('line endings stay as they were: CRLF stays CRLF', () => {
  const existing = 'Posts.\r\n\r\nHuddle remaining: 4\r\nOwner: ana';
  assert.equal(describeMilestone({ existing, remaining: 5 }), 'Posts.\r\n\r\nHuddle remaining: 5\r\nOwner: ana');
  assert.equal(describeMilestone({ existing: 'Posts.\r\n', remaining: 5 }), 'Posts.\r\n\r\nHuddle remaining: 5');
});

test('an explicit purpose replaces the other text, and the remaining line is rewritten', () => {
  const existing = 'Old purpose.\n\nHuddle remaining: 4\n\nOwner: ana';
  assert.equal(describeMilestone({ existing, remaining: 6, purpose: 'New purpose.' }), 'New purpose.\n\nHuddle remaining: 6');
});

// --- areasList --------------------------------------------------------------------------------------------------------------------------

test('areasList gives each area its open and merged counts and its remaining, and counts the Issues with no area', () => {
  const result = areasList({
    milestones: [milestone('Content', 'Huddle remaining: 4', [merged(1), merged(2), open(3)]), milestone('Ads', 'Paid.', [])],
    openIssues: [{ number: 3, title: 'c', milestone: 'Content' }, { number: 8, title: 'tooling', milestone: null }, { number: 9, title: 'Huddle progress', body: '<!-- huddle:progress -->\n# Huddle progress', milestone: null }],
    closedIssues: [{ number: 1, title: 'a', milestone: 'Content' }, { number: 5, title: 'old', milestone: null }],
  });
  assert.deepEqual(result.areas.map((a) => [a.title, a.open, a.merged, a.remaining, a.estimateMissing]), [['Content', 1, 2, 4, false], ['Ads', 0, 0, 0, true]]);
  assert.deepEqual(result.noArea.open.map((i) => i.number), [8]); // the progress Issue is not counted
  assert.deepEqual(result.noArea.closed.map((i) => i.number), [5]);
});

// --- checkOf ----------------------------------------------------------------------------------------------------------------------------

test('checkOf lists Issues with no area, areas with no estimate, malformed estimates and areas whose remaining is 0', () => {
  const list = areasList({
    milestones: [
      milestone('Content', 'Huddle remaining: 4', [open(1)]),
      milestone('Ads', 'Paid.', [open(2)]),
      milestone('Social', 'Huddle remaining: lots', [open(3)]),
      milestone('Done', 'Huddle remaining: 0', [merged(4)]),
      milestone('Empty', 'Huddle remaining: 0', []),
    ],
    openIssues: [{ number: 7, title: 'tooling', milestone: null }],
    closedIssues: [{ number: 6, title: 'old', milestone: null }],
  });
  const check = checkOf(list);
  assert.deepEqual(check.noArea, { open: [{ number: 7, title: 'tooling' }], closed: [{ number: 6, title: 'old' }] });
  assert.deepEqual(check.missingEstimate, ['Ads']);
  assert.deepEqual(check.malformedEstimate, ['Social']);
  assert.deepEqual(check.zeroRemaining, ['Done', 'Empty']);
  assert.deepEqual(check.empty, ['Empty']);
  assert.equal(check.ok, false);
});

test('checkOf lists an area with no estimate line once, even when it also has no Issue', () => {
  const check = checkOf(areasList({ milestones: [milestone('Ads', 'Paid.', []), milestone('Social', 'Huddle remaining: lots', []), milestone('Empty', 'Huddle remaining: 0', [])] }));
  assert.deepEqual(check.missingEstimate, ['Ads']);
  assert.deepEqual(check.malformedEstimate, ['Social']);
  assert.deepEqual(check.empty, ['Empty'], 'only an area that says 0 and has no Issue');
  assert.ok(!check.empty.includes('Ads') && !check.empty.includes('Social'));
});

test('checkOf says ok for a project with every Issue in an area and every estimate written and above 0', () => {
  const list = areasList({ milestones: [milestone('Content', 'Huddle remaining: 2', [open(1)])], openIssues: [{ number: 1, title: 'a', milestone: 'Content' }], closedIssues: [] });
  assert.equal(checkOf(list).ok, true);
});

test('checkOf leaves a closed milestone out of the estimate findings: a finished area has nothing left to estimate', () => {
  const list = areasList({ milestones: [milestone('Shipped', '', [merged(1)], 'closed')], openIssues: [], closedIssues: [] });
  const check = checkOf(list);
  assert.deepEqual([check.missingEstimate, check.zeroRemaining], [[], []]);
});
