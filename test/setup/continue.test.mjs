// Issue #83, docs/design.md §18: `/huddle-continue <n>` picks an Issue up again after the AI Manager answered; `/huddle-start <n>` only starts.
// The skills are text the session follows, so they are tested as text.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (rel) => readFileSync(new URL(`../../${rel}`, import.meta.url), 'utf8');
const flat = (rel) => read(rel).replace(/\s+/g, ' ');
const CONTINUE = 'skills/huddle-continue/SKILL.md';
const HUDDLE = 'node "${CLAUDE_PLUGIN_ROOT}/bin/huddle"';

test('the continue skill has a name, says when to use it, and is short', () => {
  const text = read(CONTINUE);
  const fm = Object.fromEntries(text.match(/^---\r?\n([\s\S]*?)\r?\n---/)[1].split(/\r?\n/).map((l) => [l.slice(0, l.indexOf(':')), l.slice(l.indexOf(':') + 1).trim()]));
  assert.equal(fm.name, 'huddle-continue');
  assert.match(fm.description, /^Use when /);
  assert.ok(text.split('\n').length <= 90, 'keep it short');
});

test('it is for an Issue already started: no branch means /huddle-start, and nothing is changed', () => {
  const t = flat(CONTINUE);
  assert.match(t, /never started|not started/i);
  assert.match(t, /\/huddle-start <n>/);
  assert.match(t, /origin\/<branch>/);
});

test('it enters the Issue worktree, and makes it again from the branch when the folder is gone', () => {
  const t = flat(CONTINUE);
  assert.match(t, /\.claude\/worktrees\/<branch>/);
  assert.match(t, /without `-b`/);
  assert.match(t, /EnterWorktree/);
});

test('it runs pending, then take, with the full command, and never asks the developer to paste a prompt', () => {
  const t = flat(CONTINUE);
  const pending = t.indexOf(`${HUDDLE} pending <n>`);
  const take = t.indexOf(`${HUDDLE} take <n>`);
  assert.ok(pending >= 0 && take > pending, 'pending first, then take');
  assert.match(t, /not asked to paste|never ask[^.]*paste|do not ask[^.]*paste/i);
  assert.match(t, /nothing (is )?pending/i);
});

test('only the ai_manager login counts, a push is followed by «Ready for review again», the labels are not touched, and it waits again', () => {
  const t = flat(CONTINUE);
  assert.match(t, /`ai_manager`/);
  assert.match(t, /Ready for review again/);
  assert.match(t, /changes requested from AI Manager/);
  assert.match(t, /do not touch|never touch/i);
  assert.ok(t.includes(`${HUDDLE} wait <n>`));
});

test('it closes with the usual message and has «Who does each step»', () => {
  const t = flat(CONTINUE);
  assert.match(t, /✅ Issue #N finished/);
  assert.match(t, /⛔ Issue #N stopped/);
  assert.match(read(CONTINUE), /^## Who does each step/m);
});

test('/huddle-start only starts: its Continue section points to /huddle-continue, and an already started Issue is continued anyway', () => {
  const start = read('skills/huddle-start/SKILL.md');
  assert.match(start, /\/huddle-continue/);
  const t = start.replace(/\s+/g, ' ');
  assert.match(t, /already (started|has a branch)/i);
  assert.match(t, /old prompts|continue it anyway|continues it anyway/i);
  assert.doesNotMatch(start, /^## Continue \(`\/huddle-start`/m, 'the old Continue section moved to /huddle-continue');
  assert.ok(start.split('\n').length <= 90);
});

test('the AI Manager prompts start with /huddle-continue <n>', () => {
  for (const name of ['huddle-review', 'huddle-decide']) {
    const t = read(`skills/${name}/SKILL.md`);
    assert.match(t, /^First run \/huddle-continue <n>: it marks this request as taken \(👀\), so the Issue shows «in progress»\./m, name);
    assert.doesNotMatch(t, /First run \/huddle-start/, name);
  }
});
