import { homedir } from 'node:os';
import path from 'node:path';
import { collectClaude, projectFolder } from './claude.mjs';
import { collectCodex } from './codex.mjs';

export { projectFolder };

export const issueForBranch = (branch) => {
  const match = String(branch ?? '').match(/^h(\d+)-/i);
  return match ? Number(match[1]) : 'no Issue';
};

const add = (rows, record) => {
  const issue = issueForBranch(record.branch);
  const key = [record.day, record.tool, record.model, issue].join('\0');
  const row = rows.get(key) ?? { day: record.day, tool: record.tool, model: record.model, issue, input: 0, output: 0, cacheRead: 0, cacheWrite: 0, reasoning: 0 };
  for (const field of ['input', 'output', 'cacheRead', 'cacheWrite', 'reasoning']) row[field] += Number(record[field]) || 0;
  rows.set(key, row);
};

/** Collects local token accounting. Transcript contents never leave this function. */
export function collectUsage({ root, worktrees = [], claudeConfigDir = process.env.CLAUDE_CONFIG_DIR || path.join(homedir(), '.claude'), codexHome = process.env.CODEX_HOME || path.join(homedir(), '.codex'), warn = () => {} }) {
  const roots = [...new Set([root, ...worktrees].filter(Boolean).map((p) => path.resolve(p)))];
  const rows = new Map();
  for (const record of collectClaude({ roots, configDir: claudeConfigDir, warn })) add(rows, record);
  for (const record of collectCodex({ roots, home: codexHome, warn })) add(rows, record);
  return [...rows.values()].sort((a, b) => a.day.localeCompare(b.day) || a.tool.localeCompare(b.tool) || a.model.localeCompare(b.model) || String(a.issue).localeCompare(String(b.issue)));
}
