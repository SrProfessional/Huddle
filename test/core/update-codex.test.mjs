// Issue #225: updating Huddle works in OpenAI Codex. In a Codex session the notice, doctor and the update skill give Codex's steps
// (codex plugin marketplace upgrade huddle, codex plugin add huddle@huddle, a new chat); Claude Code's text does not change.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { updateSteps, noticeText, versionCheck } from '../../lib/core/update.mjs';

const CODEX = /codex plugin marketplace upgrade huddle\n?\s*codex plugin add huddle@huddle/;

test('updateSteps: Codex\'s steps in Codex, Claude Code\'s otherwise', () => {
  const codex = updateSteps(false, 'project', true);
  assert.match(codex, CODEX);
  assert.match(codex, /open a new Codex chat/);
  assert.doesNotMatch(codex, /claude plugin|\/reload-plugins/);
  assert.match(updateSteps(false, 'project'), /claude plugin marketplace update huddle/);
});

test('the notice carries Codex\'s steps in a Codex session', () => {
  assert.match(noticeText({ latest: '0.9.6', installed: '0.9.5', clone: false, manager: false, codex: true }), CODEX);
});

test('doctor\'s version line gives Codex\'s steps in a Codex session', async () => {
  const files = new Map([['/plugin/.claude-plugin/plugin.json', JSON.stringify({ version: '0.9.5' })], ['/cache/huddle-update.json', JSON.stringify({ latest: '0.9.6', checkedAt: Date.now() })]]);
  const ctx = {
    pluginRoot: '/plugin', pluginInstalled: true, session: { tool: 'codex', id: 'T1' }, updateCachePath: '/cache/huddle-update.json',
    readFile: (p) => files.get(p) ?? null, writeFile: (p, t) => files.set(p, t), now: () => new Date(), fetch: async () => ({ ok: true, json: async () => ({ tag_name: 'v0.9.6' }) }),
  };
  const line = await versionCheck(ctx);
  assert.equal(line.mark, '⚠');
  assert.match(line.detail, /codex plugin marketplace upgrade huddle/);
  assert.doesNotMatch(line.detail, /claude plugin/);
});

const read = (rel) => readFileSync(fileURLToPath(new URL(`../../${rel}`, import.meta.url)), 'utf8').replace(/\s+/g, ' ');
for (const name of ['huddle-update', 'huddle-setup']) {
  test(`${name} has its Codex note`, () => {
    assert.match(read(`skills/${name}/SKILL.md`), /\*\*In OpenAI Codex\*\* \(Issue #225\): instead of `claude plugin …`, run `codex plugin marketplace upgrade huddle` and `codex plugin add huddle@huddle`; instead of `\/reload-plugins`, open a new Codex chat; make the worktree with `git worktree add` instead of `EnterWorktree`/);
  });
}

test('a Codex clone is told to pull and open a new Codex chat, not to restart Claude Code (review of PR #226)', () => {
  const t = updateSteps(true, 'project', true);
  assert.match(t, /git pull/);
  assert.match(t, /open a new Codex chat/);
  assert.doesNotMatch(t, /restart Claude Code/);
  assert.match(updateSteps(true, 'project'), /restart Claude Code/, 'Claude Code keeps its text');
  assert.match(updateSteps(false, 'project', true), /team guide's «A mixed team» steps/);
});

test('huddle-update keeps one shared flow with the Codex differences inside sections 2, 3 and 6 (second review of PR #226)', () => {
  const t = read('skills/huddle-update/SKILL.md');
  // §2: the Codex commands, no scope lookup, the extension's codex on Windows, the new folder from the add.
  assert.match(t, /in Codex: `codex plugin marketplace upgrade huddle`/);
  assert.match(t, /In Codex skip this and step 3 \(Codex has no project scope\): run `codex plugin add huddle@huddle`/);
  assert.match(t, /on Windows, the team guide's PowerShell line/);
  assert.match(t, /«Installed plugin root: <folder>» is the new version's folder/);
  // §3: the same up-to-date default branch, worktree name and reuse, with Codex's folder and no EnterWorktree.
  assert.match(t, /In Codex the new folder is the one `codex plugin add` printed/);
  assert.match(t, /enter it with `EnterWorktree` \(in Codex: work in that folder\)/);
  assert.match(t, /git worktree add \.claude\/worktrees\/huddle-update-<version> -b huddle-update-<version> origin\/<default>/);
  // The shared status handling stays: up to date exits with no PR, a failure stops, questions come before the PR.
  assert.match(t, /\*\*`status` is `up-to-date`\*\*: nothing changed\. Say so, ask for nothing, make no branch or PR/);
  assert.match(t, /If it fails, show its message .* and stop\./);
  assert.match(t, /\*\*`status` is `questions`\*\* \(exit code 3\): it changed \*\*nothing\*\*\. Go to step 4\./);
  // §6: hook trust in terminal Codex and a new chat.
  assert.match(t, /In Codex: if Codex asks, trust the hook again in terminal Codex .* then open a new Codex chat in this repo\./);
  assert.doesNotMatch(t, /codex\.md/);
});

test('the companion file is gone, and no page claims a non-Windows lookup of the extension\'s codex (second review of PR #226)', () => {
  assert.throws(() => read('skills/huddle-update/codex.md'));
  assert.doesNotMatch(read('skills/huddle-setup/SKILL.md'), /other systems/);
});

test('huddle-setup tells a first Codex install from an upgrade, with the trust step (review of PR #226)', () => {
  const t = read('skills/huddle-setup/SKILL.md');
  assert.match(t, /first install in Codex: `codex plugin marketplace add SrProfessional\/Huddle`, then `codex plugin add huddle@huddle`/);
  assert.match(t, /already added: `codex plugin marketplace upgrade huddle`, then `codex plugin add huddle@huddle`/);
  assert.match(t, /trust the hook once in terminal Codex/);
});
