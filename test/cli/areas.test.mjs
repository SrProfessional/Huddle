// Huddle: `huddle areas list | set | assign | check` (Issue #42), on the fake gh and the fake glab. Nothing here starts a process.
import test from 'node:test';
import assert from 'node:assert/strict';
import { run } from '../../lib/cli/run.mjs';
import { harness } from './harness.mjs';

const WRITES = new Set(['createMilestone', 'updateMilestone', 'setIssueMilestone']);
const CONTENT = ['Posts and videos.', '', 'Huddle remaining: 4', '', 'Owner: ana'].join('\n');

// A project with two areas (one with an estimate and some Issues, one with no estimate), an open Issue and a closed one with no area.
function seed(w) {
  w.milestone({ title: 'Content', description: CONTENT });
  w.milestone({ title: 'Ads', description: 'Paid reach.' });
  w.issue({ number: 1, title: 'Intro', state: 'merged', milestone: 'Content' });
  w.issue({ number: 2, title: 'Video', state: 'merged', milestone: 'Content' });
  w.issue({ number: 3, title: 'Calendar', milestone: 'Content' });
  w.issue({ number: 8, title: 'CI tooling' });
  w.issue({ number: 5, title: 'Old setup', state: 'merged' });
}

/** A harness whose adapter records every write with how much had been printed by then, so «prints before it writes» can be checked. */
function mk(opts = {}) {
  const writes = [];
  let h;
  const wrap = (adapter) => new Proxy(adapter, {
    get: (a, op) => (WRITES.has(op) ? async (...args) => { writes.push({ op, args, printedBefore: h.out.length }); return a[op](...args); } : a[op]),
  });
  h = harness({ setup: seed, wrap, ...opts });
  h.writes = writes;
  return h;
}
const blocked = (opts = {}) => {
  const h = harness({ setup: seed, wrap: (a) => new Proxy(a, { get: (t, op) => (WRITES.has(op) ? () => { throw new Error(`dry run called ${String(op)}`); } : t[op]) }), ...opts });
  return h;
};

