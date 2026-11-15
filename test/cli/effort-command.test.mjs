// Issue #162: `huddle effort <n>` prints an Issue's effort and where it comes from; `huddle effort --suggest <file>` prints a suggestion as JSON.
// Read-only. Canned adapter only.
import test from 'node:test';
import assert from 'node:assert/strict';
import { run } from '../../lib/cli/run.mjs';
import { harness } from './harness.mjs';

const body = (effort) => `## Goal\n\nx\n\n## Depends on\n\n- None\n\n${effort ? `## Effort\n\n${effort}\n\n` : ''}## Allowed files\n\n- \`src/a.mjs\`\n`;
const world = (w) => { w.issue({ number: 5, body: body('3') }); w.issue({ number: 6, body: body(null) }); };

for (const gitlab of [false, true]) {
  test(`[${gitlab ? 'gitlab' : 'github'}] effort <n> prints the effort and where it comes from`, async () => {
    const h = harness({ gitlab, setup: world });
    assert.equal(await run(['effort', '5'], h.ctx), 0);
    assert.equal(h.text(), '#5: effort 3 (from its «Effort» section)');
    const d = harness({ gitlab, setup: world });
    assert.equal(await run(['effort', '6'], d.ctx), 0);
    assert.equal(d.text(), '#6: effort 2 (the default: it has no «Effort» section)');
  });
}

test('effort of an Issue that is not open says so', async () => {
  const h = harness({ setup: world });
  assert.equal(await run(['effort', '99'], h.ctx), 1);
  assert.match(h.text(), /#99 is not an open Issue/);
});

test('effort --suggest <file> prints the suggestion as JSON', async () => {
  const h = harness({ setup: world });
  h.ctx.writeFile('/tmp/draft.md', `## Goal\n\nx\n\n## Allowed files\n\n${Array.from({ length: 8 }, (_, i) => `- \`api/f${i}.mjs\``).join('\n')}\n\n## Tests that must pass\n\n- a\n- b\n- c\n`);
  assert.equal(await run(['effort', '--suggest', '/tmp/draft.md'], h.ctx), 0);
  const s = JSON.parse(h.text());
  assert.equal(s.effort, 2, '8 files (+2) and 3 tests (+1) are 3 points');
  assert.equal(s.split, false);
  assert.ok(Array.isArray(s.reasons) && s.reasons.length);
});

test('a missing draft file is one clear line; bad arguments are exit 2', async () => {
  const h = harness({ setup: world });
  assert.equal(await run(['effort', '--suggest', '/tmp/none.md'], h.ctx), 1);
  assert.match(h.errText(), /cannot read \/tmp\/none\.md/);
  for (const args of [['effort'], ['effort', 'abc'], ['effort', '--suggest'], ['effort', '5', '6']]) {
    const b = harness({ setup: world });
    assert.equal(await run(args, b.ctx), 2, args.join(' '));
  }
});
