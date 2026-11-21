import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, cpSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { collectUsage, projectFolder } from '../../lib/usage/index.mjs';

const fixture = (name) => readFileSync(new URL(`fixtures/${name}`, import.meta.url), 'utf8');

test('collectUsage totals Claude and Codex by tool, model, day and Issue; duplicate turns count once', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'huddle-usage-'));
  const root = path.join(dir, 'repo');
  const worktree = path.join(root, '.claude', 'worktrees', 'h229-usage-collectors');
  const claude = path.join(dir, 'claude');
  const codex = path.join(dir, 'codex');
  mkdirSync(path.join(claude, 'projects', projectFolder(root)), { recursive: true });
  writeFileSync(path.join(claude, 'projects', projectFolder(root), 'session.jsonl'), fixture('claude.jsonl'));
  mkdirSync(path.join(codex, 'sessions', '2026', '11'), { recursive: true });
  writeFileSync(path.join(codex, 'sessions', '2026', '11', 'session.jsonl'), fixture('codex.jsonl').replaceAll('/repo', root.replaceAll('\\', '/')));
  const warnings = [];
  const rows = collectUsage({ root, worktrees: [worktree], claudeConfigDir: claude, codexHome: codex, warn: (line) => warnings.push(line) });
  assert.deepEqual(rows, [
    { day: '2026-11-19', tool: 'Claude Code', model: 'claude-sonnet-4-5', issue: 229, input: 10, output: 4, cacheRead: 3, cacheWrite: 6, reasoning: 0 },
    { day: '2026-11-20', tool: 'Claude Code', model: 'claude-haiku', issue: 'no Issue', input: 2, output: 1, cacheRead: 0, cacheWrite: 0, reasoning: 0 },
    { day: '2026-11-20', tool: 'Codex', model: 'gpt-5', issue: 229, input: 12, output: 3, cacheRead: 5, cacheWrite: 0, reasoning: 2 },
  ]);
  assert.equal(warnings.length, 1, 'a broken line is reported once and does not stop collection');
});
