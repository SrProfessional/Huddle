// Issue #199: in OpenAI Codex the session-start hook always says where the huddle command is, since Codex skills get no
// ${CLAUDE_PLUGIN_ROOT} placeholder. In Claude Code the hook's output does not change. Canned adapters only.
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { run } from '../../lib/cli/run.mjs';
import { toolOf } from '../../lib/cli/main.mjs';
import { CONFIG, harness } from './harness.mjs';

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

test('in Codex the Coach\'s «always» mark asks to start the watch the Codex way (Issue #212 reverses #199: the Coach works in Codex too)', async () => {
  const h = harness({ setup: quiet, wrap: (a) => ({ ...a, me: async () => 'SrProfessional' }) });
  h.ctx.updateCachePath = '/data/huddle-update.json';
  assert.equal(await run(['queue', '--always'], h.ctx), 0);
  h.out.length = 0;
  h.ctx.tool = 'codex';
  h.ctx.pluginRoot = 'D:/Codex/huddle';
  h.ctx.session = { tool: 'codex', id: 'coach-session' };
  assert.equal(await run(['role', 'coach'], h.ctx), 0);
  assert.equal(await run(['hook'], h.ctx), 0);
  const all = h.text();
  assert.match(all, /the watch starts now/);
  assert.match(all, /queue --wait <seconds> --codex/);
  assert.match(all, /Huddle \(OpenAI Codex\): the huddle command is/);
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

// Start the installed entry point in a fresh process without a real gh login or network.
function realCli(t) {
  const cwd = mkdtempSync(path.join(tmpdir(), 'huddle-role-cli-'));
  t.after(() => rmSync(cwd, { recursive: true, force: true }));
  const preload = path.join(cwd, 'canned-platform.mjs');
  const bin = fileURLToPath(new URL('../../bin/huddle', import.meta.url));
  const fake = new URL('../platform/fake-gh.mjs', import.meta.url).href;
  writeFileSync(path.join(cwd, 'huddle.json'), JSON.stringify({
    ...CONFIG, assignees: [...CONFIG.assignees, CONFIG.ai_manager], labels_on_start: false, clean_worktrees: false,
  }));
  writeFileSync(preload, `
    import cp from 'node:child_process';
    import os from 'node:os';
    import { syncBuiltinESMExports } from 'node:module';
    import { fakeGithub } from ${JSON.stringify(fake)};
    const canned = fakeGithub();
    os.homedir = () => process.env.HUDDLE_TEST_ROLE_HOME;
    cp.execFile = (file, args, options, done) => {
      if (file !== 'gh') throw new Error('Unexpected executable: ' + file);
      return { stdin: { end: (input) => Promise.resolve().then(() => canned.run(args, { input })).then(
        (stdout) => done(null, stdout, ''), (error) => done(error, '', String(error)),
      ) } };
    };
    cp.spawn = () => ({ on() {}, unref() {}, pid: 456 });
    syncBuiltinESMExports();
    globalThis.fetch = async () => { throw new Error('Network disabled in the test.'); };
  `);
  const env = { ...process.env, HUDDLE_TEST_ROLE_HOME: cwd };
  for (const key of ['PLUGIN_ROOT', 'CLAUDE_PLUGIN_ROOT', 'CODEX_THREAD_ID', 'CLAUDE_CODE_SESSION_ID']) delete env[key];
  return (args, identity, input = '') => {
    const result = spawnSync(process.execPath, ['--import', pathToFileURL(preload).href, bin, ...args], {
      cwd, env: { ...env, ...identity }, input, encoding: 'utf8', timeout: 10000,
    });
    assert.equal(result.status, 0, result.error?.message ?? result.stderr);
    return result.stdout;
  };
}

for (const client of ['claude', 'codex']) {
  test(`${client} real SessionStart reads stdin and shares its chosen role with foreground commands`, (t) => {
    const cli = realCli(t);
    const id = 'actual-session';
    const isCodex = client === 'codex';
    const hookEnv = isCodex ? { PLUGIN_ROOT: root } : { CLAUDE_PLUGIN_ROOT: root };
    const foreground = isCodex ? { CODEX_THREAD_ID: id } : { CLAUDE_CODE_SESSION_ID: id };
    const input = JSON.stringify({ hook_event_name: 'SessionStart', session_id: id, source: 'startup' });
    const guidance = (raw) => JSON.parse(raw).hookSpecificOutput.additionalContext;
    const initial = guidance(cli(['hook'], hookEnv, input));
    assert.match(initial, /Coach, Player, Both/);
    assert.match(initial, isCodex ? /request_user_input/ : /AskUserQuestion/);
    if (isCodex) {
      assert.match(initial, /request_user_input if available, otherwise request_user_input_async when supported/);
      assert.match(initial, /numbered list only when neither selector is available/);
      assert.match(initial, /follow the managed pending-question rule and wait for the reply/);
    }

    cli(['role', 'coach'], foreground);
    cli(['queue', '--always'], foreground);
    assert.equal(JSON.parse(cli(['role', '--json'], foreground)).role, 'coach');
    const startup = guidance(cli(['hook'], hookEnv, input));
    const rerun = guidance(cli(['hook'], foreground));
    for (const start of [startup, rerun]) {
      assert.doesNotMatch(start, /Eligible choices/);
      if (isCodex) {
        assert.match(start, /Huddle \(OpenAI Codex\)/);
        assert.match(start, /queue --wait <seconds> --codex/);
      } else {
        assert.match(start, /start the watch exactly as \/huddle-watch/);
        assert.doesNotMatch(start, /--codex/);
      }
    }
  });
}
