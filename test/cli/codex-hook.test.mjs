// Issue #199: in OpenAI Codex the session-start hook always says where the huddle command is, since Codex skills get no
// ${CLAUDE_PLUGIN_ROOT} placeholder. In Claude Code the hook's output does not change. Canned adapters only.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { run } from '../../lib/cli/run.mjs';
import { toolOf } from '../../lib/cli/main.mjs';
import { harness } from './harness.mjs';

const quiet = (w) => { w.issue({ number: 42, title: 'Add login form', body: '## Depends on\n\n- None\n', assignees: ['ana'] }); };

test('Codex is told apart by its own PLUGIN_ROOT variable', () => {
  assert.equal(toolOf({ PLUGIN_ROOT: 'D:/Codex/plugins/huddle', CLAUDE_PLUGIN_ROOT: 'D:/Codex/plugins/huddle' }), 'codex');
  assert.equal(toolOf({ CLAUDE_PLUGIN_ROOT: 'C:/Users/x/.claude/plugins/huddle' }), 'claude');
  assert.equal(toolOf({}), 'claude');
});

test('in Codex the hook always gives the path of the huddle command, as context', async () => {
  const h = harness({ setup: quiet });
  h.ctx.tool = 'codex';
  h.ctx.pluginRoot = 'D:/Codex/plugins/cache/huddle/huddle/0.9.5';
  assert.equal(await run(['hook'], h.ctx), 0);
  const out = JSON.parse(h.text());
  assert.equal(out.hookSpecificOutput.hookEventName, 'SessionStart');
  assert.match(out.hookSpecificOutput.additionalContext, /node "D:\/Codex\/plugins\/cache\/huddle\/huddle\/0\.9\.5\/bin\/huddle"/);
  assert.match(out.hookSpecificOutput.additionalContext, /\$\{CLAUDE_PLUGIN_ROOT\}/);
});

test('in Claude Code a quiet start still prints nothing', async () => {
  const h = harness({ setup: quiet });
  h.ctx.tool = 'claude';
  assert.equal(await run(['hook'], h.ctx), 0);
  assert.equal(h.text().trim(), '');
});

const root = fileURLToPath(new URL('../../', import.meta.url));
test('there is no plugin.json at the repo root (Codex then drops every hook of the plugin, openai/codex#39895)', () => {
  assert.equal(existsSync(`${root}plugin.json`), false);
  assert.ok(JSON.parse(readFileSync(`${root}.claude-plugin/marketplace.json`, 'utf8')).plugins.length >= 1, 'Codex reads the same marketplace file');
});
