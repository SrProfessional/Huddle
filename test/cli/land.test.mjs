// docs/design.md §21: `huddle land <pr> [--check]` closes the Issues a merged PR/MR into the staging branch names, and the labels job only warns.
// Fakes only: the adapters get canned `gh`/`glab` answers, never a real platform.
import test from 'node:test';
import assert from 'node:assert/strict';
import { run } from '../../lib/cli/run.mjs';
import { CONFIG, GITLAB_CONFIG, harness } from './harness.mjs';

const STAGING = { ...CONFIG, staging_branch: 'staging' };
const STAGING_GL = { ...GITLAB_CONFIG, staging_branch: 'staging' };

/** Issues 5 and 6 are open, 7 is open and not named, 8 is already closed; PR 30 is merged into staging and names 5, 6 and 8. */
const world = (w) => {
  for (const number of [5, 6, 7]) w.issue({ number, title: `Issue ${number}` });
  w.issue({ number: 8, title: 'Issue 8', state: 'closed-by-hand' });
  w.review({ number: 30, base: 'staging', merged: true, body: 'What changed.\n\nCloses #5\nFixes #6, and mentions #7.\nResolves #8' });
  w.review({ number: 31, base: 'staging', body: 'Closes #5' }); // still open
  w.review({ number: 32, base: 'main', merged: true, body: 'Closes #5' }); // merged, but not into staging
  w.review({ number: 33, base: 'staging', merged: true, body: 'No keyword, only #5' });
  w.review({ number: 34, base: 'staging', merged: true, body: 'Closes #999' }); // not an Issue
};

const closeCalls = (h) => h.calls().filter((c) => (c.args.includes('PATCH') && /issues\/\d+$/.test(c.args.at(-1))) || (c.args.includes('PUT') && /issues\/\d+$/.test(c.args.at(-1))));

