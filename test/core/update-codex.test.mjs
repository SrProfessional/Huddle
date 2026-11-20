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
