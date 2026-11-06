// Huddle: what is specific to each platform in the progress operations (the shared part is in contract.mjs). Fakes only; no network.
import test from 'node:test';
import assert from 'node:assert/strict';
import { fakeGithub } from './fake-gh.mjs';
import { fakeGitlab } from './fake-glab.mjs';
import { createGithub } from '../../lib/platform/github.mjs';
import { createGitlab } from '../../lib/platform/gitlab.mjs';

test('[github] pinIssue pins the created Issue; listMilestones takes one GraphQL query per page, not one per Issue', async () => {
  const { run, world } = fakeGithub();
  const calls = [];
  const adapter = createGithub({ project: 'acme/app' }, { run: (args, opts) => { calls.push(args); return run(args, opts); } });
  const created = await adapter.createIssue({ title: 'Huddle progress', body: 'x' });
  assert.equal(await adapter.pinIssue(created), true);
  assert.deepEqual(world.pinned(), [created.number]);

  world.milestone({ title: 'A' });
  world.milestone({ title: 'B', state: 'closed', closedAt: '2026-10-01T00:00:00Z' });
  world.issue({ number: 1, milestone: 'A', state: 'merged' });
  world.issue({ number: 2, milestone: 'B', state: 'merged' });
  calls.length = 0;
  const found = await adapter.listMilestones({ since: '2026-08-08T00:00:00.000Z' });
  assert.equal(found.length, 2);
  assert.equal(calls.length, 2, 'one query for the open milestones and one for the closed ones');
});

test('[github] closed milestones are paged newest first and paging stops at the first one older than the window', async () => {
  const { run, world } = fakeGithub();
  const calls = [];
  const adapter = createGithub({ project: 'acme/app' }, { run: (args, opts) => { calls.push(args); return run(args, opts); } });
  world.milestone({ title: 'Recent 1', state: 'closed', closedAt: '2026-10-30T00:00:00Z' });
  world.milestone({ title: 'Recent 2', state: 'closed', closedAt: '2026-10-20T00:00:00Z' });
  world.milestone({ title: 'Old 1', state: 'closed', closedAt: '2026-01-01T00:00:00Z' });
  world.milestone({ title: 'Old 2', state: 'closed', closedAt: '2025-01-01T00:00:00Z' });
  const found = await adapter.listMilestones({ since: '2026-08-08T00:00:00.000Z' });
  assert.deepEqual(found.map((m) => m.title), ['Recent 1', 'Recent 2']);
  // open (1 query, none open) + closed page 1 (two recent) + closed page 2 (first is old: stop)
  assert.equal(calls.length, 3);
});

test('[github] a milestone closed long ago but edited recently is not in the window: closedAt decides, updatedAt only stops the paging', async () => {
  const { run, world } = fakeGithub();
  const adapter = createGithub({ project: 'acme/app' }, { run });
  world.milestone({ title: 'Edited yesterday', state: 'closed', closedAt: '2026-04-20T00:00:00Z', updatedAt: '2026-11-05T00:00:00Z' }); // closed 200 days ago
  world.milestone({ title: 'Closed last month', state: 'closed', closedAt: '2026-10-06T00:00:00Z' });
  world.issue({ number: 1, milestone: 'Edited yesterday', state: 'merged' });
  world.issue({ number: 2, milestone: 'Closed last month', state: 'merged' });
  const found = await adapter.listMilestones({ since: '2026-08-08T00:00:00.000Z' });
  assert.deepEqual(found.map((m) => m.title), ['Closed last month']);
});

test('[gitlab] closed_by calls run at most 8 at a time, however many closed Issues a milestone has', async () => {
  const { run, world, project } = fakeGitlab();
  let running = 0, peak = 0, closedByCalls = 0;
  const slow = async (args, opts) => {
    const isClosedBy = args.some((a) => String(a).includes('/closed_by'));
    if (!isClosedBy) return run(args, opts);
    closedByCalls += 1;
    running += 1;
    peak = Math.max(peak, running);
    await new Promise((r) => setTimeout(r, 5));
    running -= 1;
    return run(args, opts);
  };
  const adapter = createGitlab({ project }, { run: slow });
  world.milestone({ title: 'Big' });
  for (let n = 1; n <= 30; n++) world.issue({ number: n, milestone: 'Big', state: 'merged' });
  const [m] = await adapter.listMilestones({ since: '2026-08-08T00:00:00.000Z' });
  assert.equal(m.issues.length, 30);
  assert.ok(m.issues.every((i) => i.merged));
  assert.equal(closedByCalls, 30, 'one call per closed Issue');
  assert.ok(peak <= 8, `at most 8 at once (saw ${peak})`);
  assert.ok(peak > 1, 'still concurrent');
});

test('[gitlab] pinIssue does nothing (GitLab has no pinned Issues) and says so', async () => {
  const { run, world, project } = fakeGitlab();
  const adapter = createGitlab({ project }, { run });
  const created = await adapter.createIssue({ title: 'Huddle progress', body: 'x' });
  assert.equal(await adapter.pinIssue(created), false);
  assert.deepEqual(world.pinned(), []);
});

test('[gitlab] a closed milestone older than the window costs no Issue calls', async () => {
  const { run, world, project } = fakeGitlab();
  const calls = [];
  const adapter = createGitlab({ project }, { run: (args, opts) => { calls.push(args.join(' ')); return run(args, opts); } });
  world.milestone({ title: 'Old', state: 'closed', closedAt: '2026-01-01T00:00:00Z' });
  world.issue({ number: 1, milestone: 'Old', state: 'merged' });
  assert.deepEqual(await adapter.listMilestones({ since: '2026-08-08T00:00:00.000Z' }), []);
  assert.ok(!calls.some((c) => c.includes('/issues')), 'the old milestone\'s Issues were never read');
});
