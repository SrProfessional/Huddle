import test from 'node:test';
import assert from 'node:assert/strict';
import { assignments } from '../../lib/core/issue-status.mjs';

const ready = (number) => ({ number, label: 'ready' });

test('each ready Issue goes to whoever has the fewest open Issues, oldest Issue first', () => {
  const load = new Map([['ana', 1], ['luis', 0]]);
  assert.deepEqual(assignments({ ready: [ready(41), ready(33)], team: ['ana', 'luis'], load }), [
    { number: 33, to: 'luis' },
    { number: 41, to: 'ana' },
  ]);
});

test('a tie goes to the first person in the team list, and the load grows as it assigns', () => {
  const load = new Map();
  assert.deepEqual(assignments({ ready: [ready(1), ready(2), ready(3)], team: ['ana', 'luis'], load }).map((a) => a.to), ['ana', 'luis', 'ana']);
});

test('no team, no assignments: the switch is an empty list', () => {
  assert.deepEqual(assignments({ ready: [ready(1)], team: [], load: new Map() }), []);
});

test('nobody gets more than the cap: what does not fit stays ready', () => {
  const load = new Map([['ana', 2], ['luis', 1]]);
  assert.deepEqual(assignments({ ready: [ready(1), ready(2), ready(3)], team: ['ana', 'luis'], load, max: 2 }), [{ number: 1, to: 'luis' }]);
  assert.deepEqual(assignments({ ready: [ready(1)], team: ['ana'], load: new Map([['ana', 2]]), max: 2 }), []);
});

test('only people in the team list count; others with open Issues are ignored', () => {
  const load = new Map([['ana', 5], ['outsider', 0]]);
  assert.deepEqual(assignments({ ready: [ready(7)], team: ['ana'], load }), [{ number: 7, to: 'ana' }]);
});
