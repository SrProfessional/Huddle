import test from 'node:test';
import assert from 'node:assert/strict';
import { LABELS, closedCleanup } from '../../lib/core/issue-status.mjs';

// Ported from SocialCortex (scripts/huddle/test/closed.test.mjs, PR #132), with neutral shapes: labels are plain names.
const names = (...ls) => ls.map((l) => l.name);

test('a closed Issue loses every Huddle label, status and the two set by hand', () => {
  const closed = [{ number: 75, labels: names(LABELS.review, LABELS.changes) }, { number: 36, labels: names(LABELS.progress, LABELS.decision) }];
  assert.deepEqual(closedCleanup(closed), [
    { number: 75, remove: [LABELS.review.name, LABELS.changes.name] },
    { number: 36, remove: [LABELS.progress.name, LABELS.decision.name] },
  ]);
});

test('a closed Issue keeps labels that are not Huddle\'s', () => {
  const closed = [{ number: 12, labels: ['bug', LABELS.assigned.name, 'pronunciation'] }];
  assert.deepEqual(closedCleanup(closed), [{ number: 12, remove: [LABELS.assigned.name] }]);
});

test('a closed Issue with no Huddle label needs no change', () => {
  assert.deepEqual(closedCleanup([{ number: 3, labels: ['bug'] }, { number: 4, labels: [] }, { number: 5 }]), []);
});
