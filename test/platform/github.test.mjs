import test from 'node:test';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import { contract } from './contract.mjs';
import { fakeGithub } from './fake-gh.mjs';
import { createGithub } from '../../lib/platform/github.mjs';
import { createPlatform } from '../../lib/platform/index.mjs';

// Every test here uses the in-memory fake; none can start a real `gh` (the fake throws on a command it does not know).
const create = ({ staging } = {}) => {
  const { run, world, project } = fakeGithub();
  return { adapter: createGithub({ project, ...(staging === undefined ? {} : { staging_branch: staging }) }, { run }), world };
};

contract({ name: 'github', create });

// What a fixed run sends today, one entry per call: the first arguments and a hash of everything (arguments, input, environment).
// With no staging branch (absent or ''), a change to any call, or an extra one, fails this test (Issue #111).
const GOLDEN_CALLS = [
  'issue list -R bcfbdfb204', 'api graphql -f aa66fb3f44', 'api graphql -f d478d437ab', 'api graphql -f da4ee470ef', 'issue view 1 d9866861d6',
  'pr list -R f318c160ba', 'pr list -R 365bbee0a1', 'api graphql -f 1917c9befd', 'api graphql -f 3d537fd1bf', 'api graphql -f cd4dd441a1',
];
const fingerprint = (c) => `${c.args.slice(0, 3).join(' ')} ${createHash('sha256').update(JSON.stringify([c.args, c.input ?? null, c.env ?? null])).digest('hex').slice(0, 10)}`;

for (const [label, config] of [['staging_branch absent', {}], ['staging_branch ""', { staging_branch: '' }]]) {
  test(`[github] ${label}: the calls of every read are exactly today's`, async () => {
    const { run, world, project } = fakeGithub();
    const adapter = createGithub({ project, ...config }, { run });
    world.milestone({ title: 'Content' });
    world.issue({ number: 1, reviews: [60] });
    world.issue({ number: 2, state: 'merged', milestone: 'Content' });
    world.issue({ number: 3, state: 'closed-by-hand', milestone: 'Content' });
    world.issue({ number: 4, milestone: 'Content' });
    world.review({ number: 60, branch: 'b' });
    await adapter.listOpenIssues();
    for (const n of [2, 3, 4]) await adapter.issueState(n);
    await adapter.reviewsClosing(1);
    await adapter.issueForBranch('b');
    await adapter.openReviews();
    await adapter.listMilestones({ since: '2026-08-08T00:00:00.000Z' });
    assert.deepEqual(world.calls().map(fingerprint), GOLDEN_CALLS);
  });
}

test('[github] with a staging branch the reads that need the link send one more call per run, never one per Issue', async () => {
  const { run, world, project } = fakeGithub();
  const adapter = createGithub({ project, staging_branch: 'staging' }, { run });
  for (let n = 1; n <= 5; n++) world.issue({ number: n, labels: [], body: `Issue ${n}` });
  world.review({ number: 80, base: 'staging', branch: 'h1', body: 'Closes #1' });
  const before = world.commandCount();
  await adapter.listOpenIssues();
  const calls = world.calls().slice(before);
  assert.deepEqual(calls.map((c) => c.args.slice(0, 2).join(' ')), ['issue list', 'pr list'], 'the Issue list and one list of the open PRs into staging');
  const list = calls[1].args;
  assert.deepEqual(list.slice(list.indexOf('--base')), ['--base', 'staging', '--state', 'open', '--limit', '1000', '--json', 'number,isDraft,body,headRefName']);
});

test('[github] with a staging branch the branch of an Issue PR is read from the body only when its base is staging', async () => {
  const { run, world, project } = fakeGithub();
  const adapter = createGithub({ project, staging_branch: 'staging' }, { run });
  world.issue({ number: 5 });
  world.review({ number: 80, base: 'main', branch: 'h5', body: 'Closes #5' }); // base main: the platform's own link counts, not the body
  assert.equal(await adapter.issueForBranch('h5'), null, 'the fake has no platform link for it');
  world.issue({ number: 6, reviews: [81] });
  world.review({ number: 81, base: 'main', branch: 'h6', body: '' });
  assert.equal(await adapter.issueForBranch('h6'), 6, 'the platform\'s link still answers');
});

