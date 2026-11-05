import test from 'node:test';
import assert from 'node:assert/strict';
import { LABELS, plan, statusOf } from '../../lib/core/issue-status.mjs';

const done = new Map([[40, { open: false, merged: true }]]);
const body = '## Depends on\n\n- #40\n\n## Branch\n';

test('assigned but not started is «assigned»; started by its session is «in progress»', () => {
  assert.equal(statusOf({ deps: [40], assigned: true, started: false, issues: done }).label, LABELS.assigned.name);
  assert.equal(statusOf({ deps: [40], assigned: true, started: true, issues: done }).label, LABELS.progress.name);
  assert.equal(statusOf({ deps: [40], assigned: false, started: false, issues: done }).label, LABELS.ready.name);
});

test('the session\'s «in progress» label is the sign that it started, and stays', () => {
  const open = [
    { number: 1, body, assignees: ['a'], labels: [LABELS.progress.name] },
    { number: 2, body, assignees: ['a'], labels: [LABELS.ready.name] },
  ];
  assert.deepEqual(plan({ open, issues: done }).map((c) => [c.number, c.add, c.remove]), [[2, LABELS.assigned.name, [LABELS.ready.name]]]);
});

// Ported from SocialCortex (PR #138), with neutral shapes.
test('a started Issue that gets a new dependency keeps «in progress» next to «blocked»; one that lost its person drops it', () => {
  const open = [
    { number: 3, body: '## Depends on\n\n- #41\n\n## Branch\n', assignees: ['a'], labels: [LABELS.progress.name] },
    { number: 4, body, assignees: [], labels: [LABELS.progress.name] },
  ];
  assert.deepEqual(plan({ open, issues: done }).map((c) => [c.number, c.add, c.remove]), [
    [3, LABELS.blocked.name, []],
    [4, LABELS.ready.name, [LABELS.progress.name]],
  ]);
});

test('a started Issue that was blocked goes back to «in progress», not «assigned», once its dependency is merged', () => {
  const open = [{ number: 5, body, assignees: ['a'], labels: [LABELS.blocked.name, LABELS.progress.name] }];
  assert.deepEqual(plan({ open, issues: done }).map((c) => [c.number, c.add, c.remove]), [[5, null, [LABELS.blocked.name]]]);
});

test('a blocked Issue that never started gets only «blocked»', () => {
  const open = [{ number: 6, body: '## Depends on\n\n- #41\n\n## Branch\n', assignees: ['a'], labels: [LABELS.assigned.name] }];
  assert.deepEqual(plan({ open, issues: done }).map((c) => [c.number, c.add, c.remove]), [[6, LABELS.blocked.name, [LABELS.assigned.name]]]);
});
