// Issue #291: the Coach pauses an Issue, and parked work (paused, waiting for a decision, a draft waiting for a dependency) stops using the Player's
// capacity (docs/design.md §24). Canned adapters for GitHub and GitLab, no real call.
import test from 'node:test';
import assert from 'node:assert/strict';
import { run } from '../../lib/cli/run.mjs';
import { pauseBody, resumeBody } from '../../lib/core/pause.mjs';
import { harness, request } from './harness.mjs';

const body = (effort, files, { deps = '- None', branch = null } = {}) => `## Depends on\n\n${deps}\n\n## Effort\n\n${effort}\n\n${branch ? `## Branch\n\n\`${branch}\`, created from an up-to-date staging.\n\n` : ''}## Allowed files\n\n${files.map((f) => `- \`${f}\``).join('\n')}\n`;
const pause = (issue, at, id, reason = 'staging on hold') => (w) => w.comment(issue, { id, author: 'SrProfessional', body: pauseBody(reason), createdAt: at });
const resume = (issue, at, id) => (w) => w.comment(issue, { id, author: 'SrProfessional', body: resumeBody(), createdAt: at });
const asAna = (setup, gitlab) => {
  const h = harness({ gitlab, setup, wrap: (a) => ({ ...a, me: async () => 'ana' }) });
  h.ctx.updateCachePath = '/data/u.json';
  return h;
};
const next = async (h) => { h.out.length = 0; assert.equal(await run(['next', '--json'], h.ctx), 0); return JSON.parse(h.text()); };
const base = (w) => {
  w.issue({ number: 5, title: 'Paused one', body: body(2, ['api/a.mjs']), assignees: ['ana'], labels: ['in progress'] });
  w.issue({ number: 6, title: 'Live', body: body(1, ['api/b.mjs']), assignees: ['ana'], labels: ['in progress'] });
  w.issue({ number: 10, title: 'Big', body: body(3, ['web/x.tsx']), assignees: ['ana'], labels: ['assigned'] });
  w.issue({ number: 12, title: 'Shares with #5', body: body(1, ['api/a.mjs']), assignees: ['ana'], labels: ['assigned'] });
};

