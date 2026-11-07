// Huddle: canAssign(login) on each platform (Issue #36). The shared part is in contract.mjs; these are the rules of one platform each.
import test from 'node:test';
import assert from 'node:assert/strict';
import { fakeGithub } from './fake-gh.mjs';
import { fakeGitlab } from './fake-glab.mjs';
import { createGithub } from '../../lib/platform/github.mjs';
import { createGitlab } from '../../lib/platform/gitlab.mjs';

test('[github] canAssign asks the collaborators endpoint, and a 404 means no; any other failure is thrown, not turned into a no', async () => {
  const { run, world, project } = fakeGithub();
  const adapter = createGithub({ project }, { run });
  world.member('eva');
  assert.equal(await adapter.canAssign('eva'), true);
  world.user('outsider');
  assert.equal(await adapter.canAssign('outsider'), false);
  const broken = createGithub({ project }, { run: () => { throw new Error('gh api failed: could not resolve host (network)'); } });
  await assert.rejects(() => broken.canAssign('eva'), /network/);
});

test('[gitlab] canAssign needs the Developer role or more: Guest and Reporter cannot be assigned', async () => {
  const { run, world, project } = fakeGitlab();
  const adapter = createGitlab({ project }, { run });
  world.member('rep', 'reporter');
  world.member('gst', 'guest');
  world.member('dev', 'developer');
  world.member('mnt', 'maintainer');
  assert.equal(await adapter.canAssign('rep'), false);
  assert.equal(await adapter.canAssign('gst'), false);
  assert.equal(await adapter.canAssign('dev'), true);
  assert.equal(await adapter.canAssign('mnt'), true);
});

test('[gitlab] canAssign counts a member inherited from a group (members/all), and a failure other than 404 is thrown', async () => {
  const { run, world, project } = fakeGitlab();
  const adapter = createGitlab({ project }, { run });
  world.member('inherited', 'developer');
  assert.equal(await adapter.canAssign('inherited'), true);
  const broken = createGitlab({ project }, { run: () => { throw new Error('glab api failed: network down'); } });
  await assert.rejects(() => broken.canAssign('inherited'), /network/);
});
