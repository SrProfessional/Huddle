// Issue #153: `huddle labels --issue <n> --started | --needs-decision` adds the session's label and recomputes the Issue in the same run,
// so the board is never left half-done (SocialCortex #301 kept «assigned» next to «in progress» for 5½ minutes). Canned adapter only.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { run } from '../../lib/cli/run.mjs';
import { harness, CONFIG } from './harness.mjs';

const dep = '## Goal\n\nx\n\n## Depends on\n\n- None\n';
const world = (w) => {
  w.issue({ number: 5, body: dep, assignees: ['ana'], labels: ['assigned'] });
  w.issue({ number: 6, body: dep, assignees: ['ana'], labels: ['in progress'] });
  w.issue({ number: 7, state: 'merged', body: dep });
  w.issue({ number: 8, body: 'No sections here.', assignees: ['ana'], labels: [] });
};

for (const gitlab of [false, true]) {
  const kind = gitlab ? 'gitlab' : 'github';

  test(`[${kind}] --started adds «in progress» and takes «assigned» off in one run`, async () => {
    const h = harness({ gitlab, setup: world });
    assert.equal(await run(['labels', '--issue', '5', '--started'], h.ctx), 0);
    assert.deepEqual(h.world.labelsOf(5), ['in progress']);
    assert.match(h.text(), /#5 → in progress − assigned/);
    assert.doesNotMatch(h.text(), /keeps its label/);
  });

  test(`[${kind}] --needs-decision adds «needs decision» and takes «in progress» off in one run`, async () => {
    const h = harness({ gitlab, setup: world });
    assert.equal(await run(['labels', '--issue', '6', '--needs-decision'], h.ctx), 0);
    assert.deepEqual(h.world.labelsOf(6), ['needs decision']);
    assert.match(h.text(), /#6 → needs decision − in progress/);
    assert.doesNotMatch(h.text(), /keeps its label/);
  });
}

test('renamed labels are used', async () => {
  const h = harness({ config: { ...CONFIG, labels: { progress: 'doing', assigned: 'mine' } }, setup: (w) => w.issue({ number: 5, body: dep, assignees: ['ana'], labels: ['mine'] }) });
  assert.equal(await run(['labels', '--issue', '5', '--started'], h.ctx), 0);
  assert.deepEqual(h.world.labelsOf(5), ['doing']);
});

test('--dry-run writes nothing and shows the change', async () => {
  const h = harness({ setup: world });
  assert.equal(await run(['labels', '--issue', '5', '--started', '--dry-run'], h.ctx), 0);
  assert.deepEqual(h.world.labelsOf(5), ['assigned']);
  assert.match(h.text(), /#5 → in progress − assigned/);
});

test('no --issue, both flags, a closed Issue or an unmanaged one: nothing changes', async () => {
  for (const args of [['labels', '--started'], ['labels', '--issue', '5', '--started', '--needs-decision']]) {
    const h = harness({ setup: world });
    assert.equal(await run(args, h.ctx), 2, args.join(' '));
    assert.deepEqual(h.world.labelsOf(5), ['assigned']);
  }
  const closed = harness({ setup: world });
  await run(['labels', '--issue', '7', '--started'], closed.ctx);
  assert.deepEqual(closed.world.labelsOf(7), []);
  assert.match(closed.text(), /#7 is closed/);
  const unmanaged = harness({ setup: world });
  assert.equal(await run(['labels', '--issue', '8', '--started'], unmanaged.ctx), 0);
  assert.deepEqual(unmanaged.world.labelsOf(8), []);
});

const read = (rel) => readFileSync(fileURLToPath(new URL(`../../${rel}`, import.meta.url)), 'utf8');

test('the play skill and the CLAUDE.md block use the one command, and never say to add the label by hand', () => {
  for (const f of ['skills/huddle-play/SKILL.md', 'templates/CLAUDE.huddle.md']) {
    const t = read(f);
    assert.match(t, /labels --issue <n> --started/, f);
    assert.match(t, /labels --issue <n> --needs-decision/, f);
    assert.doesNotMatch(t, /add the `in progress` label|add the label\s+`needs decision`|add the `needs decision` label/, f);
  }
});