for (const gitlab of [false, true]) {
  const on = gitlab ? 'GitLab' : 'GitHub';

  test(`${on}: a pause comment gives the points back, the Issue is listed apart and never offered; a resume comment brings it back`, async () => {
    const plain = await next(asAna(base, gitlab));
    assert.equal(plain.used, 3);
    assert.deepEqual(plain.start, [], '#10 needs 3 and only 2 are free; #12 shares a file with #5');
    const h = asAna((w) => { base(w); pause(5, '2026-11-22T10:00:00Z', 501)(w); }, gitlab);
    const r = await next(h);
    assert.equal(r.used, 1, 'only #6 counts');
    assert.deepEqual(r.paused.map((p) => [p.issue, p.reason]), [[5, 'staging on hold']]);
    assert.deepEqual(r.start.map((s) => s.issue), [10, 12], 'its points are free and, with no branch, its file does not hold');
    assert.ok(!r.active.some((a) => a.issue === 5));
    h.out.length = 0;
    await run(['next'], h.ctx);
    assert.match(h.text(), /paused: #5/);
    assert.match(h.text(), /Capacity: 5 points, 1 in use/);
    const back = await next(asAna((w) => { base(w); pause(5, '2026-11-22T10:00:00Z', 501)(w); resume(5, '2026-11-22T11:00:00Z', 502)(w); }, gitlab));
    assert.equal(back.used, 3);
    assert.deepEqual(back.paused, []);
    const newest = await next(asAna((w) => { base(w); resume(5, '2026-11-22T10:00:00Z', 501)(w); pause(5, '2026-11-22T11:00:00Z', 502)(w); }, gitlab));
    assert.equal(newest.used, 1, 'the newest of the two wins');
  });

  test(`${on}: a parked Issue (not paused) holds its files only when it already has a branch with commits; a paused one never does (Issue #300)`, async () => {
    const withBranch = await next(asAna((w) => {
      w.issue({ number: 5, title: 'Asked', body: body(2, ['api/a.mjs']), assignees: ['ana'], labels: ['needs decision'], reviews: [50] });
      w.review({ number: 50, draft: true, commits: ['2026-11-21T10:00:00Z'] });
      w.issue({ number: 12, title: 'Shares with #5', body: body(1, ['api/a.mjs']), assignees: ['ana'], labels: ['assigned'] });
    }, gitlab));
    assert.equal(withBranch.used, 0);
    assert.deepEqual(withBranch.start, []);
    assert.match(withBranch.wait.find((x) => x.issue === 12).why, /shares api\/a\.mjs with #5, which is parked/);
    const pushed = await next(asAna((w) => {
      w.issue({ number: 5, title: 'Asked', body: body(2, ['api/a.mjs'], { branch: 'h5-x' }), assignees: ['ana'], labels: ['needs decision'] });
      w.branch('h5-x');
      w.issue({ number: 12, title: 'Shares with #5', body: body(1, ['api/a.mjs']), assignees: ['ana'], labels: ['assigned'] });
    }, gitlab));
    assert.deepEqual(pushed.start, [], 'a pushed branch holds too');
    const paused = await next(asAna((w) => {
      w.issue({ number: 5, title: 'Paused one', body: body(2, ['api/a.mjs']), assignees: ['ana'], labels: ['in progress'], reviews: [50] });
      w.review({ number: 50, draft: true, commits: ['2026-11-21T10:00:00Z'] });
      w.issue({ number: 12, title: 'Shares with #5', body: body(1, ['api/a.mjs']), assignees: ['ana'], labels: ['assigned'] });
      pause(5, '2026-11-22T10:00:00Z', 501)(w);
    }, gitlab));
    assert.deepEqual(paused.start.map((s) => s.issue), [12], 'a pause frees the files even with commits');
  });

  test(`${on}: a paused Issue whose request came back is not resumed`, async () => {
    const r = await next(asAna((w) => {
      w.issue({ number: 3, title: 'Came back', body: body(2, ['c.mjs']), assignees: ['ana'], labels: ['changes requested from Coach'], reviews: [30] });
      w.review({ number: 30 });
      w.reviewComment(30, request(300));
      pause(3, '2026-11-22T10:00:00Z', 301)(w);
    }, gitlab));
    assert.deepEqual(r.resume, []);
    assert.equal(r.used, 0);
    assert.deepEqual(r.paused.map((p) => p.issue), [3]);
  });

  test(`${on}: needs decision parks an Issue; a request that came back never does`, async () => {
    const r = await next(asAna((w) => {
      w.issue({ number: 7, title: 'Asked', body: body(2, ['d.mjs']), assignees: ['ana'], labels: ['needs decision'] });
      w.issue({ number: 6, title: 'Live', body: body(1, ['api/b.mjs']), assignees: ['ana'], labels: ['in progress'] });
    }, gitlab));
    assert.equal(r.used, 1);
    assert.deepEqual(r.parked.map((p) => [p.issue, p.why]), [[7, 'needs decision']]);
    const back = await next(asAna((w) => {
      w.issue({ number: 7, title: 'Asked', body: body(2, ['d.mjs']), assignees: ['ana'], labels: ['needs decision', 'changes requested from Coach'], reviews: [70] });
      w.review({ number: 70 });
      w.reviewComment(70, request(700));
    }, gitlab));
    assert.deepEqual(back.parked, []);
    assert.equal(back.used, 2, 'the Player has to act on it: it counts');
  });

  test(`${on}: a draft PR that waits for an open dependency is parked, and counts again when the dependency merges`, async () => {
    const world = (state) => (w) => {
      w.issue({ number: 8, title: 'Draft', body: body(2, ['e.mjs'], { deps: '- #99' }), assignees: ['ana'], labels: ['in progress'], reviews: [80] });
      w.review({ number: 80, draft: true, commits: ['2026-11-21T10:00:00Z'] });
      w.issue({ number: 99, title: 'Dependency', body: body(1, ['q.mjs']), assignees: ['luis'], labels: state === 'open' ? ['assigned'] : [], state });
      w.issue({ number: 13, title: 'Shares with #8', body: body(1, ['e.mjs']), assignees: ['ana'], labels: ['assigned'] });
    };
    const r = await next(asAna(world('open'), gitlab));
    assert.equal(r.used, 0);
    assert.deepEqual(r.parked.map((p) => [p.issue, p.why]), [[8, 'waits for #99']]);
    assert.ok(r.wait.some((x) => x.issue === 13 && /shares e\.mjs with #8, which is parked/.test(x.why)), 'it has commits, so its file holds');
    const done = await next(asAna(world('merged'), gitlab));
    assert.equal(done.used, 2, 'the dependency merged: it counts again');
    assert.deepEqual(done.parked, []);
  });

  test(`${on}: used and every «points in use» message give the same number (8 of 5, not 4 of 5)`, async () => {
    const r = await next(asAna((w) => {
      for (const n of [1, 2, 3, 4]) {
        w.issue({ number: n, title: `Came back ${n}`, body: body(2, [`f${n}.mjs`]), assignees: ['ana'], labels: ['changes requested from Coach'], reviews: [n * 10] });
        w.review({ number: n * 10 });
        w.reviewComment(n * 10, request(n * 100));
      }
    }, gitlab));
    assert.equal(r.used, 8);
    assert.equal(r.over, '8 of 5 points in use: finish one first');
    assert.ok(r.wait.length > 0);
    for (const w of r.wait) {
      const m = /(\d+) of 5 points in use/.exec(w.why);
      if (m) assert.equal(m[1], '8', w.why);
    }
    assert.equal(r.resume.length, 2, 'resuming is how it gets back under: two fit, the others wait');
    assert.equal(r.wait.filter((w) => /no room/.test(w.why)).length, 2);
  });
}

// --- the commands -------------------------------------------------------------------------------------------------------------------

const coachWorld = (w) => w.issue({ number: 5, title: 'Started', body: body(2, ['api/a.mjs']), assignees: ['ana'], labels: ['in progress'] });
const mine = (n, h) => h.world.commentsOf(n);

for (const gitlab of [false, true]) {
  const on = gitlab ? 'GitLab' : 'GitHub';

  test(`${on}: huddle pause leaves the pause comment, --off the resume comment, and both run the labels`, async () => {
    const h = harness({ gitlab, setup: (w) => w.issue({ number: 7, title: 'Not started', body: body(1, ['n.mjs']), assignees: ['ana'], labels: [] }) });
    assert.equal(await run(['pause', '7', '--reason', 'staging on hold'], h.ctx), 0);
    const [first] = mine(7, h);
    assert.match(first.body, /⏸️ Paused by the Coach: staging on hold/);
    assert.match(first.body, /<!-- huddle-paused -->/);
    assert.deepEqual(h.world.labelsOf(7), ['assigned'], 'huddle labels --issue 7 ran after it');
    assert.equal(await run(['pause', '7', '--off'], h.ctx), 0);
    assert.match(mine(7, h)[1].body, /<!-- huddle-resumed -->/);
  });

  test(`${on}: only the Coach's login can pause or resume`, async () => {
    const h = harness({ gitlab, setup: coachWorld, wrap: (a) => ({ ...a, me: async () => 'ana' }) });
    assert.equal(await run(['pause', '5'], h.ctx), 1);
    assert.match(h.errText() + h.text(), /only the Coach/i);
    assert.equal(await run(['pause', '5', '--off'], h.ctx), 1);
    assert.deepEqual(mine(5, h), []);
  });

  test(`${on}: an Issue that is not open, and a bad argument, change nothing`, async () => {
    const h = harness({ gitlab, setup: (w) => w.issue({ number: 9, title: 'Done', body: body(1, ['x']), state: 'merged' }) });
    assert.equal(await run(['pause', '9'], h.ctx), 1);
    assert.deepEqual(mine(9, h), []);
    assert.equal(await run(['pause'], h.ctx), 2);
    assert.equal(await run(['pause', '9', '--off', '--reason', 'x'], h.ctx), 2);
  });
}
