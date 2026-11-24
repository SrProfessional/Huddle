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

  test(`${on}: bad arguments print the usage`, async () => {
    const h = harness({ gitlab, setup: world });
    assert.equal(await run(['conflicts', '--dry-run'], h.ctx), 2);
    assert.equal(await run(['conflicts', '--apply', '--json'], h.ctx), 2);
    assert.equal(await run(['conflicts', 'x'], h.ctx), 2);
  });
}
