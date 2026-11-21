import test from 'node:test';
import assert from 'node:assert/strict';
import { run } from '../../lib/cli/run.mjs';
import { CONFIG, harness } from '../cli/harness.mjs';
import { collectUsage } from '../../lib/usage/index.mjs';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

test('usage --json prints only the login and numeric usage rows, and --since filters days', async () => {
  const h = harness();
  h.ctx.collectUsage = () => [
    { day: '2026-11-19', tool: 'Codex', model: 'gpt-5', issue: 229, input: 1, output: 2, cacheRead: 3, cacheWrite: 4, reasoning: 5 },
    { day: '2026-11-20', tool: 'Claude Code', model: 'claude', issue: 'no Issue', input: 6, output: 7, cacheRead: 8, cacheWrite: 9, reasoning: 0 },
  ];
  assert.equal(await run(['usage', '--json', '--since', '2026-11-20'], h.ctx), 0);
  assert.deepEqual(JSON.parse(h.text()), { person: 'SrProfessional', rows: [{ day: '2026-11-20', tool: 'Claude Code', model: 'claude', issue: 'no Issue', input: 6, output: 7, cacheRead: 8, cacheWrite: 9, reasoning: 0 }] });
});

test('usage resolves checkout and worktree branches through canned staging PR responses', async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'huddle-usage-cli-'));
  const root = path.join(dir, 'checkout');
  const worktree = path.join(dir, 'another checkout');
  const sessions = path.join(dir, 'sessions');
  mkdirSync(sessions);
  const writeLog = (name, cwd, input) => writeFileSync(path.join(sessions, name + '.jsonl'), [
    { type: 'session_meta', payload: { cwd, model: 'gpt-5' } },
    { type: 'event_msg', payload: { type: 'user_message', message: 'synthetic private text' } },
    { timestamp: '2026-11-20T12:00:00Z', payload: { info: { last_token_usage: { input_tokens: input } } } },
  ].map((item) => JSON.stringify(item)).join('\n'));
  writeLog('root', root, 7);
  writeLog('tree', worktree, 12);
  writeLog('case', path.join(dir, 'Another checkout'), 999);
  const h = harness({ config: { ...CONFIG, staging_branch: 'staging' } });
  h.world.review({ number: 236, branch: 'h94-usage-collectors', base: 'staging', body: 'Closes #229' });
  h.ctx.root = root;
  h.ctx.readFile = () => JSON.stringify({ ...CONFIG, staging_branch: 'staging' });
  h.ctx.git = (args) => {
    assert.deepEqual(args, ['worktree', 'list', '--porcelain', '-z']);
    return ['worktree ' + root, 'HEAD abc', 'branch refs/heads/h95-unresolved', '',
      'worktree ' + worktree, 'HEAD def', 'branch refs/heads/h94-usage-collectors', '', ''].join('\0');
  };
  h.ctx.collectUsage = (options) => collectUsage({ ...options, claudeConfigDir: dir, codexHome: dir });
  assert.equal(await run(['usage', '--json'], h.ctx), 0);
  const rows = JSON.parse(h.text()).rows;
  assert.deepEqual(rows.map(({ issue, input }) => [issue, input]), [[229, 12], ['no Issue', 7]]);
  assert.deepEqual(h.calls().filter(({ args }) => args.includes('--head')).map(({ args }) => args[args.indexOf('--head') + 1]).sort(),
    ['h94-usage-collectors', 'h95-unresolved']);
  assert.doesNotMatch(h.text(), /synthetic private text/);
});
