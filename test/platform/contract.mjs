// The shared contract test (docs/design.md §7): scenarios every platform adapter must pass, with canned responses and no network.
//
//   contract({ name: 'github', create })
//
// `create()` returns a fresh `{ adapter, world }`:
//   - `adapter`: the adapter under test, wired to a fake `gh`/`glab` runner.
//   - `world`: that fake's neutral side, the same methods for every platform (see test/platform/fake-gh.mjs):
//       issue({ number, title, body, assignees, labels, state: 'open' | 'merged' | 'closed-by-hand', reviews })
//       review({ number, draft, open })      comment(issueNumber, { id, author, body, createdAt, taken })
//       labelsOf(n)  assigneesOf(n)  repoLabels()  commentBody(id)  isTaken(id)  merged()
// A new platform adds its fake and one file under lib/platform/; this file does not change.
// The scenarios also run the real core on what the adapter returns, because the contract is that the core can use it.

import test from 'node:test';
import assert from 'node:assert/strict';
import { LABELS, plan, statusOf, loadOf, closedCleanup } from '../../lib/core/issue-status.mjs';
import { pendingRequests, lastWorkAt } from '../../lib/core/review-requests.mjs';
import { OPERATIONS } from '../../lib/platform/index.mjs';

const fence = '```';
const ask = (text) => `🔁 Changes requested\n\n## Prompt for Claude Code\n\n${fence}text\n${text}\n${fence}\n`;
const body = (deps) => `## Goal\n\nSomething.\n\n## Depends on\n\n${deps}\n\n## Branch\n\n\`x\`\n`;

