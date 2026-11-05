import test from 'node:test';
import assert from 'node:assert/strict';
import { dependsOn, LABELS, statusOf, plan } from '../../lib/core/issue-status.mjs';

const body = (deps) => `## Goal\n\nSomething.\n\n## Depends on\n\n${deps}\n\n## Branch\n\n\`x\`\n`;
const closed = new Map([[40, { open: false, merged: true }], [41, { open: true, merged: false }], [9, { open: false, merged: false }]]);

test('reads the issue numbers of the «Depends on» section only', () => {
  assert.deepEqual(dependsOn(body('- #40: its API.\n- #41: the order (see #99 in the text).')), [40, 41, 99]);
  assert.deepEqual(dependsOn(body('- None: it can start now.')), []);
  assert.deepEqual(dependsOn('## Goal\n\nUses #40.\n\n## Branch\n'), null, 'no section: not managed');
  assert.deepEqual(dependsOn(body('- #40\n- #40')), [40], 'no repeats');
  assert.deepEqual(dependsOn(body('- #40').replace(/\n/g, '\r\n')), [40], 'CRLF');
});

test('ready, assigned or blocked', () => {
  assert.deepEqual(statusOf({ deps: [40], assigned: false, issues: closed }), { label: LABELS.ready.name, waiting: [] });
  assert.deepEqual(statusOf({ deps: [40], assigned: true, issues: closed }), { label: LABELS.assigned.name, waiting: [] });
  assert.deepEqual(statusOf({ deps: [40, 41], assigned: true, issues: closed }), { label: LABELS.blocked.name, waiting: [41] });
  assert.deepEqual(statusOf({ deps: [], assigned: false, issues: closed }), { label: LABELS.ready.name, waiting: [] });
});

test('a dependency closed without being completed, or that does not exist, still blocks', () => {
  assert.deepEqual(statusOf({ deps: [9], assigned: false, issues: closed }).waiting, [9]);
  assert.deepEqual(statusOf({ deps: [12345], assigned: false, issues: closed }).waiting, [12345]);
});

test('the plan only changes what is wrong, and leaves other labels alone', () => {
  const open = [
    { number: 50, body: body('- #40'), assignees: [], labels: ['bug'] },
    { number: 51, body: body('- #41'), assignees: [], labels: [LABELS.blocked.name] },
    { number: 52, body: body('- #40'), assignees: ['a'], labels: [LABELS.ready.name] },
    { number: 53, body: '## Goal\n\nNo section.\n', assignees: [], labels: [LABELS.ready.name] },
  ];
  const p = plan({ open, issues: closed });
  assert.deepEqual(p.map((x) => [x.number, x.add, x.remove]), [
    [50, LABELS.ready.name, []],
    [52, LABELS.assigned.name, [LABELS.ready.name]],
  ]);
  assert.ok(!p.some((x) => x.number === 53), 'an issue without «Depends on» is not managed');
});
