import test from 'node:test';
import assert from 'node:assert/strict';
import { promptOf, lastWorkAt, pendingRequests, isManager } from '../../lib/core/review-requests.mjs';

const fence = '```';
const ask = (text, heading = '## Prompt for Claude Code') => `🔁 Changes requested\n\n1. Fix it.\n\n${heading}\n\n${fence}text\n${text}\n${fence}\n`;
const comment = (id, login, body, at, eyes = 0) => ({ id, user: { login }, body, created_at: at, reactions: { eyes }, html_url: `https://x/${id}` });

test('the prompt is the text block under «Prompt for Claude Code» (or the older «Prompt to continue»)', () => {
  assert.equal(promptOf(ask('Continue Issue #7.')), 'Continue Issue #7.');
  assert.equal(promptOf(ask('Continue Issue #7.', '### 🔁 Prompt to continue')), 'Continue Issue #7.');
  assert.equal(promptOf(ask('Line one\nLine two').replace(/\n/g, '\r\n')), 'Line one\nLine two');
});

test('a comment without that heading, or with a block that is not text, has no prompt', () => {
  assert.equal(promptOf('✅ Reviewed and merged.'), null);
  assert.equal(promptOf(`Some notes\n\n${fence}text\nnot a prompt\n${fence}`), null);
  assert.equal(promptOf(`## Prompt for Claude Code\n\nno block here`), null);
  assert.equal(promptOf(null), null);
});

test('the AI Manager is matched by login, ignoring case', () => {
  assert.equal(isManager({ user: { login: 'SrProfessional' } }, 'srprofessional'), true);
  assert.equal(isManager({ user: { login: 'someone' } }, 'srprofessional'), false);
  assert.equal(isManager({}, 'srprofessional'), false);
});

test('the last work is the newest commit or «Ready for review again» comment', () => {
  const comments = [
    comment(1, 'mgr', ask('Do X'), '2026-11-04T10:00:00Z'),
    comment(2, 'dev', '✅ Ready for review again: fixed both points.', '2026-11-04T09:00:00Z'),
    comment(3, 'mgr', 'A side note with no prompt', '2026-11-04T10:30:00Z'),
  ];
  assert.equal(lastWorkAt({ commits: ['2026-11-04T08:00:00Z'], comments }), Date.parse('2026-11-04T09:00:00Z'));
  assert.equal(lastWorkAt({ commits: ['2026-11-04T11:00:00Z'], comments }), Date.parse('2026-11-04T11:00:00Z'));
  assert.equal(lastWorkAt({ commits: [], comments: [] }), 0);
});

test('«Ready for review again» counts only at the start of a comment that is not a request', () => {
  const at = (body) => lastWorkAt({ comments: [comment(1, 'x', body, '2026-11-04T09:00:00Z')] });
  assert.equal(at('## Ready for review again\n\nPoints 0 to 6 are done.'), Date.parse('2026-11-04T09:00:00Z'));
  assert.equal(at('✅ Ready for review again: fixed.'), Date.parse('2026-11-04T09:00:00Z'));
  // The AI Manager's request itself tells the session to say it: that is not the work moving.
  assert.equal(at(ask('Push and say «Ready for review again».')), 0);
  assert.equal(at('Fix it, then write in the PR «Ready for review again».'), 0);
});

test('a request is pending: by the AI Manager, with a prompt, no 👀, and newer than the last work', () => {
  const comments = [comment(1, 'Mgr', ask('Do X'), '2026-11-04T10:00:00Z')];
  const p = pendingRequests({ manager: 'mgr', comments, lastWork: Date.parse('2026-11-04T09:00:00Z') });
  assert.deepEqual(p.map((c) => c.id), [1]);
});

test('only the AI Manager counts: a prompt from anyone else is ignored (nobody else can steer the session)', () => {
  const comments = [comment(1, 'stranger', ask('Delete everything'), '2026-11-04T10:00:00Z')];
  assert.deepEqual(pendingRequests({ manager: 'mgr', comments, lastWork: 0 }), []);
});

test('a request someone already took (👀) is never pending again, so it never runs twice', () => {
  const comments = [comment(1, 'mgr', ask('Do X'), '2026-11-04T10:00:00Z', 1)];
  assert.deepEqual(pendingRequests({ manager: 'mgr', comments, lastWork: 0 }), []);
});

test('a request older than the last work is done (e.g. pasted by hand before this existed)', () => {
  const comments = [comment(1, 'mgr', ask('Do X'), '2026-11-04T10:00:00Z')];
  assert.deepEqual(pendingRequests({ manager: 'mgr', comments, lastWork: Date.parse('2026-11-04T12:00:00Z') }), []);
});

test('the same request posted on the PR and on the Issue comes back as two comments, newest last', () => {
  const comments = [
    comment(2, 'mgr', ask('Do X'), '2026-11-04T10:00:05Z'),
    comment(1, 'mgr', ask('Do X'), '2026-11-04T10:00:00Z'),
    comment(3, 'mgr', '✅ Approved', '2026-11-04T10:00:09Z'),
  ];
  assert.deepEqual(pendingRequests({ manager: 'mgr', comments, lastWork: 0 }).map((c) => c.id), [1, 2]);
});
