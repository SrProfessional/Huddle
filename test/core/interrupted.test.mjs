// Issue #304: how `huddle next` knows that the worker of an active Issue is gone (a closed chat, a computer turned off), and the worker marks
// that `labels --started` and `take` leave. Pure functions and an in-memory shared folder; no process, no network.
import test from 'node:test';
import assert from 'node:assert/strict';
import { workerGone, readWorkers, markWorker, clearWorker, IDLE_MS } from '../../lib/core/machine.mjs';

const MIN = 60 * 1000;
const NOW = Date.parse('2026-11-22T12:00:00Z');
const base = { session: 'S2', now: NOW, bootAt: null };

test('a session that is not the marked one and has been idle for the idle window is gone', () => {
  assert.equal(workerGone({ ...base, mark: { session: 'S1', at: NOW - IDLE_MS - MIN }, activityAt: NOW - IDLE_MS - 5 * MIN }), true);
});

test('recent activity of the Issue (a commit, a touched worktree, a fresh mark) means the worker is still there', () => {
  assert.equal(workerGone({ ...base, mark: { session: 'S1', at: NOW - 60 * MIN }, activityAt: NOW - 2 * MIN }), false);
  assert.equal(workerGone({ ...base, mark: { session: 'S1', at: NOW - MIN }, activityAt: NOW - 60 * MIN }), false);
});

test('the marked session itself is never gone for its own check', () => {
  assert.equal(workerGone({ ...base, session: 'S1', mark: { session: 'S1', at: NOW - 3 * 60 * MIN }, activityAt: NOW - 3 * 60 * MIN }), false);
});

test('all the activity older than the last boot of the machine means gone at once, whatever the idle window', () => {
  const bootAt = NOW - 5 * MIN;
  assert.equal(workerGone({ ...base, bootAt, mark: { session: 'S1', at: NOW - 6 * MIN }, activityAt: NOW - 6 * MIN }), true);
  assert.equal(workerGone({ ...base, session: 'S1', bootAt, mark: { session: 'S1', at: NOW - 6 * MIN }, activityAt: null }), true, 'the same session id is no proof after a restart');
});

test('no mark (an Issue started before marks existed) is judged by the activity alone; no activity at all is gone', () => {
  assert.equal(workerGone({ ...base, mark: null, activityAt: NOW - 2 * MIN }), false);
  assert.equal(workerGone({ ...base, mark: null, activityAt: NOW - 3 * 60 * MIN }), true);
  assert.equal(workerGone({ ...base, mark: null, activityAt: null }), true);
});

test('marks are kept per Issue in one file; clearing one keeps the others; a broken file reads as empty', () => {
  const files = new Map();
  const ctx = { readFile: (p) => files.get(p) ?? null, writeFile: (p, t) => files.set(p, t) };
  markWorker(ctx, '/w.json', 7, { session: 'S1', tool: 'claude', at: NOW });
  markWorker(ctx, '/w.json', 8, { session: 'S1', tool: 'claude', at: NOW });
  assert.deepEqual(Object.keys(readWorkers(ctx, '/w.json')), ['7', '8']);
  clearWorker(ctx, '/w.json', 7);
  assert.deepEqual(readWorkers(ctx, '/w.json'), { 8: { session: 'S1', tool: 'claude', at: NOW } });
  files.set('/w.json', '{broken');
  assert.deepEqual(readWorkers(ctx, '/w.json'), {});
});
