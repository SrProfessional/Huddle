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
