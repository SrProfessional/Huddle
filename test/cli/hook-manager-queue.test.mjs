// Issue #138, docs/design.md §19: when the Coach opens a session, the hook says in one line what waits for them.
// It informs and never acts: no review, merge, answer or triage, and no write at all.
import test from 'node:test';
import assert from 'node:assert/strict';
import { run } from '../../lib/cli/run.mjs';
import { harness } from './harness.mjs';

const MANAGED = '## Depends on\n\nNone.\n';
const WRITES = new Set(['setLabels', 'ensureLabels', 'assign', 'merge', 'postComment', 'editComment', 'markTaken', 'createIssue', 'updateIssue', 'closeIssue', 'pinIssue']);

function mk({ setup, gitlab = false, me = 'SrProfessional', wrap = (a) => a } = {}) {
  const writes = [];
  const guard = (adapter) => new Proxy(wrap({ ...adapter, me: typeof me === 'function' ? me : async () => me }), {
    get: (a, op) => (WRITES.has(op) ? async () => { writes.push(op); } : a[op]),
  });
  const h = harness({ setup, gitlab, wrap: guard });
  h.writes = writes;
  return h;
}

const world = (w) => {
  w.issue({ number: 42, title: 'Add login form', body: MANAGED, assignees: ['ana'], reviews: [51] });
  w.review({ number: 51 });
  w.issue({ number: 43, title: 'Add logout', body: MANAGED, assignees: ['ana'], reviews: [52] });
  w.review({ number: 52 });
  w.issue({ number: 47, title: 'Which payment provider?', body: MANAGED, labels: ['needs decision'] });
  w.comment(47, { id: 1, author: 'ana', body: '❓ Decision for the Coach: which one?', createdAt: '2026-11-10T10:00:00Z' });
  w.issue({ number: 53, title: 'Login page crashes on Safari', body: 'A raw report', labels: ['bug', 'needs triage'] });
};

const out = (h) => (h.text() ? JSON.parse(h.text()) : null);

test('the Coach: one visible line with the count and the numbers, and the context says to act on nothing until asked', async () => {
  const h = mk({ setup: world });
  assert.equal(await run(['hook'], h.ctx), 0);
  const j = out(h);
  assert.match(j.systemMessage, /Huddle: 4 things wait for the Coach: PRs to review #51, #52; a decision on #47; a bug report to triage #53\./);
  assert.match(j.systemMessage, /\/huddle-review/);
  assert.match(j.systemMessage, /\/huddle-watch/);
  assert.equal(j.hookSpecificOutput.hookEventName, 'SessionStart');
  assert.match(j.hookSpecificOutput.additionalContext, /PRs to review #51, #52/);
  assert.match(j.hookSpecificOutput.additionalContext, /nothing until/i);
  assert.deepEqual(h.writes, []);
});

test('one item reads in the singular', async () => {
  const h = mk({ setup: (w) => { w.issue({ number: 42, title: 'Add login form', body: MANAGED, assignees: ['ana'], reviews: [51] }); w.review({ number: 51 }); } });
  await run(['hook'], h.ctx);
  assert.match(out(h).systemMessage, /Huddle: 1 thing waits for the Coach: a PR to review #51\./);
});

test('the Coach with nothing waiting: the hook adds nothing', async () => {
  const h = mk({ setup: (w) => w.issue({ number: 5, assignees: ['SrProfessional'], labels: ['in progress'], body: MANAGED }) });
  assert.equal(await run(['hook'], h.ctx), 0);
  assert.equal(h.text(), '');
});

test('a Player with the same open PRs: no Coach line', async () => {
  const h = mk({ setup: world, me: 'ana' });
  assert.equal(await run(['hook'], h.ctx), 0);
  assert.doesNotMatch(h.text(), /wait for the Coach/);
});

test('GitLab says MRs and !', async () => {
  const h = mk({ setup: world, gitlab: true });
  await run(['hook'], h.ctx);
  assert.match(out(h).systemMessage, /MRs to review !51, !52/);
});

test('a failing login or a failing read: the hook still exits 0 and adds nothing', async () => {
  const offline = mk({ setup: world, me: async () => { throw new Error('offline'); } });
  assert.equal(await run(['hook'], offline.ctx), 0);
  assert.doesNotMatch(offline.text(), /wait for the Coach/);
  const broken = mk({ setup: world, wrap: (a) => ({ ...a, openReviews: async () => { throw new Error('502'); } }) });
  assert.equal(await run(['hook'], broken.ctx), 0);
  assert.doesNotMatch(broken.text(), /wait for the Coach/);
});
