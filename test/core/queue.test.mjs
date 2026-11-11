// Issue #88, docs/design.md §19: what waits for the AI Manager. Pure: no network.
import test from 'node:test';
import assert from 'node:assert/strict';
import { waitingFor } from '../../lib/core/queue.mjs';

const MANAGED = '## Depends on\n\nNone.\n';
const it = (number, extra = {}) => ({ number, title: `Issue ${number}`, body: MANAGED, labels: [], assignees: [], reviews: [], ...extra });

test('an open Issue with an open non-draft PR and no request waits for review, with its PR', () => {
  const out = waitingFor({ open: [it(42, { reviews: [51] })], openPrs: new Set([51]), requests: new Map() });
  assert.deepEqual(out, [{ issue: 42, title: 'Issue 42', waits: 'review', pr: 51 }]);
});

test('a pending or a taken request is the developer\'s turn: not a review', () => {
  const open = [it(1, { reviews: [11] }), it(2, { reviews: [12] })];
  const requests = new Map([[1, 'pending'], [2, 'taken']]);
  assert.deepEqual(waitingFor({ open, openPrs: new Set([11, 12]), requests }), []);
});

test('a PR that is not open (or is a draft: openPrs lists neither) is not a review', () => {
  assert.deepEqual(waitingFor({ open: [it(1, { reviews: [11] })], openPrs: new Set(), requests: new Map() }), []);
});

test('with several PRs, the one that is open is named', () => {
  const out = waitingFor({ open: [it(1, { reviews: [10, 11] })], openPrs: new Set([11]), requests: new Map() });
  assert.equal(out[0].pr, 11);
});

test('needs decision with no request waits for a decision; once answered (any request state) it does not', () => {
  const open = [it(7, { labels: ['needs decision'] })];
  assert.deepEqual(waitingFor({ open, openPrs: new Set(), requests: new Map() }), [{ issue: 7, title: 'Issue 7', waits: 'decision' }]);
  assert.deepEqual(waitingFor({ open, openPrs: new Set(), requests: new Map([[7, null]]) }).map((x) => x.waits), ['decision']);
  assert.deepEqual(waitingFor({ open, openPrs: new Set(), requests: new Map([[7, 'pending']]) }), []);
  assert.deepEqual(waitingFor({ open, openPrs: new Set(), requests: new Map([[7, 'taken']]) }), []);
});

test('needs triage waits for triage', () => {
  const open = [it(9, { labels: ['bug', 'needs triage'], body: 'A raw report' })];
  assert.deepEqual(waitingFor({ open, openPrs: new Set(), requests: new Map() }), [{ issue: 9, title: 'Issue 9', waits: 'triage' }]);
});

test('review comes from the PR data, not from the «in review» label text', () => {
  assert.deepEqual(waitingFor({ open: [it(1, { labels: ['in review'] })], openPrs: new Set(), requests: new Map() }), []);
  assert.equal(waitingFor({ open: [it(2, { reviews: [3] })], openPrs: new Set([3]), requests: new Map() }).length, 1);
});

test('an Issue with no «Depends on» section is listed for triage and decision, but not for review (the rule of plan: it is not managed)', () => {
  const body = 'No sections at all';
  const open = [it(1, { body, labels: ['needs triage'] }), it(2, { body, labels: ['needs decision'] }), it(3, { body, reviews: [30] })];
  const out = waitingFor({ open, openPrs: new Set([30]), requests: new Map() });
  assert.deepEqual(out.map((x) => [x.issue, x.waits]), [[1, 'triage'], [2, 'decision']]);
});

test('an Issue appears once: triage over decision over review', () => {
  const open = [
    it(1, { labels: ['needs triage', 'needs decision'], reviews: [10] }),
    it(2, { labels: ['needs decision'], reviews: [20] }),
  ];
  const out = waitingFor({ open, openPrs: new Set([10, 20]), requests: new Map() });
  assert.deepEqual(out.map((x) => [x.issue, x.waits]), [[1, 'triage'], [2, 'decision']]);
});

test('the result is sorted by Issue number', () => {
  const open = [it(53, { labels: ['needs triage'] }), it(42, { reviews: [51] }), it(47, { labels: ['needs decision'] })];
  const out = waitingFor({ open, openPrs: new Set([51]), requests: new Map() });
  assert.deepEqual(out.map((x) => x.issue), [42, 47, 53]);
});

test('nothing waiting is an empty list', () => {
  assert.deepEqual(waitingFor({ open: [it(1), it(2, { assignees: ['ana'] })], openPrs: new Set(), requests: new Map() }), []);
  assert.deepEqual(waitingFor({ open: [], openPrs: new Set(), requests: new Map() }), []);
});

test('the defaults are an empty set of PRs and no requests', () => {
  assert.deepEqual(waitingFor({ open: [it(1, { labels: ['needs decision'] })] }).map((x) => x.waits), ['decision']);
});
