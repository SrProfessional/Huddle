import test from 'node:test';
import assert from 'node:assert/strict';
import { LABELS, requestLabels } from '../../lib/core/issue-status.mjs';
import { awaitsWork } from '../../lib/core/review-requests.mjs';

// Ported from SocialCortex (PR #139, request-labels.test.mjs), with neutral shapes: { author, body, createdAt, taken } and labels as names.
const fence = '```';
const ask = (text) => `🔁 Changes requested\n\n1. Fix the pronunciation hint.\n\n## Prompt for Claude Code\n\n${fence}text\n${text}\n${fence}\n`;
const comment = (author, body, createdAt, taken = false) => ({ author, body, createdAt, taken });
const M = 'SrProfessional';

test('a prompt from the AI Manager newer than the last work awaits work, even once a session took it (👀)', () => {
  const comments = [comment(M, ask('Continue Issue #103.'), '2026-11-05T15:00:00Z', true)];
  assert.equal(awaitsWork({ manager: M, comments, commits: ['2026-11-05T14:00:00Z'] }), true);
});

test('a newer commit or «Ready for review again» means the work moved past the prompt', () => {
  const comments = [comment(M, ask('Continue Issue #95.'), '2026-11-05T15:00:00Z')];
  assert.equal(awaitsWork({ manager: M, comments, commits: ['2026-11-05T15:10:00Z'] }), false);
  const ready = [...comments, comment(M, 'Ready for review again. 3098 tests passed.', '2026-11-05T15:47:00Z')];
  assert.equal(awaitsWork({ manager: M, comments: ready, commits: [] }), false);
});

test('comments without a prompt, or by someone else, await nothing', () => {
  const comments = [comment(M, 'Reopened: part 1 closed it by mistake.', '2026-11-05T15:00:00Z'), comment('someone', ask('Do it.'), '2026-11-05T15:01:00Z')];
  assert.equal(awaitsWork({ manager: M, comments, commits: [] }), false);
});

test('a question («❓ Decision for the AI Manager») newer than the prompt means the session waits for the AI Manager, not the other way round', () => {
  const comments = [
    comment(M, ask('Continue Issue #126.'), '2026-11-05T15:00:00Z'),
    comment(M, '❓ Decision for the AI Manager: the sweep needs a read in db/.', '2026-11-05T15:30:00Z'),
  ];
  assert.equal(awaitsWork({ manager: M, comments, commits: [] }), false);
  const answered = [...comments, comment(M, `✅ Decision by the AI Manager\n\n${ask('Continue Issue #126 with option 1.')}`, '2026-11-05T16:00:00Z')];
  assert.equal(awaitsWork({ manager: M, comments: answered, commits: [] }), true);
});

const it = (number, ...labels) => ({ number, labels });

test('the changes label goes on while a request awaits work and comes off when it does not', () => {
  assert.deepEqual(requestLabels(it(103, LABELS.progress.name), true), { add: [LABELS.changes.name], remove: [] });
  assert.deepEqual(requestLabels(it(95, LABELS.review.name, LABELS.changes.name), false), { add: [], remove: [LABELS.changes.name] });
  assert.equal(requestLabels(it(7, LABELS.progress.name, LABELS.changes.name), true), null);
  assert.equal(requestLabels(it(8, LABELS.review.name), false), null);
});

test('an answered decision (a request newer than the question) takes «needs decision» off', () => {
  assert.deepEqual(requestLabels(it(126, LABELS.progress.name, LABELS.decision.name), true), { add: [LABELS.changes.name], remove: [LABELS.decision.name] });
  // Still waiting for the answer: nothing from the AI Manager after the question.
  assert.equal(requestLabels(it(127, LABELS.progress.name, LABELS.decision.name), false), null);
});
