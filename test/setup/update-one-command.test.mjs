import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const skill = readFileSync(fileURLToPath(new URL('../../skills/huddle-update/SKILL.md', import.meta.url)), 'utf8');
const at = (re) => { const m = re.exec(skill); assert.ok(m, `the skill does not say ${re}`); return m.index; };

test('the skill has the six steps, in order', () => {
  const order = [/## 1\. .*notice/i, /## 2\. .*plugin/i, /## 3\. .*files/i, /## 4\. .*questions/i, /## 5\. .*PR/i, /## 6\. .*last line/i];
  const idx = order.map(at);
  assert.deepEqual([...idx].sort((a, b) => a - b), idx);
});

test('step 2 names both claude plugin commands and what to do when claude cannot be run', () => {
  assert.match(skill, /claude plugin marketplace update huddle/);
  assert.match(skill, /claude plugin update huddle@huddle --scope project/);
  assert.match(skill, /cannot be run|not found|fails/i);
  assert.match(skill, /\/plugins/);
  assert.match(skill, /run `\/huddle-update` again/);
});

test('step 3 makes its own worktree and branch from the default branch and runs the NEW folder\'s huddle update', () => {
  assert.match(skill, /git worktree add \.claude\/worktrees\/huddle-update-<version> -b huddle-update-<version> origin\/<default>/);
  assert.match(skill, /EnterWorktree/);
  assert.match(skill, /node "<new folder>\/bin\/huddle" update --json/);
  assert.match(skill, /newPluginRoot|sibling of `\$\{CLAUDE_PLUGIN_ROOT\}`/);
  assert.match(skill, /never changes? branch|does not change branch/i);
});

test('step 5 opens the PR; a Player\'s session never merges, the Coach\'s merges it without asking (Issue #147)', () => {
  const step5 = skill.slice(skill.indexOf('## 5.'), skill.indexOf('## 6.'));
  assert.match(step5, /open the PR\/MR/i);
  assert.match(step5, /A Player's session never merges/);
  assert.match(step5, /Coach's session .*merges it itself, without asking/);
  assert.match(step5, /gh pr merge --merge/);
  assert.match(step5, /refused .* stop and say so, never look for another way/);
  assert.doesNotMatch(step5, /does not merge it either/);
});

test('step 6 ends with /reload-plugins, the restart fallback and both ways to restart', () => {
  assert.match(skill, /\/reload-plugins/);
  assert.match(skill, /restart Claude Code/i);
  assert.match(skill, /Player: Reload Window/);
  assert.match(skill, /close `claude` and open it again/);
  assert.doesNotMatch(skill, /applies (right away|by itself)/i);
});

test('the skill never tells the person to open a new session after updating', () => {
  assert.doesNotMatch(skill, /new session/i);
});
