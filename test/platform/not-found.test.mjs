// Huddle: canAssign and findUser tell «not found» from every other failure by the platform's own error text, and GitLab logins by lower case (PR #38 review).
import test from 'node:test';
import assert from 'node:assert/strict';
import { fakeGithub } from './fake-gh.mjs';
import { fakeGitlab } from './fake-glab.mjs';
import { createGithub } from '../../lib/platform/github.mjs';
import { createGitlab } from '../../lib/platform/gitlab.mjs';

// The message of a runner error holds the command and its arguments, so a login or an id that contains «404» must not read as «not found».
const offline = (message) => () => { throw new Error(message); };

test('[github] a login that contains 404 and an offline failure is thrown, not «cannot be assigned»', async () => {
  const broken = createGithub({ project: 'acme/app' }, { run: offline('gh api repos/acme/app/collaborators/dev-404 failed: dial tcp: lookup api.github.com: no such host') });
  await assert.rejects(() => broken.canAssign('dev-404'), /no such host/);
});

test('[github] a real 404 for a login that contains 404 is still a «no», and a collaborator is a yes', async () => {
  const { run, world, project } = fakeGithub();
  const adapter = createGithub({ project }, { run });
  world.user('dev-404');
  assert.equal(await adapter.canAssign('dev-404'), false);
  world.member('dev-404');
  assert.equal(await adapter.canAssign('dev-404'), true);
});

test('[github] findUser with a login that contains 404 and an offline failure is thrown too', async () => {
  const broken = createGithub({ project: 'acme/app' }, { run: offline('gh api users/dev-404 failed: no such host') });
  await assert.rejects(() => broken.findUser('dev-404'), /no such host/);
});

const usersAnswer = JSON.stringify([{ id: 404, username: 'dev', name: 'dev' }]);
const gitlabRunner = (membersError) => (args) => {
  if (args.some((a) => String(a).startsWith('users?'))) return usersAnswer;
  throw new Error(membersError);
};

test('[gitlab] a user id of 404 and an offline failure is thrown, not «cannot be assigned»', async () => {
  const run = gitlabRunner('glab api projects/acme%2Fapp/members/all/404 failed: dial tcp: no such host');
  await assert.rejects(() => createGitlab({ project: 'acme/app' }, { run }).canAssign('dev'), /no such host/);
});

test('[gitlab] a real 404 for a member id of 404 is still a «no»', async () => {
  const run = gitlabRunner('glab api projects/acme%2Fapp/members/all/404 failed: 404 Not Found');
  assert.equal(await createGitlab({ project: 'acme/app' }, { run }).canAssign('dev'), false);
});

test('[gitlab] usernames are case-insensitive: canAssign and findUser find Ana as ana', async () => {
  const { run, world, project } = fakeGitlab();
  const adapter = createGitlab({ project }, { run });
  world.member('ana', 'developer');
  assert.equal(await adapter.canAssign('Ana'), true);
  assert.equal(await adapter.findUser('Ana'), true);
  assert.equal(await adapter.findUser('ANA'), true);
  assert.equal(await adapter.canAssign('nobody'), false);
  assert.equal(await adapter.findUser('nobody'), false);
});
