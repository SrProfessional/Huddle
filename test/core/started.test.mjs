import test from 'node:test';
import assert from 'node:assert/strict';
import { LABELS, plan, statusOf } from '../../lib/core/issue-status.mjs';

const done = new Map([[40, { state: 'CLOSED', stateReason: 'COMPLETED' }]]);
const body = '## Depends on\n\n- #40\n\n## Branch\n';

test('assigned but not started is «assigned»; started by its session is «in progress»', () => {
  assert.equal(statusOf({ deps: [40], assigned: true, started: false, issues: done }).label, LABELS.assigned.name);
  assert.equal(statusOf({ deps: [40], assigned: true, started: true, issues: done }).label, LABELS.progress.name);
  assert.equal(statusOf({ deps: [40], assigned: false, started: false, issues: done }).label, LABELS.ready.name);
});

test('the session\'s «in progress» label is the sign that it started, and stays', () => {
  const open = [
    { number: 1, body, assignees: [{ login: 'a' }], labels: [{ name: LABELS.progress.name }] },
    { number: 2, body, assignees: [{ login: 'a' }], labels: [{ name: LABELS.ready.name }] },
  ];
  assert.deepEqual(plan({ open, issues: done }).map((c) => [c.number, c.add, c.remove]), [[2, LABELS.assigned.name, [LABELS.ready.name]]]);
});

test('an Issue that lost its dependency or its person drops «in progress»', () => {
  const open = [
    { number: 3, body: '## Depends on\n\n- #41\n\n## Branch\n', assignees: [{ login: 'a' }], labels: [{ name: LABELS.progress.name }] },
    { number: 4, body, assignees: [], labels: [{ name: LABELS.progress.name }] },
  ];
  assert.deepEqual(plan({ open, issues: done }).map((c) => [c.number, c.add, c.remove]), [
    [3, LABELS.blocked.name, [LABELS.progress.name]],
    [4, LABELS.ready.name, [LABELS.progress.name]],
  ]);
});
