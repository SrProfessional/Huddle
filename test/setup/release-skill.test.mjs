// docs/design.md §21 (H49): `/huddle-release` walks the AI Manager through a release from staging to the default branch. The skill is text the session follows, so it is tested as text.
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

const read = (rel) => readFileSync(new URL(`../../${rel}`, import.meta.url), 'utf8');
const flat = (rel) => read(rel).replace(/\s+/g, ' ');
const SKILL = 'skills/huddle-release/SKILL.md';
const HUDDLE = 'node "${CLAUDE_PLUGIN_ROOT}/bin/huddle"';

test('the skill exists, has a name, says when to use it, and is short', () => {
  assert.ok(existsSync(new URL(`../../${SKILL}`, import.meta.url)));
  const text = read(SKILL);
  const fm = Object.fromEntries(text.match(/^---\r?\n([\s\S]*?)\r?\n---/)[1].split(/\r?\n/).map((l) => [l.slice(0, l.indexOf(':')), l.slice(l.indexOf(':') + 1).trim()]));
  assert.equal(fm.name, 'huddle-release');
  assert.match(fm.description, /^Use when /);
  assert.match(fm.description, /staging/);
  assert.ok(text.split('\n').length <= 90, 'keep it short');
});

test('it is for the AI Manager only: doctor first, a stop for anyone else, and it never merges when it is not that session', () => {
  const t = flat(SKILL);
  assert.match(t, /For the AI Manager only/);
  assert.ok(t.indexOf(`${HUDDLE} doctor`) > 0);
  assert.match(t, /`ai_manager`/);
  assert.match(t, /stop with one clear line/i);
  assert.match(t, /never merge/i);
  assert.match(t, /no `staging_branch`|`staging_branch` is not set|no staging branch/i, 'a project without staging has nothing to release this way');
});

test('the steps come in order: list, ask for each untested Issue, the clean check, show the list, open, merge', () => {
  const t = flat(SKILL);
  const at = [
    t.indexOf(`${HUDDLE} release --json`),
    t.indexOf(`${HUDDLE} tested <n>`),
    t.indexOf('clean check on staging'),
    t.indexOf('wait for the AI Manager\'s OK'),
    t.indexOf(`${HUDDLE} release open`),
    t.indexOf('merge commit'),
  ];
  assert.ok(at.every((i) => i > 0), `a step is missing: ${at}`);
  assert.deepEqual([...at].sort((a, b) => a - b), at, 'in this order');
});

test('it shows the two warnings, and with the default branch ahead the back-merge comes first and it stops', () => {
  const t = flat(SKILL);
  assert.match(t, /default branch is ahead of staging/i);
  assert.match(t, /back-merge/i);
  assert.match(t, /offer to open that PR/i);
  assert.match(t, /stop until it is merged/i);
  assert.match(t, /commits that belong to no listed Issue/i);
});

test('it asks before `huddle tested`, and releases an untested Issue only with the AI Manager\'s own reason', () => {
  const t = flat(SKILL);
  assert.match(t, /has it been tested in staging\?/i);
  assert.ok(t.indexOf('has it been tested in staging?') < t.indexOf(`${HUDDLE} tested <n>`), 'the question comes before the command');
  assert.match(t, /only on a yes/i);
  assert.match(t, /--untested <n> --reason/);
  assert.match(t, /only if the AI Manager gives the reason/i);
  assert.match(t, /never (make up|invent) a reason|never write a reason yourself/i);
});

test('the clean check is the one the project documents in CLAUDE.md: a fresh worktree of origin/<staging>, a clean install, the test command; it asks and never invents one; a failing suite stops the release', () => {
  const t = flat(SKILL);
  assert.match(t, /documents in its `CLAUDE\.md`/);
  assert.match(t, /fresh worktree of `origin\/<staging>`/);
  assert.match(t, /clean install/);
  assert.match(t, /test command/);
  assert.match(t, /ask the AI Manager how it is run/i);
  assert.match(t, /never invent it/i);
  assert.match(t, /failing suite stops the release/i);
  assert.match(t, /with the output/i);
});

test('it merges the release PR with a merge commit only when the AI Manager says so in the same chat, never squash or rebase', () => {
  const t = flat(SKILL);
  assert.match(t, /only when the AI Manager says so in the same chat/i);
  assert.match(t, /never squash or rebase/i);
  assert.match(t, /report the link and what went out/i);
});

test('it uses the full command form and ends with «Who does each step»', () => {
  const text = read(SKILL);
  assert.ok(text.includes(HUDDLE));
  assert.match(text, /## Who does each step/);
  assert.match(text, /🙋 Only you/);
});
