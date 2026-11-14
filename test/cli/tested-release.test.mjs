// docs/design.md §21 (H49): `huddle tested`, `huddle release [--json]`, `huddle release open`, the label `tested in staging`.
// Fakes only: the adapters get canned `gh`/`glab` answers and git is a stub, never a real platform.
import test from 'node:test';
import assert from 'node:assert/strict';
import { run } from '../../lib/cli/run.mjs';
import { TESTED_LABEL, closedCleanup, testedCleanup } from '../../lib/core/issue-status.mjs';
import { closesIn } from '../../lib/core/closes.mjs';
import { CONFIG, GITLAB_CONFIG, harness } from './harness.mjs';

const STAGING = { ...CONFIG, staging_branch: 'staging', testers: ['tess'] };
const STAGING_GL = { ...GITLAB_CONFIG, staging_branch: 'staging', testers: ['tess'] };
const MARK = '✅ Tested in staging';

/**
 * Staging holds PR 30 (closes #5, merged 2026-11-01, tested after), PR 31 (closes #6, merged 2026-11-02, not tested) and PR 29 (closes #4, already released).
 * #7 is open. A merged PR into main (32) and an open PR into staging (33) are noise.
 */
const world = (w) => {
  for (const n of [4, 5, 6]) w.issue({ number: n, title: `Issue ${n}`, state: 'closed-by-hand' });
  w.issue({ number: 7, title: 'Issue 7', labels: ['tested in staging'] });
  w.review({ number: 29, base: 'staging', merged: true, mergedAt: '2026-10-30T00:00:00Z', body: 'Closes #4' });
  w.review({ number: 30, base: 'staging', merged: true, mergedAt: '2026-11-01T00:00:00Z', body: 'Closes #5' });
  w.review({ number: 31, base: 'staging', merged: true, mergedAt: '2026-11-02T00:00:00Z', body: 'Closes #6' });
  w.review({ number: 32, base: 'main', merged: true, body: 'Closes #7' });
  w.review({ number: 33, base: 'staging', body: 'Closes #7' });
  w.comment(5, { id: 501, author: 'SrProfessional', body: MARK, createdAt: '2026-11-03T00:00:00Z' });
  w.comment(6, { id: 601, author: 'SrProfessional', body: MARK, createdAt: '2026-11-01T12:00:00Z' }); // older than its merge: invalid
  w.comment(4, { id: 401, author: 'ana', body: MARK, createdAt: '2026-11-04T00:00:00Z' });
};

/** A git stub: what the released PRs are (their merge commit is an ancestor of main), the first-parent history of staging, and how many commits main is ahead. */
const gitStub = ({ released = ['merge29'], commits = [{ sha: 'merge31', at: '2026-11-02T00:00:00Z' }, { sha: 'merge30', at: '2026-11-01T00:00:00Z' }], ahead = 0 } = {}) => {
  const seen = [];
  const git = (args) => {
    seen.push(args.join(' '));
    if (args[0] === 'fetch') return '';
    if (args[0] === 'merge-base' && args[1] === '--is-ancestor') {
      if (args[3] === 'origin/main' && released.includes(args[2])) return '';
      throw new Error('exit 1');
    }
    if (args[0] === 'log') return commits.map((c) => `${c.sha} ${c.at}`).join('\n');
    if (args[0] === 'rev-list') return `${ahead}\n`;
    throw new Error(`git stub: ${args.join(' ')}`);
  };
  git.seen = seen;
  return git;
};

const labelCalls = (h) => h.calls().filter((c) => c.args.some((a) => /label/.test(a)) && !c.args.some((a) => /^labels\?|\blist\b/.test(a)));
const prCreateCalls = (h) => h.calls().filter((c) => c.args.some((a) => /(^|\/)pulls$/.test(a) || /merge_requests$/.test(a)) && (c.args.includes('POST')));

