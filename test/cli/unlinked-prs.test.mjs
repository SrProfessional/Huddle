// Issue #334, docs/design.md §19: an open PR/MR that closes no Issue is never invisible. `huddle queue` lists it (drafts apart), `huddle doctor`
// warns once, and a merged PR that only said «Refs #N» gets a one-line notice from `huddle land` and `huddle queue`.
// Fakes only: the adapters get canned `gh`/`glab` answers, never a real platform.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { run } from '../../lib/cli/run.mjs';
import { CONFIG, GITLAB_CONFIG, harness } from './harness.mjs';

const STAGING = { ...CONFIG, staging_branch: 'staging' };
const STAGING_GL = { ...GITLAB_CONFIG, staging_branch: 'staging' };
const MANAGED = '## Depends on\n\n- None\n';
const WRITES = new Set(['setLabels', 'ensureLabels', 'assign', 'merge', 'postComment', 'editComment', 'markTaken', 'createIssue', 'updateIssue', 'closeIssue']);

/**
 * Issue 92 is open and says its branch; PR 94 only «Refs #92»; PR 95 closes Issue 93; PR 96 is a draft that closes nothing; PR 97 targets another branch;
 * PR 98 has no keyword and no reference, but its branch is the Branch of Issue 99; PR 100 is a plain PR into main with nothing in it.
 */
const world = (w) => {
  w.issue({ number: 92, title: 'The thing', body: `${MANAGED}\n## Branch\n\n\`h92-thing\`, from staging.\n`, assignees: ['ana'], labels: ['in progress'] });
  w.issue({ number: 93, title: 'Linked one', body: MANAGED, assignees: ['ana'] });
  w.issue({ number: 99, title: 'Other thing', body: `${MANAGED}\n## Branch\n\n\`h99-other\`, from staging.\n`, assignees: ['luis'], labels: ['in progress'] });
  w.review({ number: 94, base: 'staging', branch: 'h92-part', body: 'Part of the work.\n\nRefs #92' });
  w.review({ number: 95, base: 'staging', branch: 'h93-x', body: 'Closes #93' });
  w.review({ number: 96, base: 'staging', branch: 'wip', draft: true, body: 'Not ready' });
  w.review({ number: 97, base: 'feature', branch: 'side', body: 'Another base' });
  w.review({ number: 98, base: 'staging', branch: 'h99-other', body: 'No keyword at all' });
  w.review({ number: 100, base: 'main', branch: 'tweak', body: 'A tweak' });
};

