// Issue #143: the update notice and the doctor hint name the scope Huddle is installed in, read from Claude Code's
// installed_plugins.json. The file, the release lookup and the clock are fakes: no test touches the real Claude Code files.
import test from 'node:test';
import assert from 'node:assert/strict';
import { installScope, versionCheck, skillNotice, updateSteps, noticeText } from '../../lib/core/update.mjs';
import { installedPluginsPath } from '../../lib/cli/main.mjs';

const LIST = '/home/ana/.claude/plugins/installed_plugins.json';
const ROOT = '/plugins/cache/huddle/huddle/0.8.0';

function ctxWith(list, { root = 'D:\\GitHub\\shop', raw } = {}) {
  const files = new Map([[`${ROOT}/.claude-plugin/plugin.json`, JSON.stringify({ version: '0.8.0' })]]);
  if (raw !== undefined) files.set(LIST, raw);
  else if (list) files.set(LIST, JSON.stringify({ version: 2, plugins: { 'huddle@huddle': list } }));
  return {
    root,
    installedPluginsPath: LIST,
    readFile: (p) => (files.has(p) ? files.get(p) : null),
    writeFile: (p, t) => files.set(p, t),
    fetch: async () => ({ ok: true, status: 200, json: async () => ({ tag_name: 'v0.8.2' }) }),
    now: () => new Date('2026-11-15T10:00:00Z'),
    pluginRoot: ROOT,
    updateCachePath: '/data/huddle-update.json',
    pluginInstalled: true,
    updateTimeoutMs: 50,
  };
}

const user = { scope: 'user', version: '0.8.0' };
const project = (projectPath) => ({ scope: 'project', projectPath, version: '0.8.0' });

test('a project entry for this repo, written with another case and other slashes, is a project install', () => {
  assert.equal(installScope(ctxWith([user, project('d:/github/SHOP/')])), 'project');
});

test('a project entry for another folder plus a user entry is a user install', () => {
  assert.equal(installScope(ctxWith([project('D:\\GitHub\\other'), user])), 'user');
});

test('only a project entry for another folder, no file, broken JSON or no huddle entry: the per-project default', () => {
  assert.equal(installScope(ctxWith([project('D:\\GitHub\\other')])), 'project');
  assert.equal(installScope(ctxWith(null)), 'project');
  assert.equal(installScope(ctxWith(null, { raw: '{broken' })), 'project');
  assert.equal(installScope(ctxWith(null, { raw: '{"version":2,"plugins":{}}' })), 'project');
  assert.equal(installScope({ ...ctxWith([user]), installedPluginsPath: null }), 'project');
});

test('the steps name the scope; a clone still pulls', () => {
  assert.match(updateSteps(false, 'user'), /claude plugin update huddle@huddle --scope user/);
  assert.doesNotMatch(updateSteps(false, 'user'), /--scope project|inside this project/);
  assert.match(updateSteps(false, 'project'), /claude plugin update huddle@huddle --scope project/);
  assert.match(updateSteps(false), /--scope project/);
  assert.match(updateSteps(true, 'user'), /Pull your clone/);
  for (const s of ['user', 'project']) {
    assert.match(updateSteps(false, s), /\/plugins/);
    assert.match(updateSteps(false, s), /\/reload-plugins/);
  }
  assert.match(noticeText({ latest: '0.8.2', installed: '0.8.0', clone: false, scope: 'user' }), /--scope user/);
});

test('the doctor hint and the skill notice name the user scope for a user install', async () => {
  const line = await versionCheck(ctxWith([user]));
  assert.match(line.detail, /--scope user/);
  assert.doesNotMatch(line.detail, /--scope project/);
  const n = await skillNotice(ctxWith([user]), async () => false);
  assert.match(n.text, /--scope user/);
});

test('the doctor hint keeps the project scope for a project install', async () => {
  const line = await versionCheck(ctxWith([project('D:\\GitHub\\shop')]));
  assert.match(line.detail, /--scope project/);
});

test('installedPluginsPath: under CLAUDE_CONFIG_DIR when set, else ~/.claude', () => {
  assert.match(installedPluginsPath({ CLAUDE_CONFIG_DIR: '/cfg' }, '/home/ana').replaceAll('\\', '/'), /^\/cfg\/plugins\/installed_plugins\.json$/);
  assert.match(installedPluginsPath({}, '/home/ana').replaceAll('\\', '/'), /^\/home\/ana\/\.claude\/plugins\/installed_plugins\.json$/);
});
