// Issue #294: the board's `blocked` label follows the pause and parking rules of `huddle next` (Issue #291, docs/design.md §22 and §24).
// Canned neutral shapes: the status rules are the same for GitHub and GitLab, whose adapters both produce them (lib/platform).
import test from 'node:test';
import assert from 'node:assert/strict';
import { fileWaits, plan, LABELS } from '../../lib/core/issue-status.mjs';

const body = (files, deps = 'None', effort = 1) => `## Depends on\n\n${deps}\n\n## Effort\n\n${effort}\n\n## Allowed files\n\n${files.map((f) => `- \`${f}\``).join('\n')}\n`;
const issue = (number, files, extra = {}) => ({ number, assignees: ['ana'], labels: [], reviews: [], body: body(files, extra.deps), ...extra });
const none = new Map();

for (const platform of ['github', 'gitlab']) {
  test(`${platform}: an Issue that waits only for the files of a paused Issue with no commits is not blocked`, () => {
    const paused = issue(1, ['a.mjs'], { labels: [LABELS.progress.name] });
    const next = issue(2, ['a.mjs']);
    const parked = new Map([[1, { kind: 'paused', holds: false }]]);
    // Before: the paused one counts as active work and holds the file.
    assert.equal(fileWaits({ logins: new Set(['ana']), all: [paused, next], issues: none }).get(2)?.with, 1);
    assert.equal(fileWaits({ logins: new Set(['ana']), all: [paused, next], issues: none, parked }).has(2), false);
    const changes = plan({ open: [paused, next], issues: none, parked });
    assert.equal(changes.find((c) => c.number === 2).add, LABELS.assigned.name, 'the next Issue is assigned, as huddle next offers it, not blocked');
  });

  test(`${platform}: a paused or parked Issue that has commits still holds its files`, () => {
    const paused = issue(1, ['a.mjs'], { labels: [LABELS.progress.name] });
    const next = issue(2, ['a.mjs']);
    const parked = new Map([[1, { kind: 'paused', holds: true }]]);
    assert.equal(fileWaits({ logins: new Set(['ana']), all: [paused, next], issues: none, parked }).get(2)?.with, 1);
    const change = plan({ open: [paused, next], issues: none, parked }).find((c) => c.number === 2);
    assert.equal(change.add, LABELS.blocked.name);
    assert.match(change.why, /shares a\.mjs with #1, which is paused/);
  });

  test(`${platform}: a parked Issue that waits for a decision with no commits holds nothing`, () => {
    const stopped = issue(1, ['a.mjs'], { labels: [LABELS.progress.name, LABELS.decision.name] });
    const next = issue(2, ['a.mjs']);
    const parked = new Map([[1, { kind: 'parked', holds: false }]]);
    assert.equal(fileWaits({ logins: new Set(['ana']), all: [stopped, next], issues: none, parked }).has(2), false);
  });

  test(`${platform}: a paused Issue is never offered as a candidate against another file holder`, () => {
    const holder = issue(1, ['a.mjs'], { labels: [LABELS.progress.name] });
    const pausedFresh = issue(2, ['a.mjs']);
    const parked = new Map([[2, { kind: 'paused', holds: false }]]);
    assert.equal(fileWaits({ logins: new Set(['ana']), all: [holder, pausedFresh], issues: none, parked }).has(2), false);
  });

  test(`${platform}: a paused dependency keeps blocked, and the reason says it is paused`, () => {
    const dep = issue(1, ['a.mjs'], { labels: [LABELS.progress.name] });
    const next = issue(2, ['b.mjs'], { deps: '- #1' });
    const issues = new Map([[1, { open: true, merged: false }]]);
    const parked = new Map([[1, { kind: 'paused', holds: false }]]);
    const change = plan({ open: [dep, next], issues, parked }).find((c) => c.number === 2);
    assert.equal(change.add, LABELS.blocked.name);
    assert.deepEqual(change.waiting, [1]);
    assert.match(change.why, /waits for #1, which is paused/);
    const plain = plan({ open: [dep, next], issues }).find((c) => c.number === 2);
    assert.equal(plain.why, undefined, 'without a pause the reason is the usual one');
  });
}