for (const gitlab of [false, true]) {
  const kind = gitlab ? 'gitlab' : 'github';
  const config = gitlab ? STAGING_GL : STAGING;
  const make = (over = {}) => {
    const h = harness({ gitlab, config, setup: world, ...over });
    Object.assign(h.ctx, { cwd: '/repo', git: over.git ?? gitStub() });
    return h;
  };

  // --- huddle tested -----------------------------------------------------------------------------------------------------------------

  test(`[${kind}] tested posts the comment and adds the label to a closed Issue that landed in staging`, async () => {
    const h = make();
    assert.equal(await run(['tested', '5'], h.ctx), 0);
    assert.deepEqual(h.world.commentsOn(5).slice(-1), [MARK]);
    assert.ok(h.world.labelsOf(5).includes('tested in staging'));
    assert.match(h.text(), /#5 marked as tested in staging/);
  });

  test(`[${kind}] tested refuses an open Issue, an Issue whose PR is not merged into staging, and an unknown number`, async () => {
    const open = make();
    assert.equal(await run(['tested', '7'], open.ctx), 1);
    assert.match(open.errText(), /#7 is open/);
    const other = make();
    other.world.issue({ number: 8, state: 'closed-by-hand' });
    other.world.review({ number: 40, base: 'main', merged: true, body: 'Closes #8' }); // merged, but into production, not staging
    assert.equal(await run(['tested', '8'], other.ctx), 1);
    assert.match(other.errText(), /no PR merged into staging closes #8/);
    for (const x of [open, other]) {
      assert.ok(!x.calls().some((c) => c.args.includes('POST') && c.args.some((a) => /comments|notes/.test(a))), 'nothing was posted');
      assert.equal(labelCalls(x).length, 0);
    }
  });

  test(`[${kind}] tested refuses a caller who is not the AI Manager, before it reads or changes anything`, async () => {
    const h = make({ config: { ...config, ai_manager: 'ana' } });
    assert.equal(await run(['tested', '5'], h.ctx), 1);
    assert.match(h.errText(), /only the AI Manager marks an Issue as tested/);
    assert.ok(!h.calls().some((c) => c.args.includes('POST')));
  });

  test(`[${kind}] tested with no staging branch set refuses, and a bad argument is exit 2`, async () => {
    const h = make({ config: { ...config, staging_branch: '' } });
    assert.equal(await run(['tested', '5'], h.ctx), 1);
    assert.match(h.errText(), /no staging branch is set/);
    assert.equal(h.calls().length, 0, 'nothing was called');
    for (const argv of [['tested'], ['tested', 'abc'], ['tested', '5', '6']]) assert.equal(await run(argv, make().ctx), 2, argv.join(' '));
  });

  // --- the label ---------------------------------------------------------------------------------------------------------------------

  test(`[${kind}] the label is created by the labels job only when staging_branch is set`, async () => {
    const withStaging = make();
    assert.equal(await run(['labels'], withStaging.ctx), 0);
    assert.ok('tested in staging' in withStaging.world.repoLabels());
    const without = make({ config: { ...config, staging_branch: '' } });
    assert.equal(await run(['labels'], without.ctx), 0);
    assert.ok(!('tested in staging' in without.world.repoLabels()));
  });

  test(`[${kind}] the labels job removes it from an open Issue (reopened means not tested) and leaves a closed one alone`, async () => {
    const h = make();
    h.world.issue({ number: 5, title: 'Issue 5', state: 'merged', labels: ['tested in staging', 'in review', 'bug'] });
    assert.equal(await run(['labels'], h.ctx), 0);
    assert.ok(!h.world.labelsOf(7).includes('tested in staging'), 'open: removed');
    assert.deepEqual(h.world.labelsOf(5).sort(), ['bug', 'tested in staging'], 'closed: the marker stays, the status label goes');
    assert.match(h.text(), /#7 loses tested in staging/);
  });

  test(`[${kind}] huddle land removes the label from every Issue it lands`, async () => {
    const h = make();
    h.world.issue({ number: 9, title: 'Issue 9', labels: ['tested in staging'] });
    h.world.review({ number: 50, base: 'staging', merged: true, body: 'Closes #9' });
    assert.equal(await run(['land', '50'], h.ctx), 0);
    assert.ok(!h.world.labelsOf(9).includes('tested in staging'));
    assert.equal(h.world.stateOf(9), 'closed');
  });

  // --- huddle release ----------------------------------------------------------------------------------------------------------------

  test(`[${kind}] release --json lists the staged Issues with and without the marker, and the untested ones`, async () => {
    const h = make();
    assert.equal(await run(['release', '--json'], h.ctx), 0);
    const out = JSON.parse(h.out.join(''));
    assert.deepEqual(out.issues, [
      { issue: 5, pr: 30, tested: true, by: 'SrProfessional', at: '2026-11-03T00:00:00Z' },
      { issue: 6, pr: 31, tested: false, by: null, at: null },
    ]);
    assert.deepEqual(out.untested, [6]);
    assert.deepEqual(out.warnings, []);
    assert.ok(h.ctx.git.seen.includes('merge-base --is-ancestor merge29 origin/main'), 'the released PR was judged by its merge commit');
    assert.ok(!h.calls().some((c) => c.args.includes('POST')), 'read only');
  });

  test(`[${kind}] release prints the same in words, and a developer's comment or a tester's count as the rules say`, async () => {
    const h = make();
    h.world.comment(6, { id: 602, author: 'tess', body: MARK, createdAt: '2026-11-04T00:00:00Z' }); // a tester, newer than the merge
    assert.equal(await run(['release'], h.ctx), 0);
    assert.match(h.text(), /#5 .*PR #30.*tested by SrProfessional/);
    assert.match(h.text(), /#6 .*PR #31.*tested by tess/);
    assert.match(h.text(), /every staged Issue was tested/i);
    const dev = make();
    dev.world.comment(6, { id: 603, author: 'ana', body: MARK, createdAt: '2026-11-04T00:00:00Z' });
    assert.equal(await run(['release'], dev.ctx), 0);
    assert.match(dev.text(), /#6 .*PR #31.*NOT tested/);
    assert.match(dev.text(), /1 untested: #6/);
  });

  test(`[${kind}] release says when nothing is in staging, and refuses with no staging branch or a bad argument`, async () => {
    const h = make({ git: gitStub({ released: ['merge29', 'merge30', 'merge31'] }) });
    assert.equal(await run(['release'], h.ctx), 0);
    assert.match(h.text(), /nothing in staging to release/i);
    const none = make({ config: { ...config, staging_branch: '' } });
    assert.equal(await run(['release'], none.ctx), 1);
    assert.match(none.errText(), /no staging branch is set/);
    for (const argv of [['release', '--nope'], ['release', 'open', '--untested'], ['release', 'open', '--untested', 'x', '--reason', 'r'], ['release', '--json', 'open']]) {
      assert.equal(await run(argv, make().ctx), 2, argv.join(' '));
    }
  });

  test(`[${kind}] release warns about a stray commit in staging after the newest test, and about the default branch being ahead`, async () => {
    const stray = make({ git: gitStub({ commits: [{ sha: 'hotfix1', at: '2026-11-05T00:00:00Z' }, { sha: 'merge31', at: '2026-11-02T00:00:00Z' }, { sha: 'merge30', at: '2026-11-01T00:00:00Z' }] }) });
    assert.equal(await run(['release', '--json'], stray.ctx), 0);
    assert.deepEqual(JSON.parse(stray.out.join('')).warnings.map((w) => w.code), ['stray-commits']);
    const ahead = make({ git: gitStub({ ahead: 2 }) });
    assert.equal(await run(['release'], ahead.ctx), 0);
    assert.match(ahead.text(), /warning: main is ahead of staging/);
  });

  test(`[${kind}] release exits 1 on a platform error`, async () => {
    const h = make();
    h.world.failWhen(() => true, 'HTTP 500 boom', 9);
    assert.equal(await run(['release'], h.ctx), 1);
  });

  // --- huddle release open -----------------------------------------------------------------------------------------------------------

  test(`[${kind}] release open refuses while a staged Issue is untested, naming it, and opens nothing`, async () => {
    const h = make();
    assert.equal(await run(['release', 'open'], h.ctx), 1);
    assert.match(h.errText(), /#6 was not tested in staging/);
    assert.equal(prCreateCalls(h).length, 0);
    assert.deepEqual(h.world.opened(), []);
  });

  test(`[${kind}] release open refuses while the default branch is ahead of staging, even when everything is tested`, async () => {
    const h = make({ git: gitStub({ ahead: 1 }) });
    h.world.comment(6, { id: 602, author: 'SrProfessional', body: MARK, createdAt: '2026-11-04T00:00:00Z' });
    assert.equal(await run(['release', 'open'], h.ctx), 1);
    assert.match(h.errText(), /main is ahead of staging.*back-merge/);
    assert.deepEqual(h.world.opened(), []);
  });

  test(`[${kind}] release open with everything tested opens one PR from staging into main, with plain #N and no closing keyword`, async () => {
    const h = make();
    h.world.comment(6, { id: 602, author: 'SrProfessional', body: MARK, createdAt: '2026-11-04T00:00:00Z' });
    assert.equal(await run(['release', 'open'], h.ctx), 0);
    const opened = h.world.opened();
    assert.equal(opened.length, 1, 'openReview is called once');
    assert.equal(opened[0].base, 'main');
    assert.equal(opened[0].head, 'staging');
    assert.match(opened[0].body, /#5/);
    assert.match(opened[0].body, /#6/);
    assert.doesNotMatch(opened[0].body, /#4\b/, 'the released Issue is not listed');
    assert.deepEqual(closesIn(opened[0].body, 'acme/app'), [], 'nothing is closed twice: no closing keyword');
    assert.match(opened[0].body, /merge commit/i);
    assert.match(h.text(), /opened PR #\d+: https:\/\//);
  });

  test(`[${kind}] release open --untested lets one named Issue through, writes the reason in the body, and refuses without a reason`, async () => {
    const h = make();
    assert.equal(await run(['release', 'open', '--untested', '6', '--reason', 'tested by hand on the phone, no way to comment'], h.ctx), 0);
    const [pr] = h.world.opened();
    assert.match(pr.body, /^- #6 .*tested by hand on the phone, no way to comment$/m, 'one line per Issue, with its reason');
    assert.deepEqual(closesIn(pr.body, 'acme/app'), []);

    const noReason = make();
    assert.equal(await run(['release', 'open', '--untested', '6'], noReason.ctx), 1);
    assert.match(noReason.errText(), /--untested needs a --reason/);
    assert.deepEqual(noReason.world.opened(), []);

    const wrong = make();
    assert.equal(await run(['release', 'open', '--untested', '5', '--reason', 'x'], wrong.ctx), 1, '#5 is tested: nothing to let through');
    assert.match(wrong.errText(), /#5 is not an untested staged Issue/);
    const closing = make();
    assert.equal(await run(['release', 'open', '--untested', '6', '--reason', 'it closes #9 anyway'], closing.ctx), 1);
    assert.match(closing.errText(), /closing keyword/);
    assert.deepEqual(closing.world.opened(), []);
  });

  test(`[${kind}] release open is for the AI Manager only, and needs a staging branch`, async () => {
    const dev = make({ config: { ...config, ai_manager: 'ana' } });
    assert.equal(await run(['release', 'open'], dev.ctx), 1);
    assert.match(dev.errText(), /only the AI Manager opens the release/);
    assert.deepEqual(dev.world.opened(), []);
    const none = make({ config: { ...config, staging_branch: '' } });
    assert.equal(await run(['release', 'open'], none.ctx), 1);
    assert.match(none.errText(), /no staging branch is set/);
  });

  test(`[${kind}] release open with nothing staged opens nothing`, async () => {
    const h = make({ git: gitStub({ released: ['merge29', 'merge30', 'merge31'] }) });
    assert.equal(await run(['release', 'open'], h.ctx), 1);
    assert.match(h.errText(), /nothing in staging to release/);
    assert.deepEqual(h.world.opened(), []);
  });
}

test('with staging_branch unset every existing behaviour is unchanged: no marker label is created, none removed', async () => {
  const h = harness({ config: CONFIG, setup: (w) => { w.issue({ number: 7, title: 'x', labels: ['tested in staging'] }); } });
  assert.equal(await run(['labels'], h.ctx), 0);
  assert.ok(!('tested in staging' in h.world.repoLabels()));
  assert.ok(h.world.labelsOf(7).includes('tested in staging'), 'a label of the project\'s own that happens to be called so is not touched');
});

test('the label is a separate constant, not one of the status labels: closedCleanup leaves it alone, and testedCleanup picks only open Issues', () => {
  assert.equal(TESTED_LABEL.name, 'tested in staging');
  assert.ok(TESTED_LABEL.description.length <= 100);
  assert.deepEqual(closedCleanup([{ number: 1, labels: ['tested in staging', 'in review'] }]), [{ number: 1, remove: ['in review'] }]);
  assert.deepEqual(testedCleanup([{ number: 1, labels: ['tested in staging'] }, { number: 2, labels: ['bug'] }, { number: 3 }]), [1]);
});

test('the usage line lists tested and release', async () => {
  const h = harness({ config: CONFIG });
  assert.equal(await run([], h.ctx), 2);
  assert.match(h.errText(), /tested <issue>/);
  assert.match(h.errText(), /release \[--json\] \| release open/);
});
