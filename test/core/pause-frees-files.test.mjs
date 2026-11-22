// Issue #300: an explicit pause frees the files of the paused Issue, with or without commits (docs/design.md §22 and §24); parked work keeps the rule of
// Issue #291. Canned fake adapters for GitHub and GitLab, no real call.
import test from 'node:test';
import assert from 'node:assert/strict';
import { run } from '../../lib/cli/run.mjs';
import { pauseBody, resumeBody } from '../../lib/core/pause.mjs';
import { harness } from '../cli/harness.mjs';

const body = (files, { deps = '- None', branch = null } = {}) => `## Depends on\n\n${deps}\n\n## Effort\n\n1\n\n${branch ? `## Branch\n\n\`${branch}\`, created from an up-to-date staging.\n\n` : ''}## Allowed files\n\n${files.map((f) => `- \`${f}\``).join('\n')}\n`;
const pause = (issue, at, id) => (w) => w.comment(issue, { id, author: 'SrProfessional', body: pauseBody('waiting for #9'), createdAt: at });
const resume = (issue, at, id) => (w) => w.comment(issue, { id, author: 'SrProfessional', body: resumeBody(), createdAt: at });
const asAna = (setup, gitlab) => harness({ gitlab, setup, wrap: (a) => ({ ...a, me: async () => 'ana' }) });
const next = async (h) => { h.out.length = 0; assert.equal(await run(['next', '--json'], h.ctx), 0); return JSON.parse(h.text()); };
const labels = async (h) => { h.out.length = 0; assert.equal(await run(['labels', '--dry-run'], h.ctx), 0); return h.text(); };

// #5 is paused and has commits (a PR) or a pushed branch; #12 shares its file.
const withCommits = (extra = []) => (w) => {
  w.issue({ number: 5, title: 'Paused', body: body(['api/a.mjs']), assignees: ['ana'], labels: ['in progress'], reviews: [50] });
  w.review({ number: 50, draft: true, commits: ['2026-11-21T10:00:00Z'] });
  w.issue({ number: 12, title: 'Shares', body: body(['api/a.mjs']), assignees: ['ana'], labels: ['assigned'] });
  for (const f of extra) f(w);
};
const withBranch = (extra = []) => (w) => {
  w.issue({ number: 5, title: 'Paused', body: body(['api/a.mjs'], { branch: 'h5-x' }), assignees: ['ana'], labels: ['in progress'] });
  w.branch('h5-x');
  w.issue({ number: 12, title: 'Shares', body: body(['api/a.mjs']), assignees: ['ana'], labels: ['assigned'] });
  for (const f of extra) f(w);
};

for (const gitlab of [false, true]) {
  const on = gitlab ? 'GitLab' : 'GitHub';

  for (const [name, world] of [['commits', withCommits], ['a pushed branch', withBranch]]) {
    test(`${on}: a paused Issue with ${name} holds no files in huddle next, and says so once`, async () => {
      const r = await next(asAna(world([pause(5, '2026-11-22T10:00:00Z', 501)]), gitlab));
      assert.deepEqual(r.start.map((s) => s.issue), [12], 'the Issue that shares its file can start');
      assert.ok(!r.wait.some((x) => x.issue === 12));
      assert.deepEqual(r.paused.map((p) => [p.issue, p.filesFree]), [[5, ['api/a.mjs']]]);
      const h = asAna(world([pause(5, '2026-11-22T10:00:00Z', 501)]), gitlab);
      h.out.length = 0;
      await run(['next'], h.ctx);
      const lines = h.text().split('\n').filter((l) => /^paused:/.test(l));
      assert.equal(lines.length, 1);
      assert.match(lines[0], /paused: #5 \(waiting for #9\): its files are free; update its branch from the base when it comes back/);
      assert.equal(h.text().match(/its files are free/g).length, 1);
    });

    test(`${on}: a paused Issue with ${name} does not block the board`, async () => {
      const text = await labels(asAna(world([pause(5, '2026-11-22T10:00:00Z', 501)]), gitlab));
      assert.doesNotMatch(text, /#12.*blocked/);
      assert.doesNotMatch(text, /shares api\/a\.mjs with #5/);
    });

    test(`${on}: resuming a paused Issue with ${name} brings its files back`, async () => {
      const r = await next(asAna(world([pause(5, '2026-11-22T10:00:00Z', 501), resume(5, '2026-11-22T11:00:00Z', 502)]), gitlab));
      assert.deepEqual(r.paused, []);
      assert.deepEqual(r.start, []);
      assert.match(r.wait.find((x) => x.issue === 12).why, /shares api\/a\.mjs with #5/);
    });
  }

  test(`${on}: a paused Issue that shares no file says nothing about its files`, async () => {
    const h = asAna((w) => {
      w.issue({ number: 5, title: 'Paused', body: body(['api/a.mjs'], { branch: 'h5-x' }), assignees: ['ana'], labels: ['in progress'] });
      w.branch('h5-x');
      w.issue({ number: 12, title: 'Other', body: body(['api/z.mjs']), assignees: ['ana'], labels: ['assigned'] });
      pause(5, '2026-11-22T10:00:00Z', 501)(w);
    }, gitlab);
    h.out.length = 0;
    await run(['next'], h.ctx);
    assert.doesNotMatch(h.text(), /its files are free/);
  });

  test(`${on}: parked work with commits (needs decision, draft waiting for a dependency) still holds its files`, async () => {
    const decided = await next(asAna((w) => {
      w.issue({ number: 5, title: 'Asked', body: body(['api/a.mjs']), assignees: ['ana'], labels: ['needs decision'], reviews: [50] });
      w.review({ number: 50, draft: true, commits: ['2026-11-21T10:00:00Z'] });
      w.issue({ number: 12, title: 'Shares', body: body(['api/a.mjs']), assignees: ['ana'], labels: ['assigned'] });
    }, gitlab));
    assert.match(decided.wait.find((x) => x.issue === 12).why, /shares api\/a\.mjs with #5, which is parked/);
    const draft = await next(asAna((w) => {
      w.issue({ number: 8, title: 'Draft', body: body(['api/a.mjs'], { deps: '- #99' }), assignees: ['ana'], labels: ['in progress'], reviews: [80] });
      w.review({ number: 80, draft: true, commits: ['2026-11-21T10:00:00Z'] });
      w.issue({ number: 99, title: 'Dependency', body: body(['q.mjs']), assignees: ['luis'], labels: ['assigned'] });
      w.issue({ number: 12, title: 'Shares', body: body(['api/a.mjs']), assignees: ['ana'], labels: ['assigned'] });
    }, gitlab));
    assert.match(draft.wait.find((x) => x.issue === 12).why, /shares api\/a\.mjs with #8, which is parked/);
  });
}
