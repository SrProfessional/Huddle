import test from 'node:test';
import assert from 'node:assert/strict';
import { contract } from './contract.mjs';
import { fakeGithub } from './fake-gh.mjs';
import { createGithub } from '../../lib/platform/github.mjs';
import { createPlatform } from '../../lib/platform/index.mjs';

// Every test here uses the in-memory fake; none can start a real `gh` (the fake throws on a command it does not know).
const create = () => {
  const { run, world, project } = fakeGithub();
  return { adapter: createGithub({ project }, { run }), world };
};

contract({ name: 'github', create });

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
