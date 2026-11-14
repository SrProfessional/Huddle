// docs/design.md §21 (H49): the «tested in staging» marker, the staged list and the two warnings. Pure: no network, no git.
import test from 'node:test';
import assert from 'node:assert/strict';
import { TESTED_COMMENT, isTestedComment, releaseWarnings, stagedIssues, strayCommits, testedState, unreleasedPrs } from '../../lib/core/staging.mjs';

const WHO = { aiManager: 'SrProfessional', testers: ['tess'] };
const comment = (author, createdAt, body = TESTED_COMMENT) => ({ id: 1, author, createdAt, body });

test('the marker is the comment «✅ Tested in staging» by the AI Manager or by a tester, never by anyone else', () => {
  assert.equal(isTestedComment(comment('SrProfessional', 'x'), WHO), true);
  assert.equal(isTestedComment(comment('srprofessional', 'x'), WHO), true, 'logins are compared without case');
  assert.equal(isTestedComment(comment('tess', 'x'), WHO), true);
  assert.equal(isTestedComment(comment('ana', 'x'), WHO), false, 'a developer\'s comment never counts');
  assert.equal(isTestedComment(comment('SrProfessional', 'x', 'looks fine to me'), WHO), false, 'other words are not the marker');
  assert.equal(isTestedComment(comment('tess', 'x', '  ✅ Tested in staging  \n'), WHO), true, 'surrounding spaces are fine');
  assert.equal(isTestedComment(comment('tess', 'x', TESTED_COMMENT), { aiManager: 'SrProfessional' }), false, 'no testers key: nobody else counts');
});

test('a comment older than the last merge of that Issue is invalid, a newer one is valid', () => {
  const landedAt = '2026-11-10T10:00:00Z';
  assert.deepEqual(testedState({ comments: [comment('SrProfessional', '2026-11-10T09:00:00Z')], landedAt, ...WHO }), { tested: false, by: null, at: null });
  assert.deepEqual(testedState({ comments: [comment('SrProfessional', '2026-11-10T11:00:00Z')], landedAt, ...WHO }), { tested: true, by: 'SrProfessional', at: '2026-11-10T11:00:00Z' });
  assert.equal(testedState({ comments: [comment('SrProfessional', landedAt)], landedAt, ...WHO }).tested, false, 'the same instant is not newer');
});

test('a comment by a non-tester is ignored, even a newer one; the newest valid one is reported', () => {
  const landedAt = '2026-11-10T10:00:00Z';
  const comments = [comment('SrProfessional', '2026-11-10T11:00:00Z'), comment('tess', '2026-11-10T12:00:00Z'), comment('ana', '2026-11-10T13:00:00Z')];
  assert.deepEqual(testedState({ comments, landedAt, ...WHO }), { tested: true, by: 'tess', at: '2026-11-10T12:00:00Z' });
  assert.equal(testedState({ comments: [comment('ana', '2026-11-10T13:00:00Z')], landedAt, ...WHO }).tested, false);
  assert.equal(testedState({ comments: [], landedAt, ...WHO }).tested, false);
});

test('a fix after the test (a newer merge) invalidates it by itself: the gate reads dates, never a label', () => {
  const comments = [comment('SrProfessional', '2026-11-10T11:00:00Z')];
  assert.equal(testedState({ comments, landedAt: '2026-11-10T10:00:00Z', ...WHO }).tested, true);
  assert.equal(testedState({ comments, landedAt: '2026-11-10T12:00:00Z', ...WHO }).tested, false);
});

const prs = [
  { number: 40, body: 'Closes #5', mergedAt: '2026-11-04T00:00:00Z', mergeSha: 'm40' },
  { number: 39, body: 'Closes #6\nResolves acme/app#7', mergedAt: '2026-11-03T00:00:00Z', mergeSha: 'm39' },
  { number: 38, body: 'Closes #5', mergedAt: '2026-11-02T00:00:00Z', mergeSha: 'm38' },
  { number: 37, body: 'Closes #4', mergedAt: '2026-11-01T00:00:00Z', mergeSha: 'm37' },
  { number: 36, body: 'No keyword, only #9', mergedAt: '2026-10-31T00:00:00Z', mergeSha: 'm36' },
];

test('the staged list drops the PRs whose merge commit is an ancestor of the default branch', () => {
  const released = new Set(['m37', 'm36']);
  const left = unreleasedPrs(prs, (sha) => released.has(sha));
  assert.deepEqual(left.map((p) => p.number), [40, 39, 38]);
  assert.deepEqual(stagedIssues(left, 'acme/app'), [
    { issue: 5, pr: 40, mergedAt: '2026-11-04T00:00:00Z', mergeSha: 'm40' }, // the newest merge that closes it
    { issue: 6, pr: 39, mergedAt: '2026-11-03T00:00:00Z', mergeSha: 'm39' },
    { issue: 7, pr: 39, mergedAt: '2026-11-03T00:00:00Z', mergeSha: 'm39' },
  ]);
  assert.deepEqual(stagedIssues([], 'acme/app'), []);
});

test('a PR without a merge commit is kept as not released (it cannot be proven released)', () => {
  assert.deepEqual(unreleasedPrs([{ number: 1, body: 'Closes #1', mergeSha: null }], () => true).map((p) => p.number), [1]);
});

test('warning 1: commits in staging that belong to no listed Issue after the newest test', () => {
  const staged = [{ number: 40, mergeSha: 'm40' }, { number: 39, mergeSha: 'm39' }];
  const commits = [{ sha: 'm40', at: '2026-11-04T00:00:00Z' }, { sha: 'hot', at: '2026-11-05T00:00:00Z' }, { sha: 'm39', at: '2026-11-03T00:00:00Z' }];
  assert.deepEqual(strayCommits({ commits, prs: staged, since: '2026-11-04T12:00:00Z' }), ['hot'], 'newer than the newest test');
  assert.deepEqual(strayCommits({ commits, prs: staged, since: '2026-11-06T00:00:00Z' }), [], 'before the newest test: it was there when it was tested');
  assert.deepEqual(strayCommits({ commits, prs: staged, since: null }), ['hot'], 'nothing tested yet: any stray commit counts');
  assert.deepEqual(strayCommits({ commits: commits.filter((c) => c.sha !== 'hot'), prs: staged, since: null }), []);
});

test('the two warnings fire when they should and not otherwise', () => {
  assert.deepEqual(releaseWarnings({ stray: [], defaultAhead: false }), []);
  const both = releaseWarnings({ stray: ['abc1234'], defaultAhead: true, staging: 'staging', defaultBranch: 'main' });
  assert.deepEqual(both.map((w) => w.code), ['default-ahead', 'stray-commits']);
  assert.match(both[0].message, /main is ahead of staging.*back-merge/i);
  assert.match(both[1].message, /abc1234/);
  assert.deepEqual(releaseWarnings({ stray: ['abc1234'], defaultAhead: false, staging: 'staging', defaultBranch: 'main' }).map((w) => w.code), ['stray-commits']);
  assert.deepEqual(releaseWarnings({ stray: [], defaultAhead: true, staging: 'staging', defaultBranch: 'main' }).map((w) => w.code), ['default-ahead']);
});