for (const [name, gitlab] of [['github', false], ['gitlab', true]]) {
  const t = (title, fn) => test(`[${name}] ${title}`, () => fn(gitlab));

  // --- list -----------------------------------------------------------------------------------------------------------------------------

  t('list shows each area with its Issues and its remaining line, «missing» without one, and the no-area counts', async (gitlab) => {
    const h = mk({ gitlab });
    assert.equal(await run(['areas', 'list'], h.ctx), 0);
    assert.match(h.text(), /Content\s+1\s+2\s+4\b/);
    assert.match(h.text(), /Ads\s+0\s+0\s+missing/);
    assert.match(h.text(), /No area: 1 open, 1 closed/);
    assert.equal(h.writes.length, 0);
  });

  t('list --json prints the areas and the no-area Issues as data', async (gitlab) => {
    const h = mk({ gitlab });
    assert.equal(await run(['areas', 'list', '--json'], h.ctx), 0);
    const data = JSON.parse(h.text());
    assert.deepEqual(data.areas.map((a) => [a.title, a.open, a.merged, a.remaining, a.estimateMissing]), [['Content', 1, 2, 4, false], ['Ads', 0, 0, 0, true]]);
    assert.deepEqual(data.noArea.open, [{ number: 8, title: 'CI tooling' }]);
    assert.deepEqual(data.noArea.closed, [{ number: 5, title: 'Old setup' }]);
  });

  t('list on a project with no milestones says so and counts the Issues with no area', async (gitlab) => {
    const h = harness({ gitlab, setup: (w) => w.issue({ number: 1, title: 'a' }) });
    assert.equal(await run(['areas', 'list'], h.ctx), 0);
    assert.match(h.text(), /No areas yet/);
    assert.match(h.text(), /No area: 1 open, 0 closed/);
  });

  // --- set: create ----------------------------------------------------------------------------------------------------------------------

  t('set creates a milestone with its purpose and the remaining line, and prints the change before it writes', async (gitlab) => {
    const h = mk({ gitlab });
    assert.equal(await run(['areas', 'set', 'Docs', '--remaining', '3', '--description', 'Guides and README.'], h.ctx), 0);
    assert.deepEqual(h.world.milestoneDescription('Docs'), 'Guides and README.\n\nHuddle remaining: 3');
    assert.match(h.text(), /Will create milestone «Docs»/);
    assert.match(h.text(), /Huddle remaining: 3/);
    assert.deepEqual(h.writes.map((w) => w.op), ['createMilestone']);
    assert.ok(h.writes[0].printedBefore > 0, 'the plan was printed before the write');
  });

  t('set creates a milestone with only the remaining line when there is no description', async (gitlab) => {
    const h = mk({ gitlab });
    assert.equal(await run(['areas', 'set', 'Docs', '--remaining', '0'], h.ctx), 0);
    assert.equal(h.world.milestoneDescription('Docs'), 'Huddle remaining: 0');
  });

  // --- set: update, keeping the other text ----------------------------------------------------------------------------------------------

  t('set updates the remaining line and keeps every other line of the description', async (gitlab) => {
    const h = mk({ gitlab });
    assert.equal(await run(['areas', 'set', 'Content', '--remaining', '7'], h.ctx), 0);
    assert.equal(h.world.milestoneDescription('Content'), CONTENT.replace('remaining: 4', 'remaining: 7'));
    assert.match(h.text(), /Will update milestone «Content»/);
    assert.match(h.text(), /remaining: 4 → 7/);
    assert.deepEqual(h.writes.map((w) => w.op), ['updateMilestone']);
  });

  t('set adds the remaining line to a description that has none, after its text', async (gitlab) => {
    const h = mk({ gitlab });
    assert.equal(await run(['areas', 'set', 'Ads', '--remaining', '5'], h.ctx), 0);
    assert.equal(h.world.milestoneDescription('Ads'), 'Paid reach.\n\nHuddle remaining: 5');
    assert.match(h.text(), /remaining: \(none\) → 5/);
  });

  t('set with --description replaces the purpose and the other text, and says so', async (gitlab) => {
    const h = mk({ gitlab });
    assert.equal(await run(['areas', 'set', 'Content', '--remaining', '4', '--description', 'Words only.'], h.ctx), 0);
    assert.equal(h.world.milestoneDescription('Content'), 'Words only.\n\nHuddle remaining: 4');
  });

  t('set reuses an existing milestone, whatever the case of the title: it never makes a second one', async (gitlab) => {
    const h = mk({ gitlab });
    assert.equal(await run(['areas', 'set', 'content', '--remaining', '9'], h.ctx), 0);
    assert.deepEqual(h.world.milestoneTitles().sort(), ['Ads', 'Content']);
    assert.match(h.world.milestoneDescription('Content'), /Huddle remaining: 9/);
    assert.deepEqual(h.writes.map((w) => w.op), ['updateMilestone']);
    assert.match(h.text(), /«Content»/);
  });

  t('set with nothing to change says so and writes nothing', async (gitlab) => {
    const h = mk({ gitlab });
    assert.equal(await run(['areas', 'set', 'Content', '--remaining', '4'], h.ctx), 0);
    assert.match(h.text(), /Nothing to change/);
    assert.equal(h.writes.length, 0);
  });

  // --- set: dry run and errors ----------------------------------------------------------------------------------------------------------

  t('set --dry-run prints what it would change and changes nothing, for a create and for an update', async (gitlab) => {
    const h = blocked({ gitlab });
    assert.equal(await run(['areas', 'set', 'Docs', '--remaining', '3', '--dry-run'], h.ctx), 0);
    assert.equal(await run(['areas', 'set', 'Content', '--remaining', '7', '--dry-run'], h.ctx), 0);
    assert.match(h.text(), /Would create milestone «Docs»/);
    assert.match(h.text(), /Would update milestone «Content»/);
    assert.match(h.text(), /Dry run: nothing was changed/);
    assert.deepEqual(h.world.milestoneTitles().sort(), ['Ads', 'Content']);
    assert.equal(h.world.milestoneDescription('Content'), CONTENT);
    assert.equal(h.errText(), '');
  });

  t('set asks for a title and a whole-number --remaining, and refuses «none» as a title', async (gitlab) => {
    for (const argv of [['areas', 'set'], ['areas', 'set', 'Docs'], ['areas', 'set', 'Docs', '--remaining'], ['areas', 'set', 'Docs', '--remaining', 'four'], ['areas', 'set', 'Docs', '--remaining', '-2'], ['areas', 'set', 'none', '--remaining', '2'], ['areas', 'set', 'Docs', '--remaining', '2', '--bogus']]) {
      const h = mk({ gitlab });
      assert.equal(await run(argv, h.ctx), 2, argv.join(' '));
      assert.match(h.errText(), /Usage: huddle/);
      assert.equal(h.writes.length, 0);
    }
  });

  // --- assign and unassign --------------------------------------------------------------------------------------------------------------

  t('assign puts an Issue in an area, says where it was, and prints the change before it writes', async (gitlab) => {
    const h = mk({ gitlab });
    assert.equal(await run(['areas', 'assign', '8', 'Ads'], h.ctx), 0);
    assert.equal(h.world.milestoneOf(8), 'Ads');
    assert.match(h.text(), /Will put Issue #8 in area «Ads» \(now: no area\)/);
    assert.ok(h.writes[0].printedBefore > 0);
  });

  t('assign moves an Issue from one area to another, also a closed one, and finds the area whatever the case', async (gitlab) => {
    const h = mk({ gitlab });
    assert.equal(await run(['areas', 'assign', '3', 'ads'], h.ctx), 0);
    assert.equal(h.world.milestoneOf(3), 'Ads');
    assert.match(h.text(), /\(now: «Content»\)/);
    assert.equal(await run(['areas', 'assign', '5', 'Content'], h.ctx), 0);
    assert.equal(h.world.milestoneOf(5), 'Content');
  });

  t('assign none takes an Issue out of its area', async (gitlab) => {
    const h = mk({ gitlab });
    assert.equal(await run(['areas', 'assign', '3', 'none'], h.ctx), 0);
    assert.equal(h.world.milestoneOf(3), null);
    assert.match(h.text(), /Will take Issue #3 out of area «Content»/);
  });

  t('assign says «nothing to change» when the Issue is already there, and writes nothing', async (gitlab) => {
    const h = mk({ gitlab });
    assert.equal(await run(['areas', 'assign', '3', 'Content'], h.ctx), 0);
    assert.equal(await run(['areas', 'assign', '8', 'none'], h.ctx), 0);
    assert.equal(h.text().match(/Nothing to change/g).length, 2);
    assert.equal(h.writes.length, 0);
  });

  t('assign --dry-run changes nothing', async (gitlab) => {
    const h = blocked({ gitlab });
    assert.equal(await run(['areas', 'assign', '8', 'Ads', '--dry-run'], h.ctx), 0);
    assert.equal(await run(['areas', 'assign', '3', 'none', '--dry-run'], h.ctx), 0);
    assert.match(h.text(), /Would put Issue #8 in area «Ads»/);
    assert.match(h.text(), /Would take Issue #3 out of area «Content»/);
    assert.match(h.text(), /Dry run: nothing was changed/);
    assert.equal(h.world.milestoneOf(8), null);
    assert.equal(h.world.milestoneOf(3), 'Content');
  });

  t('assign to an area that does not exist, or for an Issue that does not exist, is an error that changes nothing', async (gitlab) => {
    const h = mk({ gitlab });
    assert.equal(await run(['areas', 'assign', '8', 'Nope'], h.ctx), 1);
    assert.match(h.errText(), /no area «Nope»/i);
    assert.match(h.errText(), /areas set/);
    assert.equal(await run(['areas', 'assign', '999', 'Ads'], h.ctx), 1);
    assert.match(h.errText(), /Issue #999/);
    assert.equal(h.writes.length, 0);
    for (const argv of [['areas', 'assign'], ['areas', 'assign', '8'], ['areas', 'assign', 'x', 'Ads']]) assert.equal(await run(argv, mk({ gitlab }).ctx), 2, argv.join(' '));
  });

  // --- check ----------------------------------------------------------------------------------------------------------------------------

  t('check lists the Issues with no area, the areas with no estimate and the areas whose remaining is 0', async (gitlab) => {
    const h = mk({ gitlab, setup: (w) => { seed(w); w.milestone({ title: 'Done', description: 'Huddle remaining: 0' }); w.milestone({ title: 'Social', description: 'Huddle remaining: lots' }); } });
    assert.equal(await run(['areas', 'check'], h.ctx), 0);
    assert.match(h.text(), /No area \(open\): #8 CI tooling/);
    assert.match(h.text(), /No area \(closed\): #5 Old setup/);
    assert.match(h.text(), /No «Huddle remaining» line: Ads/);
    assert.match(h.text(), /Not a whole number: Social/);
    assert.match(h.text(), /Remaining is 0: Done/);
    assert.equal(h.writes.length, 0);
  });

  t('check --json prints the findings as data, and ok is true only when there is nothing to fix', async (gitlab) => {
    const h = mk({ gitlab });
    assert.equal(await run(['areas', 'check', '--json'], h.ctx), 0);
    const data = JSON.parse(h.text());
    assert.deepEqual(data.noArea, { open: [{ number: 8, title: 'CI tooling' }], closed: [{ number: 5, title: 'Old setup' }] });
    assert.deepEqual([data.missingEstimate, data.malformedEstimate, data.zeroRemaining, data.empty, data.ok], [['Ads'], [], [], [], false]); // Ads has no Issue and no line: it is listed once, as a missing estimate (Issue #52, point 4)

    const clean = harness({ gitlab, setup: (w) => { w.milestone({ title: 'Content', description: 'Huddle remaining: 2' }); w.issue({ number: 1, title: 'a', milestone: 'Content' }); } });
    assert.equal(await run(['areas', 'check'], clean.ctx), 0);
    assert.match(clean.text(), /nothing to fix/i);
  });

  t('the areas commands report a failed platform call as an error and exit 1', async (gitlab) => {
    const h = harness({ gitlab, setup: seed, wrap: (a) => ({ ...a, listMilestones: async () => { throw new Error('network down'); } }) });
    assert.equal(await run(['areas', 'list'], h.ctx), 1);
    assert.match(h.errText(), /network down/);
  });
}

test('an unknown areas subcommand prints the usage and exits 2', async () => {
  const h = mk();
  assert.equal(await run(['areas'], h.ctx), 2);
  assert.equal(await run(['areas', 'bogus'], h.ctx), 2);
  assert.match(h.errText(), /areas \[list \| set <title> --remaining N \| assign <issue> <title\|none> \| check\]/);
});
