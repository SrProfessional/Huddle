import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { collectUsage, projectFolder, mergedBranchIssues } from '../../lib/usage/index.mjs';

const claudeLine = (branch, extra = {}) => JSON.stringify({
  type: 'assistant', requestId: `r-${branch}-${Math.random()}`, timestamp: '2026-11-20T10:00:00Z', ...(branch ? { gitBranch: branch } : {}),
  message: { model: 'claude-sonnet-4-5', usage: { input_tokens: 10, output_tokens: 1 } }, ...extra,
});

const setup = () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'huddle-attr-'));
  const root = path.join(dir, 'repo');
  return { dir, root, claude: path.join(dir, 'claude'), codex: path.join(dir, 'codex') };
};

const put = (claude, folderOf, lines) => {
  const project = path.join(claude, 'projects', projectFolder(folderOf));
  mkdirSync(project, { recursive: true });
  writeFileSync(path.join(project, 's.jsonl'), lines.join('\n'));
};

test('a Claude Code transcript of a removed worktree is attributed to the Issue its branch closed', async () => {
  const { root, claude, codex } = setup();
  const gone = path.join(root, '.claude', 'worktrees', 'h104-x'); // not in `git worktree list`: it was removed
  put(claude, gone, [claudeLine('h104-x')]);
  put(claude, root, [claudeLine('main')]);
  const rows = await collectUsage({
    root, worktrees: [], claudeConfigDir: claude, codexHome: codex,
    issueForBranch: async (branch) => (branch === 'h104-x' ? 104 : null),
  });
  assert.deepEqual(rows.map((r) => [r.issue, r.input]).sort(), [[104, 10], ['no Issue', 10]]);
});

test('a removed worktree folder names its branch when the transcript carries none', async () => {
  const { root, claude, codex } = setup();
  put(claude, path.join(root, '.claude', 'worktrees', 'h104-x'), [claudeLine(null)]);
  const seen = [];
  const rows = await collectUsage({ root, claudeConfigDir: claude, codexHome: codex, issueForBranch: async (b) => { seen.push(b); return 104; } });
  assert.deepEqual(seen, ['h104-x']);
  assert.equal(rows[0].issue, 104);
});

test('a project folder that only shares a name prefix with the checkout is not read', async () => {
  const { root, claude, codex } = setup();
  put(claude, `${root}2`, [claudeLine('h104-x')]);
  put(claude, path.join(`${root}2`, '.claude', 'worktrees', 'h104-x'), [claudeLine('h104-x')]);
  const rows = await collectUsage({ root, claudeConfigDir: claude, codexHome: codex, issueForBranch: async () => 104 });
  assert.deepEqual(rows, []);
});

test('a Codex session of a removed worktree is attributed by the folder name', async () => {
  const { root, claude, codex } = setup();
  const gone = path.join(root, '.claude', 'worktrees', 'h104-x').replaceAll('\\', '/');
  mkdirSync(path.join(codex, 'sessions'), { recursive: true });
  writeFileSync(path.join(codex, 'sessions', 's.jsonl'), [
    JSON.stringify({ type: 'session_meta', payload: { cwd: gone, model: 'gpt-5' } }),
    JSON.stringify({ type: 'event_msg', timestamp: '2026-11-20T12:00:00Z', payload: { type: 'token_count', info: { last_token_usage: { input_tokens: 7, output_tokens: 1 } } } }),
  ].join('\n'));
  const rows = await collectUsage({ root, claudeConfigDir: claude, codexHome: codex, issueForBranch: async (b) => (b === 'h104-x' ? 104 : null) });
  assert.deepEqual(rows.map((r) => [r.tool, r.issue, r.input]), [['Codex', 104, 7]]);
});

test('mergedBranchIssues maps the head branch of a merged PR/MR to the Issue its body closes', () => {
  const subjects = {
    a: 'Merge pull request #12 from SrProfessional/h104-x',
    b: "Merge branch 'h105-y' into 'staging'",
    c: 'Merge pull request #194 from SrProfessional/staging',
  };
  const map = mergedBranchIssues([
    { number: 12, body: 'Closes #104', mergeSha: 'a' },
    { number: 13, body: 'Resolves #105', mergeSha: 'b' },
    { number: 194, body: 'Closes #1', mergeSha: 'c' }, // a release: its head is the staging branch, not an Issue's branch
    { number: 14, body: 'Closes #106', mergeSha: null },
    { number: 15, body: 'no link', mergeSha: 'a' },
  ], { subjectOf: (sha) => subjects[sha] ?? '', project: 'SrProfessional/Huddle', skip: ['staging', 'main'] });
  assert.deepEqual([...map], [['h104-x', 104], ['h105-y', 105]]);
});

test('huddle usage attributes a removed worktree to the Issue of its merged PR; the default branch stays «no Issue»', async () => {
  const { run } = await import('../../lib/cli/run.mjs');
  const { CONFIG, harness } = await import('../cli/harness.mjs');
  const { root, claude, codex } = setup();
  put(claude, path.join(root, '.claude', 'worktrees', 'h104-x'), [claudeLine('h104-x')]);
  put(claude, root, [claudeLine('main')]);
  const h = harness({ config: { ...CONFIG, staging_branch: 'staging' } });
  h.world.review({ number: 12, branch: 'h104-x', base: 'staging', merged: true, body: 'Closes #104', mergedAt: '2026-11-20T00:00:00Z' });
  h.ctx.root = root;
  h.ctx.readFile = () => JSON.stringify({ ...CONFIG, staging_branch: 'staging' });
  h.ctx.git = (args) => (args[0] === 'log' ? 'Merge pull request #12 from SrProfessional/h104-x\n' : ['worktree ' + root, 'HEAD a', 'branch refs/heads/main', '', ''].join('\0'));
  h.ctx.collectUsage = (options) => collectUsage({ ...options, claudeConfigDir: claude, codexHome: codex });
  assert.equal(await run(['usage', '--json'], h.ctx), 0);
  assert.deepEqual(JSON.parse(h.text()).rows.map((r) => r.issue).sort(), [104, 'no Issue']);
});
