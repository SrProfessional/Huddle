// Issue #29: `huddle doctor` has a «plugin» check. No network: the CLI only says whether it runs from an installed plugin.
import test from 'node:test';
import assert from 'node:assert/strict';
import { run } from '../../lib/cli/run.mjs';
import { harness } from './harness.mjs';
import { isInstalledPlugin } from '../../lib/cli/main.mjs';

const LABELS = ['ready', 'assigned', 'in progress', 'in review', 'blocked', 'needs decision', 'changes requested from AI Manager'];
const wrap = (a) => ({ ...a, listLabels: async () => LABELS });

test('doctor plugin check: ✔ when it runs from an installed plugin', async () => {
  const h = harness({ wrap });
  h.ctx.pluginInstalled = true;
  assert.equal(await run(['doctor'], h.ctx), 0);
  assert.match(h.text(), /✔ plugin: /);
});

test('doctor plugin check: not installed gives a hint with the two commands, and does not fail the run', async () => {
  const h = harness({ wrap });
  h.ctx.pluginInstalled = false;
  assert.equal(await run(['doctor'], h.ctx), 0);
  assert.match(h.text(), /⚠ plugin: /);
  assert.match(h.text(), /claude plugin marketplace add SrProfessional\/Huddle/);
  assert.match(h.text(), /claude plugin install huddle@huddle/);
});

test('doctor plugin check also shows when huddle.json is bad, and the other checks stay', async () => {
  const h = harness({ file: '{', wrap });
  h.ctx.pluginInstalled = false;
  assert.equal(await run(['doctor'], h.ctx), 1);
  assert.match(h.text(), /plugin:/);
  assert.match(h.text(), /✖ huddle\.json/);
  const ok = harness({ wrap });
  ok.ctx.pluginInstalled = true;
  await run(['doctor'], ok.ctx);
  for (const name of ['huddle.json', 'login', 'ai_manager', 'labels']) assert.match(ok.text(), new RegExp(`✔ ${name}`));
});

test('isInstalledPlugin: true under the plugin cache or marketplaces folder, or with CLAUDE_PLUGIN_ROOT; false for a plain clone', () => {
  assert.equal(isInstalledPlugin('C:\\Users\\a\\.claude\\plugins\\cache\\huddle\\huddle\\0.1.0\\lib\\cli\\main.mjs', {}), true);
  assert.equal(isInstalledPlugin('/home/a/.claude/plugins/marketplaces/huddle/lib/cli/main.mjs', {}), true);
  assert.equal(isInstalledPlugin('/home/a/src/Huddle/lib/cli/main.mjs', { CLAUDE_PLUGIN_ROOT: '/home/a/.claude/plugins/cache/huddle/huddle/0.1.0' }), true);
  assert.equal(isInstalledPlugin('/home/a/src/Huddle/lib/cli/main.mjs', {}), false);
});
