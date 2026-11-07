// Huddle: GitLab reads award emoji (👀) only for the notes that could be requests, at most 8 calls at once (H16, Issue #34).
import test from 'node:test';
import assert from 'node:assert/strict';
import { fakeGitlab } from './fake-glab.mjs';
import { createGitlab } from '../../lib/platform/gitlab.mjs';
import { requestCandidates } from '../../lib/core/review-requests.mjs';

const PROMPT = (n) => `Changes please (${n}).\n\n## Prompt for Claude Code\n\n\`\`\`text\ndo thing ${n}\n\`\`\``;
const stamp = (i) => `2026-11-04T10:${String(i).padStart(2, '0')}:00Z`;

/** An Issue with 30 notes; the AI Manager's requests are notes 10 and 20, the others are chatter (by ana, or by the manager without a prompt). */
function thirtyNotes({ manager = 'SrProfessional' } = {}) {
  const fake = fakeGitlab();
  fake.world.issue({ number: 7, title: 'Seven' });
  for (let i = 1; i <= 30; i++) {
    const request = i === 10 || i === 20;
    fake.world.comment(7, { id: i, author: request ? manager : i % 3 ? 'ana' : manager, body: request ? PROMPT(i) : `note ${i}`, createdAt: stamp(i) });
  }
  return fake;
}
const awardCalls = (fake) => fake.world.calls().filter((c) => c.args.some((a) => a.includes('/award_emoji'))).length;
const adapterOf = (fake, extra = {}, run = fake.run) => createGitlab({ project: fake.project, host: fake.host, ai_manager: 'SrProfessional', ...extra }, { run });

test('[gitlab] an Issue with 30 notes, 2 of them requests: 2 award calls, not 30', async () => {
  const fake = thirtyNotes();
  const notes = await adapterOf(fake).comments(7);
  assert.equal(notes.length, 30, 'every note is still returned');
  assert.equal(awardCalls(fake), 2);
  assert.equal(fake.world.commandCount(), 3, 'one list of notes plus two awards');
  assert.deepEqual(notes.map((n) => n.id), Array.from({ length: 30 }, (_, i) => i + 1), 'oldest first, as before');
});

test('[gitlab] a request that was taken still reads as taken', async () => {
  const fake = thirtyNotes();
  const a = adapterOf(fake);
  await a.markTaken(7, 10);
  const byId = Object.fromEntries((await a.comments(7)).map((n) => [n.id, n.taken]));
  assert.equal(byId[10], true);
  assert.equal(byId[20], false);
});

test('[gitlab] a request older than «Ready for review again» is not a candidate: no award call for it', async () => {
  const fake = thirtyNotes();
  fake.world.comment(7, { id: 99, author: 'ana', body: '✅ Ready for review again', createdAt: stamp(15) });
  await adapterOf(fake).comments(7);
  assert.equal(awardCalls(fake), 1, 'only note 20 is newer than the Ready comment');
});

test('[gitlab] on an MR, a request older than the last commit is not a candidate', async () => {
  const fake = fakeGitlab();
  fake.world.issue({ number: 7, title: 'Seven', reviews: [50] });
  fake.world.review({ number: 50, commits: [stamp(15)] });
  fake.world.reviewComment(50, { id: 1, author: 'SrProfessional', body: PROMPT(1), createdAt: stamp(10) });
  fake.world.reviewComment(50, { id: 2, author: 'SrProfessional', body: PROMPT(2), createdAt: stamp(20) });
  const notes = await adapterOf(fake).comments(50, { review: true });
  assert.equal(notes.length, 2);
  assert.equal(awardCalls(fake), 1);
});

test('[gitlab] the award calls run at most 8 at a time', async () => {
  const fake = fakeGitlab();
  fake.world.issue({ number: 7, title: 'Seven' });
  for (let i = 1; i <= 30; i++) fake.world.comment(7, { id: i, author: 'SrProfessional', body: PROMPT(i), createdAt: stamp(i) });
  let now = 0, peak = 0;
  const slow = async (args, o) => {
    const award = args.some((a) => String(a).includes('/award_emoji'));
    if (award) peak = Math.max(peak, ++now);
    await new Promise((r) => setTimeout(r, 5));
    try { return fake.run(args, o); } finally { if (award) now--; }
  };
  const notes = await adapterOf(fake, {}, slow).comments(7);
  assert.equal(notes.length, 30);
  assert.ok(peak > 1 && peak <= 8, `peak was ${peak}`);
});

test('[gitlab] without an ai_manager in the config nothing is filtered by author (still correct, just slower)', async () => {
  const fake = thirtyNotes();
  await createGitlab({ project: fake.project }, { run: fake.run }).comments(7);
  assert.equal(awardCalls(fake), 30);
});

test('requestCandidates: manager, with a prompt, newer than the last Ready comment or commit', () => {
  const c = (id, author, body, i) => ({ id, author, body, createdAt: stamp(i) });
  const comments = [c(1, 'Boss', PROMPT(1), 1), c(2, 'ana', PROMPT(2), 2), c(3, 'Boss', 'no prompt', 3), c(4, 'boss', PROMPT(4), 4), c(5, 'ana', 'Ready for review again', 5), c(6, 'Boss', PROMPT(6), 6)];
  assert.deepEqual(requestCandidates({ manager: 'boss', comments }).map((x) => x.id), [6]);
  assert.deepEqual(requestCandidates({ manager: 'boss', comments: comments.slice(0, 4) }).map((x) => x.id), [1, 4]);
  assert.deepEqual(requestCandidates({ manager: 'boss', comments: comments.slice(0, 4), commits: [stamp(2)] }).map((x) => x.id), [4]);
});