for (const gitlab of [false, true]) {
  const kind = gitlab ? 'gitlab' : 'github';
  const config = gitlab ? STAGING_GL : STAGING;
  const make = (over = {}) => harness({ gitlab, config, setup: world, ...over });

  test(`[${kind}] land closes every Issue the merged PR names, and only those`, async () => {
    const h = make();
    assert.equal(await run(['land', '30'], h.ctx), 0);
    assert.match(h.text(), /closed #5/);
    assert.match(h.text(), /closed #6/);
    assert.match(h.text(), /#8 was already closed/);
    assert.equal(h.world.stateOf(5), 'closed');
    assert.equal(h.world.stateOf(6), 'closed');
    assert.equal(h.world.stateOf(7), 'open', 'an Issue the PR only mentions is never touched');
    if (!gitlab) assert.equal(h.world.closedReason(5), 'completed');
    assert.equal(closeCalls(h).length, 2, 'the Issue that was already closed gets no call');
  });

  test(`[${kind}] land is idempotent: a second run closes nothing and says so`, async () => {
    const h = make();
    assert.equal(await run(['land', '30'], h.ctx), 0);
    const first = closeCalls(h).length;
    h.out.length = 0;
    assert.equal(await run(['land', '30'], h.ctx), 0);
    assert.match(h.text(), /#5 was already closed/);
    assert.match(h.text(), /#6 was already closed/);
    assert.doesNotMatch(h.text(), /closed #\d+\n|^closed/m);
    assert.equal(closeCalls(h).length, first, 'no further close call');
  });

  test(`[${kind}] land never reopens an Issue and never touches one the PR does not name`, async () => {
    const h = make();
    await run(['land', '30'], h.ctx);
    assert.equal(h.world.stateOf(8), 'closed');
    assert.equal(h.world.stateOf(7), 'open');
    assert.ok(!closeCalls(h).some((c) => /issues\/7$/.test(c.args.at(-1))));
  });

  test(`[${kind}] land refuses a PR that is not merged`, async () => {
    const h = make();
    assert.equal(await run(['land', '31'], h.ctx), 1);
    assert.match(h.errText(), /PR #31 is not merged/);
    assert.equal(h.world.stateOf(5), 'open');
    assert.equal(closeCalls(h).length, 0);
  });

  test(`[${kind}] land refuses a PR whose base is not the staging branch`, async () => {
    const h = make();
    assert.equal(await run(['land', '32'], h.ctx), 1);
    assert.match(h.errText(), /targets main, not staging/);
    assert.equal(h.world.stateOf(5), 'open');
    assert.equal(closeCalls(h).length, 0);
  });

  test(`[${kind}] land refuses a caller who is not the AI Manager, before it reads or changes anything`, async () => {
    const h = make({ config: { ...config, ai_manager: 'ana' } });
    assert.equal(await run(['land', '30'], h.ctx), 1);
    assert.match(h.errText(), /only the AI Manager lands a PR/);
    assert.equal(closeCalls(h).length, 0);
    assert.equal(h.world.stateOf(5), 'open');
  });

  test(`[${kind}] land with no staging branch says there is nothing to land`, async () => {
    const h = make({ config: gitlab ? GITLAB_CONFIG : CONFIG });
    assert.equal(await run(['land', '30'], h.ctx), 1);
    assert.match(h.errText(), /no staging branch is set: nothing to land/);
    assert.equal(closeCalls(h).length, 0);
    const c = make({ config: gitlab ? GITLAB_CONFIG : CONFIG });
    assert.equal(await run(['land', '30', '--check'], c.ctx), 1);
    assert.match(c.errText(), /no staging branch is set: nothing to land/);
  });

  test(`[${kind}] land with an unknown PR number is one clear line, exit 1`, async () => {
    const h = make();
    assert.equal(await run(['land', '999'], h.ctx), 1);
    assert.match(h.errText(), /PR #999 not found/);
  });

  test(`[${kind}] land --check changes nothing and says what it would close`, async () => {
    const h = make();
    assert.equal(await run(['land', '30', '--check'], h.ctx), 0);
    assert.match(h.text(), /ok: PR #30 \(base staging\) closes #5, #6, #8/);
    const open = make();
    assert.equal(await run(['land', '31', '--check'], open.ctx), 0, 'a PR that is still open is fine for --check');
    assert.match(open.text(), /ok: PR #31 \(base staging\) closes #5/);
    for (const x of [h, open]) {
      assert.equal(closeCalls(x).length, 0);
      assert.equal(x.world.stateOf(5), 'open');
      assert.ok(!x.calls().some((c) => c.args.some((a) => /label|comment|POST/i.test(a))), 'only reads');
    }
  });

  test(`[${kind}] land --check reports each problem and exits 1`, async () => {
    const other = make();
    assert.equal(await run(['land', '32', '--check'], other.ctx), 1);
    assert.match(other.errText(), /PR #32 does not target staging \(it targets main\)/);
    const none = make();
    assert.equal(await run(['land', '33', '--check'], none.ctx), 1);
    assert.match(none.errText(), /PR #33 has no closing keyword/);
    const notIssue = make();
    assert.equal(await run(['land', '34', '--check'], notIssue.ctx), 1);
    assert.match(notIssue.errText(), /#999 is not an Issue/);
    const gone = make();
    assert.equal(await run(['land', '999', '--check'], gone.ctx), 1);
    assert.match(gone.errText(), /PR #999 not found/);
    for (const x of [other, none, notIssue, gone]) assert.equal(closeCalls(x).length, 0);
  });

  test(`[${kind}] land with a missing or bad argument is exit 2 with the usage`, async () => {
    for (const argv of [['land'], ['land', 'abc'], ['land', '30', '--nope'], ['land', '30', '31']]) {
      const h = make();
      assert.equal(await run(argv, h.ctx), 2, argv.join(' '));
      assert.match(h.errText(), /land <pr> [--check]/);
    }
  });

  test(`[${kind}] land stops with one line when the platform fails, and closes nothing more`, async () => {
    const h = make();
    h.world.failWhen((args) => args.join(' ').includes('issues' + '/6') && /PATCH|PUT/.test(args.join(' ')), 'HTTP 500 broken', 99);
    const code = await run(['land', '30'], h.ctx);
    assert.equal(code, 1);
    assert.equal(h.errText().split('\n').filter(Boolean).length, 1);
  });

  // --- the labels job warns, it does not close ---

  test(`[${kind}] the labels job warns about an open Issue a merged staging PR closes, and closes nothing`, async () => {
    const h = make();
    assert.equal(await run(['labels'], h.ctx), 0);
    assert.match(h.text(), /warning: #5 is open but PR #30, merged into staging, closes it: run huddle land 30, or it was reopened on purpose/);
    assert.match(h.text(), /warning: #6 is open but PR #30/);
    assert.doesNotMatch(h.text(), /warning: #7 /, 'a bare mention is not a closing keyword');
    assert.doesNotMatch(h.text(), /warning: #8 /, 'an Issue that is closed is not warned about');
    assert.doesNotMatch(h.text(), /PR #32/, 'a PR into another base is not looked at');
    assert.equal(h.world.stateOf(5), 'open');
    assert.equal(closeCalls(h).length, 0);
  });

  test(`[${kind}] an Issue reopened after a failed test stays open: only land closes it`, async () => {
    const h = make();
    await run(['land', '30'], h.ctx);
    h.world.issue({ number: 5, title: 'reopened', state: 'open' });
    const before = closeCalls(h).length;
    await run(['labels'], h.ctx);
    await run(['labels'], h.ctx);
    assert.equal(h.world.stateOf(5), 'open');
    assert.equal(closeCalls(h).length, before, 'the labels job never closes an Issue');
    assert.match(h.text(), /warning: #5 is open but PR #30/);
  });

  test(`[${kind}] with staging unset the labels run prints and calls exactly what it did before`, async () => {
    const plain = gitlab ? GITLAB_CONFIG : CONFIG;
    const h = harness({ gitlab, config: plain, setup: world });
    assert.equal(await run(['labels'], h.ctx), 0);
    assert.doesNotMatch(h.text(), /warning|land/);
    assert.ok(!h.calls().some((c) => /--state merged|state=merged/.test(c.args.join(' '))), 'no merged-review read');
    const empty = harness({ gitlab, config: { ...plain, staging_branch: '' }, setup: world });
    await run(['labels'], empty.ctx);
    assert.deepEqual(empty.calls().map((c) => c.args), h.calls().map((c) => c.args), 'an empty staging_branch is the same as none');
  });

  // Issue #116: the scoped run reads only its scope and makes no extra call, so the warning (one more call, mergedReviews) is for the full run only.
  const managed = (w) => {
    w.issue({ number: 20, title: 'Managed', body: '## Depends on\n\n- None\n', labels: ['ready'] });
    w.review({ number: 30, base: 'staging', merged: true, body: 'Closes #20' });
  };
  const readsMerged = (h) => h.calls().some((c) => /--state merged|state=merged/.test(c.args.join(' ')));

  test(`[${kind}] a scoped labels run with a staging branch makes no mergedReviews call; the full run still warns`, async () => {
    const scoped = harness({ gitlab, config, setup: managed });
    assert.equal(await run(['labels', '--issue', '20'], scoped.ctx), 0);
    assert.equal(readsMerged(scoped), false, 'no merged-review read in a scoped run');
    assert.doesNotMatch(scoped.text(), /warning: #20 is open but PR/);
    const full = harness({ gitlab, config, setup: managed });
    assert.equal(await run(['labels'], full.ctx), 0);
    assert.equal(readsMerged(full), true);
    assert.match(full.text(), /warning: #20 is open but PR #30, merged into staging, closes it: run huddle land 30/);
  });
}