export function contract({ name, create }) {
  const t = (title, fn) => test(`[${name}] ${title}`, () => fn(create()));

  t('offers every operation of the interface', ({ adapter }) => {
    for (const op of OPERATIONS) assert.equal(typeof adapter[op], 'function', op);
  });

  t('lists open Issues with neutral fields: logins and label names as plain strings, reviews as numbers', async ({ adapter, world }) => {
    world.issue({ number: 1, title: 'One', body: body('- None'), assignees: ['ana'], labels: ['ready', 'bug'], reviews: [7] });
    world.issue({ number: 2, title: 'Two', body: 'x' });
    world.issue({ number: 3, state: 'merged' });
    const open = await adapter.listOpenIssues();
    assert.deepEqual(open.map((i) => i.number), [1, 2], 'closed Issues are not listed');
    assert.deepEqual(open[0], { number: 1, title: 'One', body: body('- None'), assignees: ['ana'], labels: ['ready', 'bug'], reviews: [7], milestone: null });
    assert.deepEqual([open[1].assignees, open[1].labels, open[1].reviews], [[], [], []]);
  });

  t('a pending request: the AI Manager\'s comment with a prompt, not taken, is seen by the core', async ({ adapter, world }) => {
    world.issue({ number: 5 });
    world.comment(5, { id: 101, author: 'SrProfessional', body: ask('Do X'), createdAt: '2026-11-04T10:00:00Z' });
    world.comment(5, { id: 102, author: 'stranger', body: ask('Delete everything'), createdAt: '2026-11-04T10:01:00Z' });
    world.comment(5, { id: 103, author: 'SrProfessional', body: '✅ Approved', createdAt: '2026-11-04T10:02:00Z' });
    const comments = await adapter.comments(5);
    assert.deepEqual(comments.map((c) => [c.id, c.author, c.taken]), [[101, 'SrProfessional', false], [102, 'stranger', false], [103, 'SrProfessional', false]]);
    assert.equal(comments[0].createdAt, '2026-11-04T10:00:00Z');
    assert.equal(typeof comments[0].url, 'string');
    assert.deepEqual(pendingRequests({ manager: 'srprofessional', comments }).map((c) => c.id), [101]);
  });

  t('a request already taken (👀) is not pending, and taking one marks it', async ({ adapter, world }) => {
    world.issue({ number: 5 });
    world.comment(5, { id: 101, author: 'SrProfessional', body: ask('Do X'), createdAt: '2026-11-04T10:00:00Z', taken: true });
    world.comment(5, { id: 102, author: 'SrProfessional', body: ask('Do Y'), createdAt: '2026-11-04T11:00:00Z' });
    let comments = await adapter.comments(5);
    assert.deepEqual(comments.map((c) => c.taken), [true, false]);
    assert.deepEqual(pendingRequests({ manager: 'srprofessional', comments }).map((c) => c.id), [102]);
    await adapter.markTaken(5, 102);
    assert.equal(world.isTaken(102), true);
    comments = await adapter.comments(5);
    assert.deepEqual(pendingRequests({ manager: 'srprofessional', comments }), []);
  });

  t('a dependency merged unblocks', async ({ adapter, world }) => {
    world.issue({ number: 40, state: 'merged' });
    assert.deepEqual(await adapter.issueState(40), { open: false, merged: true });
    const issues = new Map([[40, await adapter.issueState(40)]]);
    assert.equal(statusOf({ deps: [40], assigned: false, issues }).label, LABELS.ready.name);
  });

  t('a dependency closed by hand does not unblock', async ({ adapter, world }) => {
    world.issue({ number: 41, state: 'closed-by-hand' });
    world.issue({ number: 42 });
    assert.deepEqual(await adapter.issueState(41), { open: false, merged: false });
    assert.deepEqual(await adapter.issueState(42), { open: true, merged: false });
    const issues = new Map([[41, await adapter.issueState(41)], [42, await adapter.issueState(42)]]);
    assert.deepEqual(statusOf({ deps: [41, 42], assigned: false, issues }), { label: LABELS.blocked.name, waiting: [41, 42] });
  });

  t('a draft PR/MR is not «in review»: only open, non-draft ones are listed', async ({ adapter, world }) => {
    world.issue({ number: 33, body: body('- None'), assignees: ['ana'], labels: ['assigned'], reviews: [59] }); // only a draft
    world.issue({ number: 34, body: body('- None'), assignees: ['luis'], labels: ['assigned'], reviews: [60, 61] }); // an open one and a closed one
    world.review({ number: 59, draft: true });
    world.review({ number: 60, draft: false });
    world.review({ number: 61, draft: false, open: false });
    const openPrs = new Set(await adapter.openReviews());
    assert.deepEqual([...openPrs], [60]);
    const open = await adapter.listOpenIssues();
    const changes = plan({ open, issues: new Map(), openPrs });
    assert.equal(changes.find((p) => p.number === 33), undefined, 'a draft only: still «assigned», nothing to change');
    assert.equal(changes.find((p) => p.number === 34).add, LABELS.review.name, 'an open, non-draft one: in review');
    assert.deepEqual([...loadOf(open, openPrs)], [['ana', 1]], 'in review does not count toward the cap; a draft does');
  });

  t('reviewsClosing(n) gives the numbers of the PRs/MRs that would close the Issue', async ({ adapter, world }) => {
    world.issue({ number: 8, reviews: [12, 14] });
    world.issue({ number: 9 });
    assert.deepEqual(await adapter.reviewsClosing(8), [12, 14]);
    assert.deepEqual(await adapter.reviewsClosing(9), []);
  });

  t('a renamed label is created, applied and read back under its new name', async ({ adapter, world }) => {
    const renamed = 'changes requested';
    world.issue({ number: 6, labels: ['bug'] });
    await adapter.ensureLabels([{ name: renamed, color: 'd93f0b', description: 'Renamed in huddle.json' }, LABELS.ready]);
    assert.deepEqual(world.repoLabels()[renamed], { color: 'd93f0b', description: 'Renamed in huddle.json' });
    assert.ok(world.repoLabels()[LABELS.ready.name]);
    await adapter.ensureLabels([{ name: renamed, color: 'd93f0b', description: 'Renamed in huddle.json' }]); // idempotent
    await adapter.setLabels(6, [renamed], []);
    assert.deepEqual(world.labelsOf(6), ['bug', renamed]);
    assert.deepEqual((await adapter.listOpenIssues())[0].labels, ['bug', renamed]);
    await adapter.setLabels(6, [], [renamed]);
    assert.deepEqual(world.labelsOf(6), ['bug']);
  });

  t('setLabels adds and removes in one go, and does nothing when there is nothing to change', async ({ adapter, world }) => {
    world.issue({ number: 6, labels: ['ready', 'bug'] });
    await adapter.setLabels(6, ['assigned'], ['ready']);
    assert.deepEqual(world.labelsOf(6), ['bug', 'assigned']);
    const before = world.commandCount();
    await adapter.setLabels(6, [], []);
    assert.equal(world.commandCount(), before, 'no command is sent for an empty change');
  });

  t('posts and edits a comment, and assigns a person', async ({ adapter, world }) => {
    world.issue({ number: 7 });
    const posted = await adapter.postComment(7, 'Ready for review again');
    assert.equal(typeof posted.id, 'number');
    assert.equal(world.commentBody(posted.id), 'Ready for review again');
    await adapter.editComment(7, posted.id,'Ready for review again (edited)');
    assert.equal(world.commentBody(posted.id), 'Ready for review again (edited)');
    assert.equal((await adapter.comments(7)).length, 1);
    await adapter.assign(7, 'ana');
    assert.deepEqual(world.assigneesOf(7), ['ana']);
  });

  t('merges an open, non-draft review with a merge commit; me() is the login of the token', async ({ adapter, world }) => {
    world.review({ number: 60 });
    await adapter.merge(60);
    assert.deepEqual(world.merged(), [60]);
    assert.equal(await adapter.me(), 'SrProfessional');
  });

  // --- the operations H10 added (Issue #16) ---

  t('listLabels() gives the names of the labels the project has', async ({ adapter, world }) => {
    assert.deepEqual(await adapter.listLabels(), []);
    await adapter.ensureLabels([LABELS.ready, { name: 'bug', color: 'd73a4a', description: '' }]);
    assert.deepEqual((await adapter.listLabels()).sort(), ['bug', LABELS.ready.name].sort());
    assert.deepEqual(Object.keys(world.repoLabels()).sort(), (await adapter.listLabels()).sort());
  });

  t('listClosedIssues() gives closed Issues (merged or by hand) with their label names, never open ones; the core cleans them', async ({ adapter, world }) => {
    world.issue({ number: 1, labels: ['in review'] }); // open: not listed
    world.issue({ number: 2, state: 'merged', labels: ['in review', 'changes requested from AI Manager', 'bug'] });
    world.issue({ number: 3, state: 'closed-by-hand', labels: ['needs decision'] });
    world.issue({ number: 4, state: 'merged' });
    const closed = (await adapter.listClosedIssues()).sort((a, b) => a.number - b.number);
    assert.deepEqual(closed, [{ number: 2, title: '', labels: ['in review', 'changes requested from AI Manager', 'bug'], milestone: null }, { number: 3, title: '', labels: ['needs decision'], milestone: null }, { number: 4, title: '', labels: [], milestone: null }]);
    assert.deepEqual(closedCleanup(closed), [{ number: 2, remove: ['in review', 'changes requested from AI Manager'] }, { number: 3, remove: ['needs decision'] }]);
  });

  t('listClosedIssues() also gives the title and the milestone of each closed Issue, for the areas check-up', async ({ adapter, world }) => {
    world.milestone({ title: 'Content' });
    world.issue({ number: 2, title: 'Write intro', state: 'merged', milestone: 'Content' });
    world.issue({ number: 3, title: 'Tooling', state: 'closed-by-hand' });
    const closed = (await adapter.listClosedIssues()).sort((a, b) => a.number - b.number);
    assert.deepEqual(closed.map((i) => [i.number, i.title, i.milestone]), [[2, 'Write intro', 'Content'], [3, 'Tooling', null]]);
  });

  t('findMilestone(title) finds a milestone in any state, ignoring case, and gives null when there is none', async ({ adapter, world }) => {
    const text = ['Words.', '', 'Huddle remaining: 4'].join('\n');
    world.milestone({ title: 'Content', description: text });
    world.milestone({ title: 'Old', state: 'closed', closedAt: '2020-01-01T00:00:00Z' });
    const found = await adapter.findMilestone('Content');
    assert.deepEqual([found.title, found.description, found.state], ['Content', text, 'open']);
    assert.equal((await adapter.findMilestone('  content ')).title, 'Content');
    assert.equal((await adapter.findMilestone('Old')).state, 'closed');
    assert.equal(await adapter.findMilestone('Nothing'), null);
  });

  t('createMilestone and updateMilestone write the description; update keeps the milestone, never makes a second one', async ({ adapter, world }) => {
    const two = ['Paid reach.', '', 'Huddle remaining: 2'].join('\n');
    const five = ['Paid reach.', '', 'Huddle remaining: 5'].join('\n');
    await adapter.createMilestone({ title: 'Ads', description: two });
    assert.deepEqual(world.milestoneTitles(), ['Ads']);
    assert.equal(world.milestoneDescription('Ads'), two);
    await adapter.updateMilestone('Ads', { description: five });
    assert.deepEqual(world.milestoneTitles(), ['Ads']);
    assert.equal(world.milestoneDescription('Ads'), five);
    assert.equal((await adapter.findMilestone('Ads')).description, five);
    await assert.rejects(adapter.updateMilestone('Missing', { description: 'x' }), /Missing/);
  });

  t('setIssueMilestone(n, title) puts an Issue in an area, null takes it out; an unknown area is an error', async ({ adapter, world }) => {
    world.milestone({ title: 'Content' });
    world.issue({ number: 5 });
    world.issue({ number: 6, state: 'merged' });
    await adapter.setIssueMilestone(5, 'Content');
    await adapter.setIssueMilestone(6, 'Content');
    assert.equal(world.milestoneOf(5), 'Content');
    assert.equal(world.milestoneOf(6), 'Content');
    assert.equal((await adapter.listOpenIssues())[0].milestone, 'Content');
    await adapter.setIssueMilestone(5, null);
    assert.equal(world.milestoneOf(5), null);
    await assert.rejects(adapter.setIssueMilestone(5, 'Nope'), /Nope/);
  });

  t('setIssueMilestone puts an Issue in a closed milestone (an old area), and takes it out again', async ({ adapter, world }) => {
    world.milestone({ title: 'Shipped', state: 'closed', closedAt: '2026-01-01T00:00:00Z' });
    world.issue({ number: 5 });
    world.issue({ number: 6, state: 'merged' });
    await adapter.setIssueMilestone(5, 'Shipped');
    await adapter.setIssueMilestone(6, 'Shipped');
    assert.equal(world.milestoneOf(5), 'Shipped');
    assert.equal(world.milestoneOf(6), 'Shipped');
    await adapter.setIssueMilestone(6, null);
    assert.equal(world.milestoneOf(6), null);
    await assert.rejects(adapter.setIssueMilestone(5, 'Nope'), /Nope/);
    assert.equal(world.milestoneOf(5), 'Shipped');
  });

  t('setIssueMilestone on a closed milestone sticks, and the milestone is closed again afterwards', async ({ adapter, world }) => {
    // gitlab.com answers 200 and leaves the Issue without a closed milestone; the adapter has to read it back and reopen, assign and close.
    world.milestone({ title: 'Docs', state: 'closed', closedAt: '2026-09-01T00:00:00Z' });
    world.issue({ number: 5 });
    await adapter.setIssueMilestone(5, 'Docs');
    assert.equal(world.milestoneOf(5), 'Docs');
    assert.equal((await adapter.listOpenIssues())[0].milestone, 'Docs');
    assert.equal(world.milestoneState('Docs'), 'closed');
    assert.equal((await adapter.findMilestone('Docs')).state, 'closed');
  });

  t('findIssuesByTitle(title) lists the open Issues with exactly that title, from the database and not from search, so one created a moment ago is there', async ({ adapter, world }) => {
    world.searchLag?.(true); // GitHub: `gh issue list` is search and has not indexed a new Issue yet
    world.issue({ number: 3, title: 'Huddle progress', body: 'first' });
    world.issue({ number: 4, title: 'Huddle progress notes', body: 'other title' });
    world.issue({ number: 6, title: 'Huddle progress', body: 'closed one', state: 'merged' });
    const created = await adapter.createIssue({ title: 'Huddle progress', body: 'brand new' });
    world.review({ number: 77 }); // a pull request is not an Issue (GitHub lists both)
    const found = await adapter.findIssuesByTitle('Huddle progress');
    assert.deepEqual(found.map((i) => [i.number, i.title, i.body]), [[3, 'Huddle progress', 'first'], [created.number, 'Huddle progress', 'brand new']], 'open, exact title, oldest first');
    assert.deepEqual(await adapter.findIssuesByTitle('No such title'), []);
  });

  t('closeIssue(n, { reason }) closes an Issue; «not planned» is the reason on platforms that have one', async ({ adapter, world }) => {
    world.issue({ number: 7 });
    world.issue({ number: 8 });
    await adapter.closeIssue(7, { reason: 'not planned' });
    await adapter.closeIssue(8);
    assert.deepEqual([world.stateOf(7), world.stateOf(8)], ['closed', 'closed']);
    assert.deepEqual((await adapter.listOpenIssues()).map((i) => i.number), []);
    if (world.closedReason) assert.deepEqual([world.closedReason(7), world.closedReason(8)], ['not_planned', 'completed']);
  });

  t('reviewCommits(n) gives the commit dates of a PR/MR, so the core sees work newer than a request', async ({ adapter, world }) => {
    world.review({ number: 60, commits: ['2026-11-04T09:00:00Z', '2026-11-04T12:00:00Z'] });
    world.review({ number: 61 });
    world.issue({ number: 5 });
    world.comment(5, { id: 101, author: 'SrProfessional', body: ask('Do X'), createdAt: '2026-11-04T10:00:00Z' });
    const dates = await adapter.reviewCommits(60);
    assert.deepEqual([...dates].sort(), ['2026-11-04T09:00:00Z', '2026-11-04T12:00:00Z']);
    assert.deepEqual(await adapter.reviewCommits(61), []);
    const comments = await adapter.comments(5);
    assert.equal(pendingRequests({ manager: 'SrProfessional', comments, lastWork: lastWorkAt({ commits: dates, comments }) }).length, 0, 'a newer commit clears the request');
    assert.equal(pendingRequests({ manager: 'SrProfessional', comments, lastWork: lastWorkAt({ commits: [], comments }) }).length, 1);
  });

  t('issueForBranch(branch) gives the Issue the open PR/MR of that branch resolves, or null', async ({ adapter, world }) => {
    world.issue({ number: 16, reviews: [70] });
    world.issue({ number: 17, reviews: [71] });
    world.review({ number: 70, branch: 'h10-interface-gaps' });
    world.review({ number: 71, branch: 'h11-old', open: false }); // closed: does not count
    world.review({ number: 72, branch: 'no-issue' }); // resolves nothing
    assert.equal(await adapter.issueForBranch('h10-interface-gaps'), 16);
    assert.equal(await adapter.issueForBranch('h11-old'), null);
    assert.equal(await adapter.issueForBranch('no-issue'), null);
    assert.equal(await adapter.issueForBranch('main'), null);
  });

  t('findUser(login) says whether the user exists on the platform', async ({ adapter }) => {
    assert.equal(await adapter.findUser('SrProfessional'), true);
    assert.equal(await adapter.findUser('ana'), true);
    assert.equal(await adapter.findUser('nobody-here'), false);
  });

  t('canAssign(login) is true for someone the project can assign, false for a stranger or a login that does not exist', async ({ adapter, world }) => {
    assert.equal(await adapter.canAssign('ana'), true);
    assert.equal(await adapter.canAssign('SrProfessional'), true);
    world.user('outsider'); // has an account, no access to the project
    assert.equal(await adapter.canAssign('outsider'), false);
    assert.equal(await adapter.canAssign('nobody-here'), false);
    world.member('newbie'); // access given after the fact
    assert.equal(await adapter.canAssign('newbie'), true);
  });

  t('open Issues carry the title of their milestone, or null, so «no area» costs no extra call', async ({ adapter, world }) => {
    world.milestone({ title: 'Content' });
    world.issue({ number: 1, milestone: 'Content' });
    world.issue({ number: 2 });
    assert.deepEqual((await adapter.listOpenIssues()).map((i) => [i.number, i.milestone]), [[1, 'Content'], [2, null]]);
  });

  t('listMilestones: the open ones and those closed since the date, with description and their Issues as { number, open, merged }', async ({ adapter, world }) => {
    world.milestone({ title: 'Content', description: 'Posts.\n\nHuddle remaining: 2' });
    world.milestone({ title: 'Social networks', description: '' });
    world.milestone({ title: 'Ads', description: 'Huddle remaining: 0' });
    world.milestone({ title: 'Launch', state: 'closed', closedAt: '2026-10-20T00:00:00Z' });
    world.milestone({ title: 'Old beta', state: 'closed', closedAt: '2026-05-01T00:00:00Z' });
    world.issue({ number: 1, milestone: 'Content', state: 'merged' });
    world.issue({ number: 2, milestone: 'Content', state: 'closed-by-hand' });
    world.issue({ number: 3, milestone: 'Content' });
    world.issue({ number: 4, milestone: 'Content' });
    world.issue({ number: 5, milestone: 'Content', state: 'merged' });
    world.issue({ number: 6, milestone: 'Launch', state: 'merged' });
    world.issue({ number: 7, milestone: 'Old beta', state: 'merged' });
    world.issue({ number: 8 });
    const found = await adapter.listMilestones({ since: '2026-08-08T00:00:00.000Z' });
    const byTitle = Object.fromEntries(found.map((m) => [m.title, m]));
    assert.deepEqual(Object.keys(byTitle).sort(), ['Ads', 'Content', 'Launch', 'Social networks'], 'open ones, and the one closed in the window; not the old one');
    assert.equal(byTitle.Content.description, 'Posts.\n\nHuddle remaining: 2');
    assert.deepEqual([byTitle.Content.state, byTitle.Launch.state], ['open', 'closed']);
    assert.deepEqual(byTitle.Content.issues.map((i) => [i.number, i.open, i.merged]).sort((a, b) => a[0] - b[0]), [
      [1, false, true], [2, false, false], [3, true, false], [4, true, false], [5, false, true],
    ], 'more Issues than one page: all of them, and merged only when a merged PR/MR closed it');
    assert.deepEqual(byTitle.Ads.issues, []);
    assert.deepEqual(byTitle.Launch.issues, [{ number: 6, open: false, merged: true }]);
    assert.equal(typeof byTitle.Launch.closedAt, 'string');
    assert.equal(byTitle.Content.closedAt ?? null, null);
  });

  t('listMilestones with nothing to list is an empty list', async ({ adapter }) => {
    assert.deepEqual(await adapter.listMilestones({ since: '2026-08-08T00:00:00.000Z' }), []);
  });

  t('createIssue, updateIssue and pinIssue: a created Issue is listed with its body, rewritten in place, and pinning never throws', async ({ adapter, world }) => {
    const created = await adapter.createIssue({ title: 'Huddle progress', body: 'first' });
    assert.equal(typeof created.number, 'number');
    assert.deepEqual(world.created(), [{ number: created.number, title: 'Huddle progress', body: 'first' }]);
    assert.deepEqual((await adapter.listOpenIssues()).map((i) => [i.number, i.body]), [[created.number, 'first']]);
    await adapter.updateIssue(created.number, { body: 'second' });
    assert.equal(world.bodyOf(created.number), 'second');
    assert.equal(typeof (await adapter.pinIssue(created)), 'boolean');
  });

  t('editComment and markTaken work cold: the Issue number comes with the comment id, no earlier read needed', async ({ adapter, world }) => {
    world.issue({ number: 5 });
    world.issue({ number: 6 });
    world.comment(5, { id: 201, author: 'SrProfessional', body: 'one', createdAt: '2026-11-04T10:00:00Z' });
    world.comment(6, { id: 202, author: 'SrProfessional', body: 'two', createdAt: '2026-11-04T10:00:00Z' });
    await adapter.editComment(6, 202, 'two (edited)');
    await adapter.markTaken(5, 201);
    assert.equal(world.commentBody(202), 'two (edited)');
    assert.equal(world.commentBody(201), 'one');
    assert.equal(world.isTaken(201), true);
    assert.equal(world.isTaken(202), false);
  });
}
