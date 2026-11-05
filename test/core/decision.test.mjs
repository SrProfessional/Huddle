import test from 'node:test';
import assert from 'node:assert/strict';
import { LABELS, waitsForDecision, plan } from '../../lib/core/issue-status.mjs';

const body = '## Depends on\n\n- None\n\n## Branch\n';
const issues = new Map();

test('an Issue waiting for a decision is recognized by its label', () => {
  assert.equal(waitsForDecision({ labels: [{ name: LABELS.decision.name }] }), true);
  assert.equal(waitsForDecision({ labels: [{ name: 'ready' }] }), false);
  assert.equal(waitsForDecision({}), false);
});

test('the decision label is left alone by the status labels', () => {
  const open = [{ number: 5, body, assignees: [{ login: 'a' }], labels: [{ name: LABELS.decision.name }, { name: LABELS.progress.name }] }];
  assert.deepEqual(plan({ open, issues }), []);
});

test('the changes-requested label is left alone by the status labels', () => {
  const open = [{ number: 6, body, assignees: [{ login: 'a' }], labels: [{ name: LABELS.changes.name }, { name: LABELS.progress.name }] }];
  assert.deepEqual(plan({ open, issues }), []);
});
