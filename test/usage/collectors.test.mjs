import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { collectUsage, projectFolder } from '../../lib/usage/index.mjs';

const fixture = (name) => readFileSync(new URL(`fixtures/${name}`, import.meta.url), 'utf8');

test('collectUsage totals both tools and resolves each distinct checkout branch once', async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'huddle-usage-'));
  const root = path.join(dir, 'repo');
  const worktree = path.join(root, '.claude', 'worktrees', 'custom-folder');
  const claude = path.join(dir, 'claude');
  const codex = path.join(dir, 'codex');
  const project = path.join(claude, 'projects', projectFolder(worktree));
  assert.match(project, /-repo--claude-worktrees-custom-folder$/);
  mkdirSync(project, { recursive: true });
  writeFileSync(path.join(project, 'session.jsonl'), fixture('claude.jsonl').replaceAll('h229-usage-collectors', 'h94-usage-collectors').replace('"cache_creation_input_tokens":6,', ''));
  mkdirSync(path.join(codex, 'sessions', '2026', '11'), { recursive: true });
  const codexLog = fixture('codex.jsonl').replace('h229-usage-collectors', 'custom-folder');
  writeFileSync(path.join(codex, 'sessions', '2026', '11', 'session.jsonl'), codexLog.replaceAll('/repo', root.replaceAll('\\', '/')));
  const warnings = [];
  const branches = [];
  const rows = await collectUsage({
    root, worktrees: [worktree], checkoutBranches: new Map([[worktree, 'h94-usage-collectors']]),
    claudeConfigDir: claude, codexHome: codex, warn: (line) => warnings.push(line),
    issueForBranch: async (branch) => {
      branches.push(branch);
      return branch === 'h94-usage-collectors' ? 229 : null;
    },
  });
  assert.deepEqual(rows, [
    { day: '2026-11-19', tool: 'Claude Code', model: 'claude-sonnet-4-5', issue: 229, input: 10, output: 4, cacheRead: 3, cacheWrite: 6, reasoning: 0 },
    { day: '2026-11-20', tool: 'Claude Code', model: 'claude-haiku', issue: 'no Issue', input: 2, output: 1, cacheRead: 0, cacheWrite: 0, reasoning: 0 },
    { day: '2026-11-20', tool: 'Codex', model: 'gpt-5', issue: 229, input: 12, output: 3, cacheRead: 5, cacheWrite: 0, reasoning: 2 },
  ]);
  assert.equal(warnings.length, 1, 'a broken line is reported once and does not stop collection');
  assert.deepEqual(branches.sort(), ['h94-usage-collectors', 'other']);
});
