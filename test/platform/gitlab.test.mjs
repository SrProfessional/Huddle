import test from 'node:test';
import assert from 'node:assert/strict';
import { contract } from './contract.mjs';
import { fakeGitlab, PAGE_SIZE } from './fake-glab.mjs';
import { createGitlab } from '../../lib/platform/gitlab.mjs';
import { createPlatform } from '../../lib/platform/index.mjs';

// Every test here uses the in-memory fake; none can start a real `glab` (the fake throws on a call it does not know).
const make = (opts = {}) => {
  const fake = fakeGitlab(opts);
  return { ...fake, adapter: createGitlab({ project: fake.project, host: fake.host }, { run: fake.run }) };
};

contract({ name: 'gitlab', create: () => { const { adapter, world } = make(); return { adapter, world }; } });

test('[gitlab] system notes are dropped, and a post lands among human notes only', async () => {
  const { adapter, world } = make();
  world.issue({ number: 5, title: 'Five' });
  await adapter.setLabels(5, ['ready'], []);
  world.comment(5, { id: 101, author: 'SrProfessional', body: 'hello', createdAt: '2026-11-04T10:00:00Z' });
  assert.ok(world.systemNotes(5) >= 2, 'the fake really has system notes');
  assert.deepEqual((await adapter.comments(5)).map((c) => c.id), [101]);
});

test('[gitlab] paged responses are read to the end', async () => {
  const { adapter, world } = make();
  const total = PAGE_SIZE * 3 + 1;
  for (let n = 1; n <= total; n++) world.issue({ number: n, title: `T${n}`, body: '{"tricky": "]["}' });
  for (let n = 1; n <= total; n++) world.review({ number: 100 + n });
  for (let id = 1; id <= total; id++) world.comment(1, { id, author: 'ana', body: `c ] [ ${id}`, createdAt: `2026-11-04T10:00:${String(id).padStart(2, '0')}Z` });
  assert.equal((await adapter.listOpenIssues()).length, total);
  assert.equal((await adapter.openReviews()).length, total);
  assert.equal((await adapter.comments(1)).length, total);
});

test('[gitlab] a dependency counts as merged only when closed_by has a merged MR', async () => {
  const { adapter, world } = make();
  world.issue({ number: 1, state: 'closed-by-hand', reviews: [20] });
  world.review({ number: 20, open: false }); // an MR that was closed, not merged
  world.issue({ number: 2, state: 'merged', reviews: [21, 22] });
  world.review({ number: 21, open: false });
  await adapter.merge(22).catch(() => {}); // unknown MR: the fake refuses, nothing changes
  world.review({ number: 22 });
  await adapter.merge(22);
  world.issue({ number: 3, reviews: [23] }); // still open, even with an MR on its way
  world.review({ number: 23 });
  assert.deepEqual(await adapter.issueState(1), { open: false, merged: false });
  assert.deepEqual(await adapter.issueState(2), { open: false, merged: true });
  assert.deepEqual(await adapter.issueState(3), { open: true, merged: false });
});

test('[gitlab] closed_by is asked only for a closed Issue', async () => {
  const { adapter, world, run } = make();
  world.issue({ number: 3 });
  const seen = [];
  const a = createGitlab({ project: 'acme/app' }, { run: (args, o) => (seen.push(args.join(' ')), run(args, o)) });
  await a.issueState(3);
  assert.equal(seen.length, 1);
  assert.ok(!seen[0].includes('closed_by'));
  void adapter;
});

test('[gitlab] the project path with groups is URL-encoded in every call', async () => {
  const { adapter, world, project } = make({ project: 'team/sub/app' });
  world.issue({ number: 1 });
  await adapter.listOpenIssues();
  await adapter.setLabels(1, ['a'], []);
  await adapter.postComment(1, 'x');
  const project_calls = world.calls().map((c) => c.args.at(-1)).filter((e) => e.startsWith('projects/'));
  assert.ok(project_calls.length >= 4);
  assert.ok(project_calls.every((e) => e.startsWith('projects/team%2Fsub%2Fapp/')), project_calls.join('\n'));
  assert.equal(project, 'team/sub/app');
});

test('[gitlab] host reaches glab as --hostname on every call', async () => {
  const { adapter, world } = make({ host: 'gitlab.example.com' });
  world.issue({ number: 1, assignees: [] });
  world.review({ number: 9 });
  await adapter.me();
  await adapter.listOpenIssues();
  await adapter.assign(1, 'ana');
  await adapter.merge(9);
  const calls = world.calls();
  assert.ok(calls.length >= 4);
  for (const c of calls) {
    const i = c.args.indexOf('--hostname');
    assert.ok(i > 0 && c.args[i + 1] === 'gitlab.example.com', c.args.join(' '));
  }
});

test('[gitlab] an empty host means gitlab.com: no --hostname at all', async () => {
  const { adapter, world } = make();
  world.issue({ number: 1 });
  await adapter.me();
  await adapter.listOpenIssues();
  assert.ok(world.calls().every((c) => !c.args.includes('--hostname')));
});

test('[gitlab] assign keeps the people already assigned (GitLab replaces the list) and refuses an unknown user', async () => {
  const { adapter, world } = make();
  world.issue({ number: 1, assignees: ['ana'] });
  await adapter.assign(1, 'luis');
  assert.deepEqual(world.assigneesOf(1), ['ana', 'luis']);
  await adapter.assign(1, 'luis');
  assert.deepEqual(world.assigneesOf(1), ['ana', 'luis']);
  await assert.rejects(() => adapter.assign(1, 'ghost'), /ghost/);
});

test('[gitlab] editing or marking a note nobody listed is a clear error', async () => {
  const { adapter, world } = make();
  world.issue({ number: 1 });
  await assert.rejects(() => adapter.editComment(555, 'x'), /555/);
  await assert.rejects(() => adapter.markTaken(555), /555/);
});

test('[gitlab] a comment url points at the note on the right host', async () => {
  const { adapter, world } = make({ host: 'gitlab.example.com' });
  world.issue({ number: 4 });
  const { id, url } = await adapter.postComment(4, 'hi');
  assert.equal(url, `https://gitlab.example.com/acme/app/-/issues/4#note_${id}`);
});

test('[gitlab] a failing glab is an error, never swallowed; a project is required', async () => {
  const adapter = createGitlab({ project: 'a/b' }, { run: () => { throw new Error('glab: 401 Unauthorized'); } });
  await assert.rejects(() => adapter.me(), /401/);
  assert.throws(() => createGitlab({}, { run: () => '' }), /project/);
});

test('[gitlab] the factory picks the adapter from the config', async () => {
  const { run, project, host } = fakeGitlab();
  const adapter = await createPlatform({ platform: 'gitlab', project, host }, { run });
  assert.equal(await adapter.me(), 'SrProfessional');
});
