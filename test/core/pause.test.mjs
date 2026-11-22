// Issue #291: a pause is a comment (a visible line and a hidden marker); a resume comment ends it; the newest wins (docs/design.md §24).
import test from 'node:test';
import assert from 'node:assert/strict';
import { pauseBody, resumeBody, newestPause } from '../../lib/core/pause.mjs';
import { schedule } from '../../lib/core/schedule.mjs';

const at = (n) => `2026-11-22T10:0${n}:00Z`;
const c = (body, n, author = 'SrProfessional') => ({ body, createdAt: at(n), author });
const eff = (n, files) => `## Effort\n\n${n}\n\n## Allowed files\n\n${files.map((f) => `- \`${f}\``).join('\n')}\n`;

test('the pause comment has the visible line, the reason and the hidden marker; the resume has its own marker', () => {
  assert.match(pauseBody('staging on hold'), /^⏸️ Paused by the Coach: staging on hold\n/);
  assert.match(pauseBody('staging on hold'), /<!-- huddle-paused -->/);
  assert.match(pauseBody(''), /Paused by the Coach: no reason given/);
  assert.match(resumeBody(), /<!-- huddle-resumed -->/);
});

test('the newest of the two markers wins; none means no pause', () => {
  assert.equal(newestPause([]), null);
  assert.equal(newestPause([c('hello', 1)]), null);
  assert.deepEqual(newestPause([c(pauseBody('why'), 1)]), { paused: true, reason: 'why' });
  assert.deepEqual(newestPause([c(pauseBody('why'), 1), c(resumeBody(), 2)]), { paused: false, reason: null });
  assert.equal(newestPause([c(resumeBody(), 1), c(pauseBody('again'), 2)]).paused, true);
  assert.equal(newestPause([c(resumeBody(), 3), c(pauseBody('older, listed later'), 2)]).paused, false);
});

test('only the Coach counts when the Coach is known', () => {
  assert.equal(newestPause([c(pauseBody('x'), 1, 'ana')], { manager: 'SrProfessional' }), null);
  assert.equal(newestPause([c(pauseBody('x'), 1, 'srprofessional')], { manager: 'SrProfessional' }).paused, true);
});

test('schedule: a parked Issue uses no points; it holds its files only when it says so', () => {
  const parked = (files) => ({ number: 5, body: eff(2, ['a.mjs']), parked: 'paused', holds: files });
  const live = { number: 6, body: eff(2, ['b.mjs']) };
  const cand = (n, f) => ({ number: n, body: eff(3, [f]) });
  const free = schedule({ active: [parked(false), live], candidates: [cand(10, 'a.mjs')], capacity: 5 });
  assert.equal(free.used, 5, '#6 (2) and #10 (3): the parked one adds nothing');
  assert.deepEqual(free.start.map((i) => i.number), [10], 'no branch: its file does not hold and its points are free');
  const held = schedule({ active: [parked(true), live], candidates: [cand(10, 'a.mjs')], capacity: 5 });
  assert.equal(held.used, 2, 'still no points');
  assert.deepEqual(held.start, []);
  assert.equal(held.wait[0].why, 'shares a.mjs with #5, which is paused: it waits until that one is done');
});

test('schedule: the «points in use» messages read the total the caller gives, so they read the same as the total', () => {
  const r = schedule({ active: [{ number: 1, body: eff(2, ['a']) }], candidates: [{ number: 2, body: eff(2, ['b']) }, { number: 3, body: eff(2, ['c']) }], capacity: 5, total: 8 });
  assert.deepEqual(r.start.map((i) => i.number), [2]);
  assert.equal(r.wait[0].why, 'no room: 8 of 5 points in use, it needs 2');
});