for (const gitlab of [false, true]) {
  const kind = gitlab ? 'gitlab' : 'github';
  const ref = gitlab ? 'MR !' : 'PR #';
  const config = gitlab ? STAGING_GL : STAGING;
  const make = (setup = world, over = {}) => {
    const writes = [];
    const wrap = (a) => new Proxy(a, { get: (t, op) => (WRITES.has(op) ? async () => { writes.push(op); throw new Error(`called ${String(op)}`); } : t[op]) });
    const h = harness({ gitlab, config, setup, wrap, ...over });
    h.writes = writes;
    return h;
  };

  test(`[${kind}] queue lists the open PRs into staging or main that close no Issue, with the hint, and not the ones that close one`, async () => {
    const h = make();
    assert.equal(await run(['queue'], h.ctx), 0);
    const t = h.text();
    assert.match(t, new RegExp(`${ref}94 closes no Issue \\(it says «Refs #92»\\): Huddle does not see it in review\\. Put «Closes #92» in its description, or open a separate Issue\\.`));
    assert.match(t, /h92-part/, 'the head branch is shown');
    assert.match(t, new RegExp(`${ref}98 closes no Issue \\(its branch matches the Branch of #99\\)`));
    assert.match(t, new RegExp(`${ref}100 closes no Issue: Huddle does not see it in review\\. Put «Closes #N» in its description, or open a separate Issue\\.`));
    const listed = t.slice(t.indexOf('Open PRs/MRs'));
    assert.doesNotMatch(listed, new RegExp(`${ref}95 `), 'a PR that closes an Issue is not listed');
    assert.doesNotMatch(listed, new RegExp(`${ref}97 `), 'a PR into another branch is not listed');
    assert.deepEqual(h.writes, []);
  });

  test(`[${kind}] queue lists a draft that closes no Issue apart, as a draft`, async () => {
    const h = make();
    await run(['queue'], h.ctx);
    const t = h.text();
    const drafts = t.slice(t.indexOf('Drafts'));
    assert.match(drafts, new RegExp(`${ref}96 .*a draft`));
    assert.doesNotMatch(t.slice(0, t.indexOf('Drafts')), new RegExp(`${ref}96 `), 'the draft is not in the main list');
  });

  test(`[${kind}] queue --json has the key «unlinked», each with its number, title, head, base, draft and hint`, async () => {
    const h = make();
    assert.equal(await run(['queue', '--json'], h.ctx), 0);
    const { unlinked } = JSON.parse(h.text());
    assert.deepEqual(unlinked.map((u) => u.number), [94, 96, 98, 100]);
    assert.deepEqual(unlinked[0], { number: 94, title: gitlab ? 'MR 94' : 'PR 94', head: 'h92-part', base: 'staging', draft: false, issue: 92, hint: 'refs' });
    assert.equal(unlinked[1].draft, true);
    assert.deepEqual([unlinked[2].issue, unlinked[2].hint], [99, 'branch']);
    assert.deepEqual([unlinked[3].issue, unlinked[3].hint], [null, null]);
  });

  test(`[${kind}] with no unlinked PR, queue says nothing about them and --json has an empty list`, async () => {
    const setup = (w) => { w.issue({ number: 1, title: 'x', body: MANAGED, assignees: ['ana'], labels: ['in progress'] }); w.review({ number: 5, base: 'staging', body: 'Closes #1' }); };
    const h = make(setup);
    await run(['queue'], h.ctx);
    assert.doesNotMatch(h.text(), /close(s)? no Issue|Drafts/);
    const j = make(setup);
    await run(['queue', '--json'], j.ctx);
    assert.deepEqual(JSON.parse(j.text()).unlinked, []);
    const none = make((w) => w.issue({ number: 1, title: 'x', body: MANAGED, assignees: ['ana'], labels: ['in progress'] }));
    await run(['queue'], none.ctx);
    assert.equal(none.text(), 'Nothing is waiting for the Coach.');
  });

  test(`[${kind}] queue reads the open PRs once: no call per PR for the unlinked ones`, async () => {
    const h = make();
    await run(['queue'], h.ctx);
    const forUnlinked = h.calls().filter((c) => [94, 96, 98, 100].some((n) => new RegExp(`(pr view ${n}( |$)|merge_requests/${n}(/|$|[?]))`).test(c.args.join(' '))));
    assert.deepEqual(forUnlinked, [], 'no call names one of the unlinked PRs/MRs');
  });

  test(`[${kind}] doctor warns once when an open PR closes no Issue, and says nothing when none does`, async () => {
    const h = make();
    h.ctx.pluginInstalled = true;
    await run(['doctor'], h.ctx);
    const lines = h.text().split('\n').filter((l) => /close(s)? no Issue/.test(l));
    assert.equal(lines.length, 1);
    assert.match(lines[0], /^⚠ /);
    assert.match(lines[0], new RegExp(`4 open ${gitlab ? 'MRs' : 'PRs'} close no Issue: huddle queue says which`));
    const clean = make((w) => { w.issue({ number: 1, title: 'x', body: MANAGED }); w.review({ number: 5, base: 'staging', body: 'Closes #1' }); });
    clean.ctx.pluginInstalled = true;
    await run(['doctor'], clean.ctx);
    assert.doesNotMatch(clean.text(), /close(s)? no Issue/);
  });

  test(`[${kind}] doctor says «1 open PR closes no Issue» in the singular`, async () => {
    const h = make((w) => w.review({ number: 7, base: 'staging', body: 'nothing' }));
    h.ctx.pluginInstalled = true;
    await run(['doctor'], h.ctx);
    assert.match(h.text(), new RegExp(`1 open ${gitlab ? 'MR' : 'PR'} closes no Issue: huddle queue says which`));
  });

  // --- the merged one --------------------------------------------------------------------------------------------------------------

  const merged = (w) => {
    w.issue({ number: 92, title: 'The thing', body: MANAGED, assignees: ['ana'], labels: ['in progress'] });
    w.issue({ number: 93, title: 'Done by its PR', body: MANAGED, assignees: ['ana'] });
    w.review({ number: 30, base: 'staging', merged: true, branch: 'h92-a', body: 'Half of it.\n\nRefs #92' });
    w.review({ number: 31, base: 'staging', merged: true, branch: 'h93-a', body: 'Closes #93' });
    w.review({ number: 32, base: 'staging', merged: true, branch: 'h92-b', body: 'Part of #92' });
  };
  const noticeOf = (n, issue) => new RegExp(`${ref}${n} merged and closed no Issue; #${issue} is still open: if its work is done, close it \\(the Coach's session closes it with a comment\\); if not, say what is left`);

  test(`[${kind}] huddle land says it when the merged PR only «Refs» an open Issue, and nothing for one that closed its Issue`, async () => {
    const h = harness({ gitlab, config, setup: merged });
    await run(['land', '30'], h.ctx);
    assert.match(h.text() + h.errText(), noticeOf(30, 92));
    const ok = harness({ gitlab, config, setup: merged });
    assert.equal(await run(['land', '31'], ok.ctx), 0);
    assert.doesNotMatch(ok.text() + ok.errText(), /closed no Issue/);
    const part = harness({ gitlab, config, setup: merged });
    await run(['land', '32'], part.ctx);
    assert.match(part.text() + part.errText(), noticeOf(32, 92), '«Part of #N» counts as «Refs»');
  });

  test(`[${kind}] land stays quiet about a «Refs» to an Issue that is already closed`, async () => {
    const h = harness({ gitlab, config, setup: (w) => { w.issue({ number: 92, title: 'x', body: MANAGED, state: 'closed-by-hand' }); w.review({ number: 30, base: 'staging', merged: true, body: 'Refs #92' }); } });
    await run(['land', '30'], h.ctx);
    assert.doesNotMatch(h.text() + h.errText(), /is still open/);
  });

  test(`[${kind}] queue prints the notice for each recently merged PR that «Refs» an open Issue and closed nothing, and --json has it`, async () => {
    const h = make(merged);
    await run(['queue'], h.ctx);
    assert.match(h.text(), noticeOf(30, 92));
    assert.match(h.text(), noticeOf(32, 92));
    assert.doesNotMatch(h.text(), new RegExp(`${ref}31 merged`));
    const j = make(merged);
    await run(['queue', '--json'], j.ctx);
    assert.deepEqual(JSON.parse(j.text()).mergedWithoutClosing, [{ number: 32, issues: [92] }, { number: 30, issues: [92] }]);
  });

  test(`[${kind}] the matching of PRs to Issues does not change: a PR that only «Refs» an Issue does not put it in review`, async () => {
    const h = make(world);
    await run(['queue', '--json'], h.ctx);
    assert.deepEqual(JSON.parse(h.text()).waiting.map((w) => w.issue), [93], 'Issue 93 is in review through PR 95; 92 has no linked PR, so it is not');
  });
}

test('the two skills no longer advise «Refs #N» to keep an Issue open, and say what to do instead', () => {
  for (const name of ['huddle-decide', 'huddle-review']) {
    const t = readFileSync(new URL(`../../skills/${name}/SKILL.md`, import.meta.url), 'utf8');
    assert.doesNotMatch(t, /use «?Refs/i, name);
    assert.match(t, /smaller Issue/, `${name}: a partial PR is linked with «Closes» to a smaller Issue`);
    assert.match(t, /new Issue/, `${name}: the rest is a new Issue`);
    assert.ok(t.split('\n').length <= 90, `${name} stays within the line limit`);
  }
});
