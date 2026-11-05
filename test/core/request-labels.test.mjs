import test from 'node:test';
import assert from 'node:assert/strict';
import { LABELS, plan, requestLabels, statusOf } from '../../lib/core/issue-status.mjs';
import { requestState } from '../../lib/core/review-requests.mjs';

// Ported from SocialCortex (PRs #139 and #140, request-labels.test.mjs), with neutral shapes: { author, body, createdAt, taken } and labels as names.
const fence = '```';
const ask = (text) => `🔁 Changes requested\n\n1. Fix the pronunciation hint.\n\n## Prompt for Claude Code\n\n${fence}text\n${text}\n${fence}\n`;
const comment = (author, body, createdAt, taken = false) => ({ author, body, createdAt, taken });
const M = 'SrProfessional';

test('a prompt from the AI Manager newer than the last work is «pending»; once a session took it (👀) it is «taken»', () => {
  assert.equal(requestState({ manager: M, comments: [comment(M, ask('Continue Issue #103.'), '2026-11-05T15:00:00Z')], commits: ['2026-11-05T14:00:00Z'] }), 'pending');
  assert.equal(requestState({ manager: M, comments: [comment(M, ask('Continue Issue #103.'), '2026-11-05T15:00:00Z', true)], commits: ['2026-11-05T14:00:00Z'] }), 'taken');
});

test('a second request not taken yet makes it «pending» again, even if an older one was taken', () => {
  const comments = [comment(M, ask('Fix one.'), '2026-11-05T15:00:00Z', true), comment(M, ask('Fix two.'), '2026-11-05T15:20:00Z')];
  assert.equal(requestState({ manager: M, comments, commits: [] }), 'pending');
});

test('a newer commit or «Ready for review again» means the work moved past the prompt', () => {
  const comments = [comment(M, ask('Continue Issue #95.'), '2026-11-05T15:00:00Z')];
  assert.equal(requestState({ manager: M, comments, commits: ['2026-11-05T15:10:00Z'] }), null);
  const ready = [...comments, comment(M, 'Ready for review again. 3098 tests passed.', '2026-11-05T15:47:00Z')];
  assert.equal(requestState({ manager: M, comments: ready, commits: [] }), null);
});

test('comments without a prompt, or by someone else, ask for nothing', () => {
  const comments = [comment(M, 'Reopened: part 1 closed it by mistake.', '2026-11-05T15:00:00Z'), comment('someone', ask('Do it.'), '2026-11-05T15:01:00Z')];
  assert.equal(requestState({ manager: M, comments, commits: [] }), null);
});

test('a question («❓ Decision for the AI Manager») newer than the prompt means the session waits for the AI Manager, not the other way round', () => {
  const comments = [
    comment(M, ask('Continue Issue #126.'), '2026-11-05T15:00:00Z'),
    comment(M, '❓ Decision for the AI Manager: the sweep needs a read in db/.', '2026-11-05T15:30:00Z'),
  ];
  assert.equal(requestState({ manager: M, comments, commits: [] }), null);
  const answered = [...comments, comment(M, `✅ Decision by the AI Manager\n\n${ask('Continue Issue #126 with option 1.')}`, '2026-11-05T16:00:00Z')];
  assert.equal(requestState({ manager: M, comments: answered, commits: [] }), 'pending');
});

const it = (number, ...labels) => ({ number, labels });

test('the changes label is on only while a request is pending (not yet taken)', () => {
  assert.deepEqual(requestLabels(it(103, LABELS.progress.name), 'pending'), { add: [LABELS.changes.name], remove: [] });
  assert.deepEqual(requestLabels(it(103, LABELS.changes.name), 'taken'), { add: [], remove: [LABELS.changes.name] });
  assert.deepEqual(requestLabels(it(95, LABELS.review.name, LABELS.changes.name), null), { add: [], remove: [LABELS.changes.name] });
  assert.equal(requestLabels(it(7, LABELS.changes.name), 'pending'), null);
  assert.equal(requestLabels(it(8, LABELS.review.name), null), null);
});

test('an answered decision (a request newer than the question, taken or not) takes «needs decision» off', () => {
  assert.deepEqual(requestLabels(it(126, LABELS.progress.name, LABELS.decision.name), 'pending'), { add: [LABELS.changes.name], remove: [LABELS.decision.name] });
  assert.deepEqual(requestLabels(it(126, LABELS.progress.name, LABELS.decision.name), 'taken'), { add: [], remove: [LABELS.decision.name] });
  assert.equal(requestLabels(it(127, LABELS.progress.name, LABELS.decision.name), null), null);
});

// With changes requested the Issue is not «in review» until its session works on it again (Santiago, 2026-11-05).
const done = new Map([[40, { open: false, merged: true }]]);
const base = { deps: [40], assigned: true, issues: done };

test('a PR with a pending request is not «in review»: it has no status label until its session takes the request', () => {
  assert.equal(statusOf({ ...base, review: true, request: 'pending' }).label, null);
  assert.equal(statusOf({ ...base, review: true, request: 'taken' }).label, LABELS.progress.name);
  assert.equal(statusOf({ ...base, review: true, request: null }).label, LABELS.review.name);
});

test('without a PR, a pending request keeps the usual label and a taken one means «in progress»', () => {
  assert.equal(statusOf({ ...base, started: true, request: 'pending' }).label, LABELS.progress.name);
  assert.equal(statusOf({ ...base, started: false, request: 'taken' }).label, LABELS.progress.name);
});

test('plan takes «in review» off while a request is pending, and puts it back when the work is done', () => {
  const body = '## Depends on\n\n- #40\n\n## Branch\n';
  const prs = new Set([131]);
  const open = [{ number: 104, body, assignees: ['a'], labels: [LABELS.review.name], reviews: [131] }];
  assert.deepEqual(plan({ open, issues: done, openPrs: prs, requests: new Map([[104, 'pending']]) }).map((c) => [c.number, c.add, c.remove]), [[104, null, [LABELS.review.name]]]);
  assert.deepEqual(plan({ open, issues: done, openPrs: prs, requests: new Map([[104, 'taken']]) }).map((c) => [c.number, c.add, c.remove]), [[104, LABELS.progress.name, [LABELS.review.name]]]);
  const back = [{ ...open[0], labels: [LABELS.progress.name] }];
  assert.deepEqual(plan({ open: back, issues: done, openPrs: prs, requests: new Map() }).map((c) => [c.number, c.add, c.remove]), [[104, LABELS.review.name, [LABELS.progress.name]]]);
});
