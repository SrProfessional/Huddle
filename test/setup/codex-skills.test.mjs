// Issue #201: /huddle-play works in OpenAI Codex; the Coach's skills and Design Issues stay in Claude Code. The skills are what the
// session follows, so they are tested as text.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const read = (rel) => readFileSync(fileURLToPath(new URL(`../../${rel}`, import.meta.url)), 'utf8').replace(/\s+/g, ' ');
const COACH = ['decide', 'review', 'release', 'issue', 'bug', 'areas', 'team']; // the watch works in Codex since Issue #212

test('the play skill says how to work in Codex: the command the session start named, and a plain worktree', () => {
  const t = read('skills/huddle-play/SKILL.md');
  assert.match(t, /In OpenAI Codex \(the session start said «Huddle \(OpenAI Codex\)»\)/);
  assert.match(t, /the `huddle` command it named wherever this skill writes `node "\$\{CLAUDE_PLUGIN_ROOT\}\/bin\/huddle"`/);
  assert.match(t, /`git worktree add`/);
  assert.match(t, /instead of `EnterWorktree`/);
});

test('in Codex the play skill never reviews or merges, even on the Coach\'s login, and says how the wait goes', () => {
  const t = read('skills/huddle-play/SKILL.md');
  assert.match(t, /never review or merge in Codex, even on the Coach's login: the Coach's Claude Code session does it/);
  assert.match(t, /every background wait is `node "\$\{CLAUDE_PLUGIN_ROOT\}\/bin\/huddle" wait <n> --codex`/);
  assert.match(t, /sends this session a message to run `\$huddle-play <n>`/);
});

test('in Codex a Design Issue stops with one clear line: it is done in Claude Code', () => {
  assert.match(read('skills/huddle-play/SKILL.md'), /«⛔ Issue #N stopped: this Issue is done in Claude Code \(it needs Claude Design\)»/);
});

for (const name of COACH) {
  test(`huddle-${name} stops in Codex: the Coach works in Claude Code`, () => {
    assert.match(read(`skills/huddle-${name}/SKILL.md`), new RegExp(`In OpenAI Codex, stop with one line: «/huddle-${name} runs in Claude Code, where the Coach works\\.»`));
  });
}

test('in Codex the play skill runs the commands that reach the platform with network access (Issue #202)', () => {
  assert.match(read('skills/huddle-play/SKILL.md'), /with network access \(approve it when Codex asks\)/);
});

test('the watch skill runs in Codex with the --codex wait, and stops when another session holds the watch (Issue #212)', () => {
  const t = read('skills/huddle-watch/SKILL.md');
  assert.match(t, /queue --wait <seconds> \[--seen <keys>\] --codex/);
  assert.match(t, /already runs in another session, say so in one line and stop/);
  assert.doesNotMatch(t, /huddle-watch runs in Claude Code, where the Coach works/);
});
