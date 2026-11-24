// Issue #313: an active Issue holds its allowed files against every login, never against another person's points (docs/design.md §22 and §24).
import test from 'node:test';
import assert from 'node:assert/strict';
import { fileWaits, plan } from '../../lib/core/issue-status.mjs';
import { schedule } from '../../lib/core/schedule.mjs';

const body = (effort, files, deps = '- None') => `## Depends on\n\n${deps}\n\n## Effort\n\n${effort}\n\n## Allowed files\n\n${files.map((f) => `- \`${f}\``).join('\n')}\n`;
const issue = (number, login, labels, files, effort = 2) => ({ number, title: `T${number}`, body: body(effort, files), assignees: [login], labels, reviews: [] });
const issues = new Map();

test('schedule: a holder of another login holds files, uses no points and says whose it is', () => {
  const r = schedule({
    active: [{ number: 1, body: body(5, ['a.mjs']), forLogin: 'luis' }],
    candidates: [{ number: 2, body: body(1, ['a.mjs']) }, { number: 3, body: body(5, ['b.mjs']) }],
    capacity: 5,
  });
  assert.equal(r.used, schedule({ candidates: [{ number: 3, body: body(5, ['b.mjs']) }], capacity: 5 }).used, 'the other login holds none of these points');
  assert.match(r.wait[0].why, /^shares a\.mjs with #1, which runs for luis/);
  assert.deepEqual(r.wait[0].clash, { with: 1, file: 'a.mjs' });
  assert.deepEqual(r.start.map((i) => i.number), [3], 'a full-capacity Issue still starts: the other login used none of its room');
});

test('fileWaits: an in-progress Issue of luis holds its file against the candidate of ana', () => {
  const all = [issue(1, 'luis', ['in progress'], ['a.mjs']), issue(2, 'ana', ['assigned'], ['a.mjs']), issue(3, 'ana', ['assigned'], ['b.mjs'])];
  const w = fileWaits({ logins: new Set(['ana']), all, issues });
  assert.deepEqual([...w.keys()], [2]);
  assert.deepEqual(w.get(2), { with: 1, file: 'a.mjs', forLogin: 'luis' });
});

test('fileWaits: the holder never uses the capacity of the other login', () => {
  const all = [issue(1, 'luis', ['in progress'], ['a.mjs'], 5), issue(2, 'ana', ['assigned'], ['b.mjs'], 5)];
  assert.equal(fileWaits({ logins: new Set(['ana']), all, issues, capacityFor: () => 5 }).size, 0, 'no wait for capacity, no wait for a file');
});

test('fileWaits: a request that came back holds files too, one in review or waiting for a decision holds none', () => {
  const requests = new Map([[1, 'pending']]);
  const all = [issue(1, 'luis', ['changes requested from Coach'], ['a.mjs']), issue(2, 'ana', ['assigned'], ['a.mjs'])];
  assert.equal(fileWaits({ logins: new Set(['ana']), all, issues, requests }).get(2).with, 1);
  assert.equal(fileWaits({ logins: new Set(['ana']), all: [issue(1, 'luis', ['in review'], ['a.mjs']), all[1]], issues }).size, 0);
});

test('fileWaits: another login\'s paused Issue holds nothing, a parked one with commits holds', () => {
  const all = [issue(1, 'luis', ['in progress'], ['a.mjs']), issue(2, 'ana', ['assigned'], ['a.mjs'])];
  assert.equal(fileWaits({ logins: new Set(['ana']), all, issues, parked: new Map([[1, { kind: 'paused', holds: false }]]) }).size, 0);
  const held = fileWaits({ logins: new Set(['ana']), all, issues, parked: new Map([[1, { kind: 'parked', holds: true }]]) });
  assert.equal(held.get(2).forLogin, 'luis');
});

test('fileWaits: work of the same login behaves as today (no forLogin)', () => {
  const all = [issue(1, 'ana', ['in progress'], ['a.mjs']), issue(2, 'ana', ['assigned'], ['a.mjs'])];
  assert.deepEqual(fileWaits({ logins: new Set(['ana']), all, issues }).get(2), { with: 1, file: 'a.mjs' });
});

test('fileWaits: two candidates of different logins that have not started never block each other', () => {
  const all = [issue(1, 'luis', ['assigned'], ['a.mjs']), issue(2, 'ana', ['assigned'], ['a.mjs'])];
  assert.equal(fileWaits({ logins: new Set(['ana', 'luis']), all, issues }).size, 0);
});

test('plan: blocked with the reason, and back to assigned when the holder stops being active', () => {
  const all = [issue(1, 'luis', ['in progress'], ['a.mjs']), issue(2, 'ana', ['assigned'], ['a.mjs'])];
  const r = plan({ open: all, issues, all });
  const row = r.find((c) => c.number === 2);
  assert.equal(row.add, 'blocked');
  assert.equal(row.why, 'shares a.mjs with #1, which runs for luis');
  const after = [issue(1, 'luis', ['in review'], ['a.mjs']), { ...issue(2, 'ana', ['blocked'], ['a.mjs']) }];
  const back = plan({ open: after, issues, all: after, openPrs: new Set() });
  assert.equal(back.find((c) => c.number === 2)?.add ?? null, 'assigned');
});
