// Issue #312: `huddle conflicts` lists the planned file conflicts between open Issues, `--apply` settles the order in «Depends on» (Coach only), and the board
// then shows `blocked` (docs/design.md §22). Canned adapters for GitHub and GitLab, no real call.
import test from 'node:test';
import assert from 'node:assert/strict';
import { run } from '../../lib/cli/run.mjs';
import { harness } from './harness.mjs';

const body = (files, deps = '- None') => `## Depends on\n\n${deps}\n\n## Allowed files\n\n${files.map((f) => `- \`${f}\``).join('\n')}\n\n## Tests that must pass\n\n- x\n`;
const world = (w) => {
  w.issue({ number: 84, title: 'Dashboard scene', body: body(['Scene.unity', 'A.cs']) });
  w.issue({ number: 85, title: 'Dashboard buttons', body: body(['Scene.unity']) });
  w.issue({ number: 91, title: 'Dashboard data', body: body(['A.cs', 'Scene.unity']) });
  w.issue({ number: 7, title: 'Elsewhere', body: body(['other.mjs']) });
};
const asAna = (setup, gitlab) => harness({ gitlab, setup, wrap: (a) => ({ ...a, me: async () => 'ana' }) });

for (const gitlab of [false, true]) {
  const on = gitlab ? 'GitLab' : 'GitHub';

  test(`${on}: huddle conflicts lists each pair with its file and order, and the Issues with no conflict; it changes nothing`, async () => {
    const h = harness({ gitlab, setup: world });
    assert.equal(await run(['conflicts'], h.ctx), 0);
    assert.match(h.text(), /#84 first, then #85: Scene\.unity/);
    assert.match(h.text(), /#84 first, then #91: A\.cs, Scene\.unity/);
    assert.match(h.text(), /#85 first, then #91: Scene\.unity/);
    assert.match(h.text(), /No conflict with anyone: #7/);
    assert.equal(h.world.bodyOf(85), body(['Scene.unity']));
    assert.deepEqual(h.world.labelsOf(85), []);
  });

  test(`${on}: --json has the rows and the free Issues; a Player may read it`, async () => {
    const h = asAna(world, gitlab);
    assert.equal(await run(['conflicts', '--json'], h.ctx), 0);
    const r = JSON.parse(h.text());
    assert.deepEqual(r.rows.map((x) => [x.first, x.then]), [[84, 85], [84, 91], [85, 91]]);
    assert.deepEqual(r.free, [7]);
  });

  test(`${on}: no conflict says so`, async () => {
    const h = harness({ gitlab, setup: (w) => { w.issue({ number: 1, title: 'a', body: body(['a.mjs']) }); w.issue({ number: 2, title: 'b', body: body(['b.mjs']) }); } });
    assert.equal(await run(['conflicts'], h.ctx), 0);
    assert.match(h.text(), /No planned file conflicts/);
  });

  test(`${on}: --apply writes «- #first» once into «Depends on», runs the labels, and the later Issues are blocked`, async () => {
    const h = harness({ gitlab, setup: world });
    assert.equal(await run(['conflicts', '--apply'], h.ctx), 0);
    assert.equal(h.world.bodyOf(84), body(['Scene.unity', 'A.cs']), 'the first Issue is not touched');
    assert.equal(h.world.bodyOf(85), body(['Scene.unity'], '- #84'));
    assert.equal(h.world.bodyOf(91), body(['A.cs', 'Scene.unity'], '- #84\n- #85'));
    assert.equal(h.world.bodyOf(7), body(['other.mjs']));
    assert.ok(h.world.labelsOf(85).includes('blocked'));
    assert.ok(h.world.labelsOf(91).includes('blocked'));
    assert.ok(!h.world.labelsOf(84).includes('blocked'));
    assert.match(h.text(), /#85: added - #84/);
    h.out.length = 0;
    assert.equal(await run(['conflicts', '--apply'], h.ctx), 0);
    assert.equal(h.world.bodyOf(85), body(['Scene.unity'], '- #84'), 'a second run adds nothing');
    assert.match(h.text(), /Nothing to change/);
  });

  test(`${on}: --apply --dry-run shows what would change and changes nothing`, async () => {
    const h = harness({ gitlab, setup: world });
    assert.equal(await run(['conflicts', '--apply', '--dry-run'], h.ctx), 0);
    assert.match(h.text(), /#85: would add - #84/);
    assert.equal(h.world.bodyOf(85), body(['Scene.unity']));
    assert.deepEqual(h.world.labelsOf(85), []);
  });

  test(`${on}: --apply is refused for anyone but the Coach, with one line and no change`, async () => {
    const h = asAna(world, gitlab);
    assert.equal(await run(['conflicts', '--apply'], h.ctx), 1);
    assert.match(h.text(), /only the Coach \(SrProfessional\) can settle the order; nothing changed/);
    assert.equal(h.world.bodyOf(85), body(['Scene.unity']));
  });

  test(`${on}: a link that would close a circle stops --apply with the link to break, and nothing is written`, async () => {
    const h = harness({ gitlab, setup: (w) => {
      w.issue({ number: 1, title: 'one', body: body(['a.mjs'], '- #3') });
      w.issue({ number: 2, title: 'two', body: body(['a.mjs', 'b.mjs']) });
      w.issue({ number: 3, title: 'three', body: body(['b.mjs']) });
    } });
    assert.equal(await run(['conflicts', '--apply'], h.ctx), 1);
    assert.match(h.text(), /circular wait: #1 → #3 → #2 → #1/);
    assert.match(h.text(), /to break it, change the «Depends on» of #1/);
    assert.equal(h.world.bodyOf(2), body(['a.mjs', 'b.mjs']));
  });

  // Issue #315: --order takes the Coach's order.
  test(`${on}: --apply --order writes the Coach's order, only between Issues that share a file, and runs the labels`, async () => {
    const h = harness({ gitlab, setup: world });
    assert.equal(await run(['conflicts', '--apply', '--order', '91,84,85'], h.ctx), 0);
    assert.equal(h.world.bodyOf(91), body(['A.cs', 'Scene.unity']), 'the first named Issue is not touched');
    assert.equal(h.world.bodyOf(84), body(['Scene.unity', 'A.cs'], '- #91'));
    assert.equal(h.world.bodyOf(85), body(['Scene.unity'], '- #84\n- #91'));
    assert.equal(h.world.bodyOf(7), body(['other.mjs']));
    assert.ok(h.world.labelsOf(84).includes('blocked'));
    assert.ok(!h.world.labelsOf(91).includes('blocked'));
  });

  test(`${on}: --order works with --dry-run and changes nothing`, async () => {
    const h = harness({ gitlab, setup: world });
    assert.equal(await run(['conflicts', '--apply', '--dry-run', '--order', '91,84,85'], h.ctx), 0);
    assert.match(h.text(), /#84: would add - #91/);
    assert.equal(h.world.bodyOf(84), body(['Scene.unity', 'A.cs']));
    assert.deepEqual(h.world.labelsOf(84), []);
  });

  test(`${on}: --order is refused for anyone but the Coach, and for a repeated or not-open Issue, with one line and no change`, async () => {
    const ana = asAna(world, gitlab);
    assert.equal(await run(['conflicts', '--apply', '--order', '91,84,85'], ana.ctx), 1);
    assert.match(ana.text(), /only the Coach \(SrProfessional\) can settle the order; nothing changed/);
    assert.equal(ana.world.bodyOf(84), body(['Scene.unity', 'A.cs']));
    const dup = harness({ gitlab, setup: world });
    assert.equal(await run(['conflicts', '--apply', '--order', '91,84,91'], dup.ctx), 1);
    assert.match(dup.text(), /#91 is named twice in --order; nothing changed/);
    assert.equal(dup.world.bodyOf(84), body(['Scene.unity', 'A.cs']));
    const gone = harness({ gitlab, setup: world });
    assert.equal(await run(['conflicts', '--apply', '--order', '91,500,84'], gone.ctx), 1);
    assert.match(gone.text(), /#500 is not an open Issue; nothing changed/);
    assert.equal(gone.world.bodyOf(84), body(['Scene.unity', 'A.cs']));
    assert.deepEqual(gone.world.labelsOf(84), []);
  });

  test(`${on}: --order that would close a circle writes nothing and names the link`, async () => {
    const h = harness({ gitlab, setup: (w) => {
      w.issue({ number: 1, title: 'one', body: body(['a.mjs'], '- #2') });
      w.issue({ number: 2, title: 'two', body: body(['a.mjs']) });
    } });
    assert.equal(await run(['conflicts', '--apply', '--order', '1,2'], h.ctx), 1);
    assert.match(h.text(), /#2 cannot wait for #1: circular wait/);
    assert.equal(h.world.bodyOf(2), body(['a.mjs']));
  });

  test(`${on}: --order needs --apply, a list of Issue numbers, and is given once`, async () => {
    const h = harness({ gitlab, setup: world });
    assert.equal(await run(['conflicts', '--order', '91,84'], h.ctx), 2);
    assert.equal(await run(['conflicts', '--apply', '--order'], h.ctx), 2);
    assert.equal(await run(['conflicts', '--apply', '--order', 'a,b'], h.ctx), 2);
    assert.equal(await run(['conflicts', '--apply', '--order', '91,,84'], h.ctx), 2);
    assert.equal(await run(['conflicts', '--apply', '--order', '91,84', '--order', '84,85'], h.ctx), 2);
  });

  test(`${on}: an Issue whose «Allowed files» says None never conflicts, and a fenced «Depends on» is not edited`, async () => {
    const h = harness({ gitlab, setup: (w) => {
      const none = (deps) => `## Depends on\n\n${deps}\n\n## Allowed files\n\n- None\n`;
      w.issue({ number: 1, title: 'a', body: none('- None') });
      w.issue({ number: 2, title: 'b', body: none('- None') });
      w.issue({ number: 3, title: 'c', body: '## Goal\n\n```text\n## Depends on\n\n- None\n```\n\n## Depends on\n\n- None\n\n## Allowed files\n\n- `x.mjs`\n' });
      w.issue({ number: 4, title: 'd', body: body(['x.mjs']) });
    } });
    assert.equal(await run(['conflicts'], h.ctx), 0);
    assert.match(h.text(), /#3 first, then #4: x\.mjs/);
    assert.doesNotMatch(h.text(), /None/);
    assert.equal(await run(['conflicts', '--apply'], h.ctx), 0);
    assert.match(h.world.bodyOf(4), /- #3/);
    assert.equal(h.world.bodyOf(1), '## Depends on\n\n- None\n\n## Allowed files\n\n- None\n');
  });

  test(`${on}: bad arguments print the usage`, async () => {
    const h = harness({ gitlab, setup: world });
    assert.equal(await run(['conflicts', '--dry-run'], h.ctx), 2);
    assert.equal(await run(['conflicts', '--apply', '--json'], h.ctx), 2);
    assert.equal(await run(['conflicts', 'x'], h.ctx), 2);
  });
}
