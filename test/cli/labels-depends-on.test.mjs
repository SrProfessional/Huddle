import test from 'node:test';
import assert from 'node:assert/strict';
import { run } from '../../lib/cli/run.mjs';
import { harness } from './harness.mjs';

// Issue #99: one «Depends on» line never stops `huddle labels` for the whole repo.
const world = (deps) => (w) => {
  w.issue({ number: 12, title: 'open dependency' });
  w.issue({ number: 20, title: 'done', state: 'merged' });
  w.review({ number: 34 }); // a pull request: its number is not an Issue
  w.issue({ number: 30, title: 'lists a PR in a note', body: `## Depends on\n\n${deps}\n` });
  w.issue({ number: 31, title: 'ready one', body: '## Depends on\n\n- #20\n' });
};

for (const gitlab of [false, true]) {
  const kind = gitlab ? 'gitlab' : 'github';

  test(`[${kind}] a #N inside a note is not a dependency: the run succeeds and the other Issue is labelled`, async () => {
    const h = harness({ gitlab, setup: world('- #12 (see PR #34)') });
    assert.equal(await run(['labels'], h.ctx), 0);
    assert.match(h.text(), /#30 → blocked \(waits for #12\)/);
    assert.deepEqual(h.world.labelsOf(30), ['blocked']);
    assert.deepEqual(h.world.labelsOf(31), ['assigned']);
    assert.doesNotMatch(h.text(), /warning/);
  });

  for (const dry of [false, true]) {
    test(`[${kind}] a number that is not an Issue is blocked with one warning${dry ? ' (dry run)' : ''}`, async () => {
      const h = harness({ gitlab, setup: world('- #999') });
      assert.equal(await run(['labels', ...(dry ? ['--dry-run'] : [])], h.ctx), 0);
      assert.match(h.text(), /#30 → blocked \(waits for #999\)/);
      const warnings = h.text().split('\n').filter((l) => l.startsWith('warning:'));
      assert.deepEqual(warnings, ['warning: #30 lists #999 under «Depends on», which is not an Issue; treating it as not merged yet']);
      if (!dry) assert.deepEqual(h.world.labelsOf(31), ['assigned']);
    });
  }

  test(`[${kind}] a PR number listed as a dependency is a warning too`, async () => {
    const h = harness({ gitlab, setup: world('- #34') });
    assert.equal(await run(['labels'], h.ctx), 0);
    assert.match(h.text(), /warning: #30 lists #34 under «Depends on»/);
  });

  test(`[${kind}] a login or network failure still stops the run with a non-zero exit`, async () => {
    const h = harness({
      gitlab, setup: world('- #12'),
      wrap: (adapter) => ({ ...adapter, issueState: async () => { throw new Error('gh api failed: dial tcp: lookup api.github.com: no such host'); } }),
    });
    assert.notEqual(await run(['labels'], h.ctx), 0);
    assert.match(h.errText(), /no such host/);
  });
}
