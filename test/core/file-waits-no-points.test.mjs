// Issue #303: an Issue that waits only for a file held by another Issue that counts uses none of the Player's points. The pure settling of
// those waits: who really waits, and a circle of file waits resolved by the scheduler's order (older Issue number first).
import test from 'node:test';
import assert from 'node:assert/strict';
import { settleFileWaits, schedule } from '../../lib/core/schedule.mjs';

const link = (from, to, file = 'a.mjs') => ({ from, to, file });
const body = (effort, files) => `## Effort\n\n${effort}\n\n## Allowed files\n\n${files.map((f) => `- \`${f}\``).join('\n')}\n`;

test('no links: nobody waits and there is no circle', () => {
  assert.deepEqual(settleFileWaits([]), { waiting: [], circles: [] });
});

test('a wait for a file held by an Issue that counts is a file wait', () => {
  const r = settleFileWaits([link(257, 273, 'src/api/')]);
  assert.deepEqual(r.waiting, [link(257, 273, 'src/api/')]);
  assert.deepEqual(r.circles, []);
});

test('a holder that itself waits does not count: the one behind it counts again', () => {
  const r = settleFileWaits([link(10, 20), link(20, 30)]);
  assert.deepEqual(r.waiting.map((l) => l.from), [20]);
});

test('a circle of file waits is resolved by the older Issue number first, and says so', () => {
  const r = settleFileWaits([link(20, 10, 'x.mjs'), link(10, 20, 'y.mjs')]);
  assert.deepEqual(r.waiting, [link(20, 10, 'x.mjs')], '#10 goes first and does not wait; #20 waits for it');
  assert.equal(r.circles.length, 1);
  assert.match(r.circles[0], /file waits in a circle: #10 → #20 → #10/);
  assert.match(r.circles[0], /#10 goes first \(the older Issue\)/);
});

test('a circle of three is broken once and the rest keep waiting', () => {
  const r = settleFileWaits([link(30, 10), link(10, 20), link(20, 30)]);
  assert.deepEqual(r.waiting.map((l) => `${l.from}>${l.to}`), ['30>10'], '#10 goes first; #30 waits for it; #20 would wait for #30, which does not count');
  assert.equal(r.circles.length, 1);
});

test('breaking a circle drops only its own link: the older Issue keeps waiting for a holder outside it', () => {
  const r = settleFileWaits([link(10, 20, 'x'), link(10, 30, 'y'), link(20, 10, 'z')]);
  assert.deepEqual(r.waiting.map((l) => `${l.from}>${l.to}`), ['10>30']);
});

test('a dependency or capacity wait is untouched: schedule still reports its why, with no clash', () => {
  const r = schedule({ active: [{ number: 1, body: body(3, ['a']) }], candidates: [{ number: 2, body: body(3, ['b']) }], capacity: 5 });
  assert.equal(r.wait[0].clash, undefined);
  assert.match(r.wait[0].why, /no room/);
});

test('schedule: an active Issue marked fileWait uses no points but still holds its files', () => {
  const r = schedule({ active: [{ number: 5, body: body(3, ['a.mjs']), fileWait: true }], candidates: [{ number: 6, body: body(3, ['b.mjs']) }, { number: 7, body: body(2, ['a.mjs']) }], capacity: 5 });
  assert.equal(r.used, 3, 'only the start of #6 counts');
  assert.deepEqual(r.start.map((i) => i.number), [6]);
  assert.match(r.wait.find((w) => w.issue === 7).why, /shares a\.mjs with #5/);
});
