// Issue #302: the pure finder of a circle of waits and its words.
import test from 'node:test';
import assert from 'node:assert/strict';
import { findCycle, cycleText } from '../../lib/core/schedule.mjs';

const dep = (from, to) => ({ from, to, kind: 'dependency' });
const file = (from, to, f) => ({ from, to, kind: 'file', file: f });

test('no links, or a chain that ends, has no circle', () => {
  assert.equal(findCycle([]), null);
  assert.equal(findCycle([dep(1, 2), dep(2, 3)]), null);
});

test('a circle of two and a circle that a tail leads into are found, with the links in walking order', () => {
  assert.deepEqual(findCycle([dep(5, 6), dep(6, 5)]).path, [5, 6, 5]);
  const c = findCycle([dep(1, 5), dep(5, 6), dep(6, 7), dep(7, 5)]);
  assert.deepEqual(c.path, [5, 6, 7, 5]);
  assert.equal(c.links.length, 3);
});

test('the real case: #311 waits for #309, #309 for #318 through a file, #318 for #311', () => {
  const c = findCycle([dep(311, 309), file(309, 318, 'lib/cli/run.mjs'), dep(318, 311)]);
  assert.deepEqual(c.path, [309, 318, 311, 309]);
  const t = cycleText(c);
  assert.equal(t.text, 'circular wait: #309 → #318 → #311 → #309');
  assert.match(t.breakIt, /pause #318 .*#309 no longer waits for lib\/cli\/run\.mjs/);
});

test('a circle of dependencies only names the Depends on to change', () => {
  const t = cycleText(findCycle([dep(2, 3), dep(3, 2)]));
  assert.equal(t.text, 'circular wait: #2 → #3 → #2');
  assert.match(t.breakIt, /«Depends on» of #2, which waits for #3/);
});
