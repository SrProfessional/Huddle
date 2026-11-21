import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, realpathSync, writeFileSync } from 'node:fs';
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

test('mergedBranchIssues maps the head branch of a merged PR/MR to the Issue its body closes, whatever the merge commit says', () => {
  const map = mergedBranchIssues([
    { number: 12, body: 'Closes #104', head: 'h104-x' },
    { number: 13, body: 'Resolves #105', head: 'feature/105' },
    { number: 194, body: 'Closes #1', head: 'staging' }, // a release: its head is the staging branch, not an Issue's branch
    { number: 14, body: 'Closes #106', head: null },
    { number: 15, body: 'no link', head: 'h107-z' },
    { number: 11, body: 'Closes #99', head: 'h104-x' }, // older: the newest review of a branch wins
  ], { project: 'SrProfessional/Huddle', skip: ['staging', 'main'] });
  assert.deepEqual([...map], [['h104-x', 104], ['feature/105', 105]]);
});

const usageRun = async ({ reviews, dirs, git = () => { throw new Error('no local commit'); } }) => {
  const { run } = await import('../../lib/cli/run.mjs');
  const { CONFIG, harness } = await import('../cli/harness.mjs');
  const { root, claude, codex } = dirs;
  const h = harness({ config: { ...CONFIG, staging_branch: 'staging' } });
  for (const r of reviews) h.world.review(r);
  h.ctx.root = root;
  h.ctx.readFile = () => JSON.stringify({ ...CONFIG, staging_branch: 'staging' });
  h.ctx.git = (args) => (args[0] === 'worktree' ? ['worktree ' + root, 'HEAD a', 'branch refs/heads/main', '', ''].join('\0') : git(args));
  h.ctx.collectUsage = (options) => collectUsage({ ...options, claudeConfigDir: claude, codexHome: codex });
  assert.equal(await run(['usage', '--json'], h.ctx), 0);
  return JSON.parse(h.text()).rows.map((r) => r.issue).sort();
};

test('huddle usage attributes a removed worktree to the Issue of its merged PR; the default branch stays «no Issue»', async () => {
  const dirs = setup();
  put(dirs.claude, path.join(dirs.root, '.claude', 'worktrees', 'h104-x'), [claudeLine('h104-x')]);
  put(dirs.claude, dirs.root, [claudeLine('main')]);
  // The merge commit is not local and a custom subject would not name the branch: the PR's own head branch is what counts.
  const rows = await usageRun({ dirs, reviews: [{ number: 12, branch: 'h104-x', base: 'staging', merged: true, body: 'Closes #104' }] });
  assert.deepEqual(rows, [104, 'no Issue']);
});

test('a merged PR older than the first 200 is still found, by asking for its head branch', async () => {
  const dirs = setup();
  put(dirs.claude, path.join(dirs.root, '.claude', 'worktrees', 'h1-old'), [claudeLine('h1-old')]);
  const reviews = [{ number: 1, branch: 'h1-old', base: 'staging', merged: true, body: 'Closes #1' }];
  for (let n = 2; n < 260; n++) reviews.push({ number: n, branch: `h${n}-x`, base: 'staging', merged: true, body: `Closes #${n}` });
  assert.deepEqual(await usageRun({ dirs, reviews }), [1]);
});

test('a Codex session records its branch: it wins over the folder name, and the folder is the fallback', async () => {
  const { root, claude, codex } = setup();
  const meta = (cwd, git) => JSON.stringify({ type: 'session_meta', payload: { cwd, model: 'gpt-5', ...(git ? { git: { branch: git } } : {}) } });
  const token = (input) => JSON.stringify({ type: 'event_msg', timestamp: '2026-11-20T12:00:00Z', payload: { type: 'token_count', info: { last_token_usage: { input_tokens: input, output_tokens: 1 } } } });
  const wt = (name) => path.join(root, '.claude', 'worktrees', name).replaceAll('\\', '/');
  mkdirSync(path.join(codex, 'sessions'), { recursive: true });
  writeFileSync(path.join(codex, 'sessions', 'a.jsonl'), [meta(wt('alias'), 'feature/104'), token(3)].join('\n'));
  writeFileSync(path.join(codex, 'sessions', 'b.jsonl'), [meta(wt('h105-y')), token(5)].join('\n'));
  const seen = [];
  await collectUsage({ root, claudeConfigDir: claude, codexHome: codex, issueForBranch: async (b) => { seen.push(b); return null; } });
  assert.deepEqual(seen.sort(), ['feature/104', 'h105-y']);
});

test('a sibling folder that shares the encoded name of a worktree is not read when its own cwd says so', async () => {
  const { dir, root, claude, codex } = setup();
  const sibling = `${root}--claude-worktrees-foreign`;
  put(claude, path.join(root, '.claude', 'worktrees', 'foreign'), [claudeLine('h9-f', { cwd: sibling })]);
  const rows = await collectUsage({ root, claudeConfigDir: claude, codexHome: codex, issueForBranch: async () => 9 });
  assert.deepEqual(rows, [], 'the line says its cwd is the sibling');
  // And the same folder with the line saying it is a worktree of this checkout counts.
  put(claude, path.join(root, '.claude', 'worktrees', 'foreign'), [claudeLine('h9-f', { cwd: path.join(root, '.claude', 'worktrees', 'foreign') })]);
  assert.equal((await collectUsage({ root, claudeConfigDir: claude, codexHome: codex, issueForBranch: async () => 9 })).length, 1);
  assert.ok(dir);
});

test('a Codex session in a sibling of the checkout, or in a case variant that is another folder, is not a worktree of it', async () => {
  const { dir, root, claude, codex } = setup();
  mkdirSync(path.join(root, '.claude', 'worktrees'), { recursive: true });
  const write = (name, cwd) => {
    mkdirSync(path.join(codex, 'sessions'), { recursive: true });
    writeFileSync(path.join(codex, 'sessions', `${name}.jsonl`), [
      JSON.stringify({ type: 'session_meta', payload: { cwd, model: 'gpt-5' } }),
      JSON.stringify({ type: 'event_msg', timestamp: '2026-11-20T12:00:00Z', payload: { type: 'token_count', info: { last_token_usage: { input_tokens: 4, output_tokens: 1 } } } }),
    ].join('\n'));
  };
  write('sibling', path.join(`${root}--claude-worktrees-foreign`, 'x').replaceAll('\\', '/'));
  const variant = path.join(dir, 'REPO', '.claude', 'worktrees', 'h1-a').replaceAll('\\', '/');
  write('variant', variant);
  const sameFolder = (() => { try { return realpathSync.native(path.join(dir, 'REPO')) === realpathSync.native(root); } catch { return false; } })();
  const rows = await collectUsage({ root, claudeConfigDir: claude, codexHome: codex, issueForBranch: async () => 1 });
  assert.equal(rows.reduce((n, r) => n + r.input, 0), sameFolder ? 4 : 0, 'a case variant counts only where the filesystem says it is the same folder');
});
