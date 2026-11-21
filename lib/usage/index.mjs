import { homedir } from 'node:os';
import path from 'node:path';
import { collectClaude, projectFolder } from './claude.mjs';
import { collectCodex } from './codex.mjs';
import { closesIn } from '../core/closes.mjs';

export { projectFolder };

const add = (rows, record, issue) => {
  const key = [record.day, record.tool, record.model, issue].join('\0');
  const row = rows.get(key) ?? { day: record.day, tool: record.tool, model: record.model, issue, input: 0, output: 0, cacheRead: 0, cacheWrite: 0, reasoning: 0 };
  for (const field of ['input', 'output', 'cacheRead', 'cacheWrite', 'reasoning']) row[field] += Number(record[field]) || 0;
  rows.set(key, row);
};

/** Collects local token accounting. Transcript contents never leave this function. */
export async function collectUsage({ root, worktrees = [], checkoutBranches = new Map(), issueForBranch = async () => null, claudeConfigDir = process.env.CLAUDE_CONFIG_DIR || path.join(homedir(), '.claude'), codexHome = process.env.CODEX_HOME || path.join(homedir(), '.codex'), warn = () => {} }) {
  const roots = [...new Set([root, ...worktrees].filter(Boolean).map((p) => path.resolve(p)))];
  const rows = new Map();
  const records = [
    ...collectClaude({ roots, configDir: claudeConfigDir, warn }),
    ...collectCodex({ roots, checkoutBranches, home: codexHome, warn }),
  ];
  const issues = new Map();
  for (const record of records) {
    const { branch } = record;
    if (branch && !issues.has(branch)) issues.set(branch, await issueForBranch(branch));
    add(rows, record, issues.get(branch) ?? 'no Issue');
  }
  return [...rows.values()].sort((a, b) => a.day.localeCompare(b.day) || a.tool.localeCompare(b.tool) || a.model.localeCompare(b.model) || String(a.issue).localeCompare(String(b.issue)));
}

/**
 * Issue #266: branch -> Issue for PRs/MRs that are already merged, which `issueForBranch` (open ones only) cannot see. `reviews` are the adapter's
 * `mergedReviews`, newest first, each with its own source branch (`head`), so no merge commit has to be local or have a particular subject. A branch
 * in `skip` (staging, the default branch: release merges) names no Issue. The first review of a branch (the newest) wins.
 */
export function mergedBranchIssues(reviews, { project, skip = [] }) {
  const map = new Map();
  for (const review of reviews) {
    const branch = review.head;
    const issue = closesIn(review.body, project)[0];
    if (branch && issue && !skip.includes(branch) && !map.has(branch)) map.set(branch, issue);
  }
  return map;
}
