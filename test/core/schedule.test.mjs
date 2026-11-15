// Issue #164: which of a Player's assigned Issues start now and which wait, by effort and capacity (docs/design.md §24).
// `schedule` is pure: the CLI gives it the active Issues (in progress or with changes requested) and the candidates (assigned, ready, no stop label,
// not a Design Issue).
import test from 'node:test';
import assert from 'node:assert/strict';
import { schedule } from '../../lib/core/schedule.mjs';

const body = (effort, files = [`src/f${Math.random().toString(36).slice(2)}.mjs`]) => `## Depends on\n\n- None\n\n## Effort\n\n${effort}\n\n## Allowed files\n\n${files.map((f) => `- \`${f}\``).join('\n')}\n`;
const it = (number, effort, extra = {}) => ({ number, body: body(effort, extra.files), blocking: false, ...extra });
const starts = (r) => r.start.map((i) => i.number);
const waits = (r) => r.wait.map((w) => w.issue);

test('the capacity fills by effort, oldest first', () => {
  const r = schedule({ active: [], candidates: [it(12, 2), it(10, 3), it(11, 1)], capacity: 5 });
  assert.deepEqual(starts(r), [10, 11]);
  assert.deepEqual(waits(r), [12]);
  assert.match(r.wait[0].why, /no room: 4 of 5 points in use, it needs 2/);
});

test('a smaller later Issue still goes in when it fits', () => {
  const r = schedule({ active: [], candidates: [it(10, 3), it(11, 3), it(12, 2)], capacity: 5 });
  assert.deepEqual(starts(r), [10, 12]);
  assert.deepEqual(waits(r), [11]);
});

test('blocking bugs go first', () => {
  const r = schedule({ active: [], candidates: [it(10, 3), it(20, 3, { blocking: true })], capacity: 5 });
  assert.deepEqual(starts(r), [20]);
  assert.deepEqual(waits(r), [10]);
});

test('active Issues use room; their effort counts', () => {
  const r = schedule({ active: [it(5, 3)], candidates: [it(10, 2), it(11, 1)], capacity: 5 });
  assert.deepEqual(starts(r), [10]);
  assert.match(r.wait[0].why, /no room: 5 of 5 points in use/);
});

test('two Issues that share an allowed file never run at once', () => {
  const r = schedule({ active: [it(5, 1, { files: ['api/users.mjs'] })], candidates: [it(10, 1, { files: ['api/users.mjs', 'api/x.mjs'] }), it(11, 1, { files: ['web/a.tsx'] })], capacity: 5 });
  assert.deepEqual(starts(r), [11]);
  assert.match(r.wait.find((w) => w.issue === 10).why, /shares api\/users\.mjs with #5/);
  const among = schedule({ active: [], candidates: [it(10, 1, { files: ['a.mjs'] }), it(11, 1, { files: ['a.mjs'] })], capacity: 5 });
  assert.deepEqual(starts(among), [10]);
  assert.match(among.wait[0].why, /shares a\.mjs with #10/);
});

test('an Issue bigger than the whole capacity runs alone, only when nothing else is active', () => {
  const alone = schedule({ active: [], candidates: [it(10, 3), it(11, 1)], capacity: 2 });
  assert.deepEqual(starts(alone), [10]);
  assert.deepEqual(waits(alone), [11]);
  const busy = schedule({ active: [it(5, 1)], candidates: [it(10, 3)], capacity: 2 });
  assert.deepEqual(starts(busy), []);
  assert.match(busy.wait[0].why, /bigger than the capacity \(3 of 2\): it runs alone/);
});

test('nothing to do: empty lists', () => {
  assert.deepEqual(schedule({ active: [], candidates: [], capacity: 5 }), { start: [], wait: [], used: 0, capacity: 5 });
});