test('[github] the commands carry the project and the host, and nothing is sent twice', async () => {
  const seen = [];
  const { run } = fakeGithub();
  const spy = (args, opts) => { seen.push({ args, opts }); return run(args, opts); };
  const adapter = createGithub({ project: 'acme/app', host: 'ghe.example.com' }, { run: spy });
  await adapter.me();
  await adapter.openReviews();
  assert.equal(seen.length, 2);
  assert.ok(seen.every((c) => c.opts.env?.GH_HOST === 'ghe.example.com'), 'GH_HOST is set for every call');
  assert.deepEqual(seen[1].args.slice(0, 2), ['pr', 'list']);
});

test('[github] without a host, GH_HOST is left alone (github.com)', async () => {
  const seen = [];
  const { run } = fakeGithub();
  await createGithub({ project: 'acme/app' }, { run: (args, opts) => (seen.push(opts), run(args, opts)) }).me();
  assert.equal(seen[0].env?.GH_HOST, undefined);
});

test('[github] a failing gh is an error that names the command, never swallowed', async () => {
  const adapter = createGithub({ project: 'acme/app' }, { run: () => { throw new Error('gh: HTTP 401'); } });
  await assert.rejects(() => adapter.me(), /HTTP 401/);
});

test('[github] a project is required', () => {
  assert.throws(() => createGithub({}, { run: () => '' }), /project/);
});

test('the factory picks the adapter from the config', async () => {
  const { run, project } = fakeGithub();
  const adapter = await createPlatform({ platform: 'github', project }, { run });
  assert.equal(await adapter.me(), 'SrProfessional');
});

test('the factory rejects an unknown platform and a missing one', async () => {
  await assert.rejects(() => createPlatform({ platform: 'bitbucket', project: 'a/b' }), /platform.*bitbucket/);
  await assert.rejects(() => createPlatform({ project: 'a/b' }), /platform/);
});

// Finding 1 of the first smoke test: GitHub's «Close issue» button also closes as COMPLETED, so only the closing event tells a hand close from a merged PR.
test('[github] issueState: an Issue closed by hand as completed is not merged', async () => {
  const { adapter, world } = create();
  world.issue({ number: 50, state: 'closed-by-hand' });
  assert.deepEqual(await adapter.issueState(50), { open: false, merged: false });
});

test('[github] issueState: an Issue closed by a merged PR is merged', async () => {
  const { adapter, world } = create();
  world.issue({ number: 51, state: 'merged' });
  assert.deepEqual(await adapter.issueState(51), { open: false, merged: true });
});

test('[github] issueState: reopened and then closed by hand is not merged; the last close decides', async () => {
  const { adapter, world } = create();
  world.issue({ number: 52, state: 'closed-by-hand', closes: [{ pr: 70, merged: true }, { pr: null }] });
  assert.deepEqual(await adapter.issueState(52), { open: false, merged: false });
  world.issue({ number: 53, state: 'merged', closes: [{ pr: null }, { pr: 71, merged: true }] });
  assert.deepEqual(await adapter.issueState(53), { open: false, merged: true });
});

test('[github] issueState: a closer PR that is not merged, an open Issue, and an Issue with no close event are not merged', async () => {
  const { adapter, world } = create();
  world.issue({ number: 54, state: 'merged', closes: [{ pr: 72, merged: false }] });
  world.issue({ number: 55, state: 'open', closes: [{ pr: 70, merged: true }] }); // reopened since
  world.issue({ number: 56, state: 'merged', closes: [] });
  assert.deepEqual(await adapter.issueState(54), { open: false, merged: false });
  assert.deepEqual(await adapter.issueState(55), { open: true, merged: false });
  assert.deepEqual(await adapter.issueState(56), { open: false, merged: false });
});
