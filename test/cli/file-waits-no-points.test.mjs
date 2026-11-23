// Issue #303: an Issue that waits only for a file held by another Issue that counts uses none of the Player's points: `huddle next` lists it
// apart, leaves it out of «in use», and it counts again when the holder is done. Canned adapters for GitHub and GitLab, no real call.
import test from 'node:test';
import assert from 'node:assert/strict';
import { run } from '../../lib/cli/run.mjs';
import { claimBody } from '../../lib/core/machine.mjs';
import { harness } from './harness.mjs';

const body = (effort, files, deps = '- None') => `## Depends on\n\n${deps}\n\n## Effort\n\n${effort}\n\n## Allowed files\n\n${files.map((f) => `- \`${f}\``).join('\n')}\n`;
const request = (id) => ({ id, author: 'SrProfessional', body: '## Prompt for Claude Code\n\n```text\nFix it.\n```', createdAt: '2026-11-21T10:00:00Z' });
function mk(setup, { gitlab = false } = {}) {
  const h = harness({ gitlab, setup, wrap: (a) => ({ ...a, me: async () => 'ana' }) });
  Object.assign(h.ctx, { updateCachePath: '/data/u.json', sharedDir: '/home/.huddle', now: () => Date.parse('2026-11-21T12:00:00Z'), session: { tool: 'claude', id: 'S1' } });
  return h;
}
const next = async (h, ...more) => { h.out.length = 0; assert.equal(await run(['next', ...more], h.ctx), 0); return more.includes('--json') ? JSON.parse(h.text()) : h.text(); };

// #40 and #41 both have a request from the Coach on the same file (2 points each); #60 is ready and needs 3 points on another file.
const ask = (w, gitlab, pr, c) => (gitlab ? w.reviewComment(pr, c) : w.comment(pr, c)); // the Coach's request sits on the PR (GitHub) or MR (GitLab)
const world = ({ holder = 'request', gitlab = false } = {}) => (w) => {
  w.issue({ number: 40, title: 'Holder', body: body(2, ['same.mjs']), assignees: ['ana'], labels: holder === 'request' ? ['changes requested from Coach'] : ['in review'], reviews: [400] });
  w.review({ number: 400 });
  if (holder === 'request') ask(w, gitlab, 400, request(4000));
  w.issue({ number: 41, title: 'Waiter', body: body(2, ['same.mjs']), assignees: ['ana'], labels: ['changes requested from Coach'], reviews: [410] });
  w.review({ number: 410 });
  ask(w, gitlab, 410, request(4100));
  w.issue({ number: 60, title: 'Ready', body: body(3, ['other.mjs']), assignees: ['ana'], labels: ['assigned'] });
};

for (const gitlab of [false, true]) {
  const on = gitlab ? 'GitLab' : 'GitHub';

  test(`${on}: an Issue that waits only for a file is listed apart, not counted in use, and frees room for another start`, async () => {
    const r = await next(mk(world({ gitlab }), { gitlab }), '--json');
    assert.deepEqual(r.resume.map((x) => x.issue), [40], 'the holder resumes');
    assert.deepEqual(r.waitsForFiles, [{ issue: 41, file: 'same.mjs', holder: 40, effort: 2 }]);
    assert.equal(r.used, 2, '#41 does not count: only the holder does');
    assert.deepEqual(r.start.map((x) => x.issue), [60], '#60 fits in the points #41 would have held');
    assert.match(r.wait.find((w) => w.issue === 41).why, /resume after #40: both touch same\.mjs/, 'it keeps its reason in the waits (and in the stalled block)');
  });

  test(`${on}: next in words says «waits for files»`, async () => {
    const t = await next(mk(world({ gitlab }), { gitlab }));
    assert.match(t, /Capacity: 5 points, 2 in use\./);
    assert.match(t, /waits for files: #41 \(same\.mjs, #40\)/);
  });

  test(`${on}: it counts again when the holder is done (in review): it resumes and its points are in use`, async () => {
    const r = await next(mk(world({ holder: 'review', gitlab }), { gitlab }), '--json');
    assert.deepEqual(r.waitsForFiles, []);
    assert.deepEqual(r.resume.map((x) => x.issue), [41]);
    assert.equal(r.used, 2, 'its own points count now');
  });

  test(`${on}: a wait for a dependency or for capacity counts as before`, async () => {
    const r = await next(mk((w) => {
      w.issue({ number: 70, title: 'Running', body: body(3, ['a.mjs']), assignees: ['ana'], labels: ['in progress'] });
      w.issue({ number: 71, title: 'Needs room', body: body(3, ['b.mjs']), assignees: ['ana'], labels: ['assigned'] });
      w.issue({ number: 72, title: 'Waits dep', body: body(1, ['c.mjs'], '- #99'), assignees: ['ana'], labels: ['blocked'] });
      w.issue({ number: 99, title: 'Open dep', body: body(1, ['q.mjs']), assignees: ['luis'], labels: ['assigned'] });
    }, { gitlab }), '--json');
    assert.deepEqual(r.waitsForFiles, []);
    assert.equal(r.used, 3);
    assert.match(r.wait.find((w) => w.issue === 71).why, /no room/);
    assert.equal(r.wait.find((w) => w.issue === 72).why, 'waits for #99');
  });

  test(`${on}: the stalled block still lists an Issue that waits only for a file, with its reason`, async () => {
    // #50 runs on another machine and holds same.mjs; #41 has a request on that file: nothing can start or resume.
    const r = await next(mk((w) => {
      w.issue({ number: 50, title: 'Elsewhere', body: body(1, ['same.mjs']), assignees: ['ana'], labels: ['in progress'] });
      w.comment(50, { id: 5001, author: 'ana', body: claimBody({ id: 'other-id', name: 'Mac' }), createdAt: '2026-11-21T09:00:00Z' });
      w.issue({ number: 41, title: 'Waiter', body: body(2, ['same.mjs']), assignees: ['ana'], labels: ['changes requested from Coach'], reviews: [410] });
      w.review({ number: 410 });
      ask(w, gitlab, 410, request(4100));
    }, { gitlab }), '--json');
    assert.deepEqual(r.waitsForFiles.map((x) => [x.issue, x.holder]), [[41, 50]]);
    assert.equal(r.used, 0, 'neither counts here: #50 runs on the other machine, #41 waits for its file');
    assert.ok(r.stalled?.reasons.some((x) => x.issue === 41 && /both touch same\.mjs/.test(x.text)), JSON.stringify(r.stalled));
  });
}
