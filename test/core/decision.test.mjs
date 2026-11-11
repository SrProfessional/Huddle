import test from 'node:test';
import assert from 'node:assert/strict';
import { LABELS, waitsForDecision, plan } from '../../lib/core/issue-status.mjs';

const body = '## Depends on\n\n- None\n\n## Branch\n';
const issues = new Map();
const prs = new Set([131]);
const done = new Map([[40, { open: false, merged: true }]]);
const reviewBody = '## Depends on\n\n- #40\n\n## Branch\n';
const rows = (changes) => changes.map((c) => [c.number, c.add, c.remove]);

test('an Issue waiting for a decision is recognized by its label', () => {
  assert.equal(waitsForDecision({ labels: [LABELS.decision.name] }), true);
  assert.equal(waitsForDecision({ labels: ['ready'] }), false);
  assert.equal(waitsForDecision({}), false);
});

// Issue #85: needs decision and changes requested are stop labels. «in progress» (the session works) and «in review» (the AI Manager works)
// never sit next to them. Those two labels are still never put or removed by the status labels.

test('needs decision takes «in progress» off, and the decision label itself is left alone', () => {
  const open = [{ number: 5, body, assignees: ['a'], labels: [LABELS.decision.name, LABELS.progress.name] }];
  assert.deepEqual(rows(plan({ open, issues })), [[5, null, [LABELS.progress.name]]]);
});

test('needs decision takes «in review» off an Issue whose PR is open', () => {
  const open = [{ number: 6, body: reviewBody, assignees: ['a'], labels: [LABELS.decision.name, LABELS.review.name], reviews: [131] }];
  assert.deepEqual(rows(plan({ open, issues: done, openPrs: prs })), [[6, null, [LABELS.review.name]]]);
});

test('an Issue that waits for a decision gets no status label at all, so nothing comes back next run', () => {
  const open = [{ number: 5, body, assignees: ['a'], labels: [LABELS.decision.name] }];
  assert.deepEqual(plan({ open, issues }), []);
  const withPr = [{ number: 6, body: reviewBody, assignees: ['a'], labels: [LABELS.decision.name], reviews: [131] }];
  assert.deepEqual(plan({ open: withPr, issues: done, openPrs: prs }), []);
});

test('once the AI Manager answered, the usual status comes back by itself', () => {
  const open = [{ number: 5, body, assignees: ['a'], labels: [LABELS.decision.name] }];
  assert.deepEqual(rows(plan({ open, issues, requests: new Map([[5, 'taken']]) })), [[5, LABELS.progress.name, []]]);
  assert.deepEqual(plan({ open, issues, requests: new Map([[5, 'pending']]) }), [], 'pending: only the changes label shows');
  const withPr = [{ number: 6, body: reviewBody, assignees: ['a'], labels: [LABELS.decision.name], reviews: [131] }];
  assert.deepEqual(rows(plan({ open: withPr, issues: done, openPrs: prs, requests: new Map([[6, 'taken']]) })), [[6, LABELS.progress.name, []]]);
});

test('a blocked Issue keeps its own rules next to needs decision', () => {
  const open = [{ number: 7, body: '## Depends on\n\n- #99\n\n## Branch\n', assignees: ['a'], labels: [LABELS.decision.name, LABELS.progress.name] }];
  assert.deepEqual(rows(plan({ open, issues: new Map([[99, { open: true, merged: false }]]) })), [[7, LABELS.blocked.name, []]]);
});

test('the changes-requested label is left alone by the status labels, and no status label sits next to a pending request', () => {
  const open = [{ number: 6, body, assignees: ['a'], labels: [LABELS.changes.name, LABELS.progress.name] }];
  assert.deepEqual(rows(plan({ open, issues, requests: new Map([[6, 'pending']]) })), [[6, null, [LABELS.progress.name]]]);
  assert.deepEqual(plan({ open: [{ ...open[0], labels: [LABELS.changes.name] }], issues, requests: new Map([[6, 'pending']]) }), []);
});
