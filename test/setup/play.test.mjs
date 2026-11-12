// Issue #100, docs/design.md §18: `/huddle-play <n>` is the one command that starts or continues an Issue.
// It replaces /huddle-start and /huddle-continue, which no longer exist. The skills are text the session follows, so they are tested as text.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (rel) => readFileSync(path.join(root, rel), 'utf8');
const flat = (rel) => read(rel).replace(/\s+/g, ' ');
const PLAY = 'skills/huddle-play/SKILL.md';
const HUDDLE = 'node "${CLAUDE_PLUGIN_ROOT}/bin/huddle"';

test('the play skill has its name, says when to use it, and the old skills are gone', () => {
  assert.ok(existsSync(path.join(root, PLAY)));
  const text = read(PLAY);
  const fm = Object.fromEntries(text.match(/^---\r?\n([\s\S]*?)\r?\n---/)[1].split(/\r?\n/).map((l) => [l.slice(0, l.indexOf(':')), l.slice(l.indexOf(':') + 1).trim()]));
  assert.equal(fm.name, 'huddle-play');
  assert.match(fm.description, /^Use when /);
  assert.ok(!existsSync(path.join(root, 'skills/huddle-start')), 'skills/huddle-start must not exist');
  assert.ok(!existsSync(path.join(root, 'skills/huddle-continue')), 'skills/huddle-continue must not exist');
});

test('the version notice comes first, in the full form, and before the work', () => {
  const t = read(PLAY);
  assert.ok(t.includes(`${HUDDLE} notice`));
  const at = t.indexOf('## Version notice');
  assert.ok(at > 0 && at < t.search(/\n## (Start|Continue)/), 'notice before both branches');
  const section = t.slice(at);
  assert.match(section, /in (the person's|their) language/i);
  assert.match(section, /first thing/i);
  assert.match(section, /never (stops|asks)/i);
  assert.match(section, /prints nothing[^.]*(say nothing|nothing about versions)/i);
  assert.doesNotMatch(t.split(`${HUDDLE} notice`).join(''), /\bhuddle notice\b/);
});

test('it decides by the branch: no branch starts the Issue, a branch continues it', () => {
  const t = flat(PLAY);
  assert.match(t, /origin\/<branch>/);
  assert.match(t, /never started|not started/i);
  assert.match(read(PLAY), /^## Start an Issue/m);
  assert.match(read(PLAY), /^## Continue an Issue/m);
  assert.match(t, /Depends on/);
  assert.match(t, /Closes #N/);
  assert.match(t, /`in progress`/);
  assert.ok(t.includes(`${HUDDLE} wait <n>`));
});

test('the continue branch enters the worktree, makes it again without -b, runs pending then take, and never asks for a paste', () => {
  const t = flat(PLAY);
  assert.match(t, /\.claude\/worktrees\/<branch>/);
  assert.match(t, /without `-b`/);
  assert.match(t, /EnterWorktree/);
  const pending = t.indexOf(`${HUDDLE} pending <n>`);
  const take = t.indexOf(`${HUDDLE} take <n>`);
  assert.ok(pending >= 0 && take > pending, 'pending first, then take');
  assert.match(t, /nothing (is )?pending/i);
  assert.match(t, /not asked to paste|never ask[^.]*paste|do not ask[^.]*paste/i);
});

test('only the ai_manager login counts, «Ready for review again» follows a push, the labels are not touched', () => {
  const t = flat(PLAY);
  assert.match(t, /`ai_manager`/);
  assert.match(t, /Ready for review again/);
  assert.match(t, /changes requested from AI Manager/);
  assert.match(t, /do not touch|never touch/i);
});

test('the Design flow, «When you cannot go on» and «Who does each step» are there; it closes with the usual message', () => {
  const raw = read(PLAY);
  const t = flat(PLAY);
  assert.match(raw, /^## A Design Issue/m);
  assert.match(t, /Ask me for every change here in the chat/);
  assert.match(t, /no code, no tests/);
  assert.match(raw, /^## When you cannot go on/m);
  assert.match(raw, /^## Who does each step/m);
  assert.match(t, /✅ Issue #N finished/);
  assert.match(t, /⛔ Issue #N stopped/);
  assert.match(t, /needs decision/);
});

test('the play skill does not name the old commands', () => {
  assert.doesNotMatch(read(PLAY), /huddle-start|huddle-continue/);
});

test('the AI Manager prompts start with /huddle-play <n>', () => {
  for (const name of ['huddle-review', 'huddle-decide']) {
    const t = read(`skills/${name}/SKILL.md`);
    assert.match(t, /^First run \/huddle-play <n>: it marks this request as taken \(👀\), so the Issue shows «in progress»\./m, name);
  }
});

// The old names are gone everywhere except the history: CHANGELOG.md and the old «Results» tables of docs/smoke-test.md.
test('no file outside the CHANGELOG and the old smoke-test results names /huddle-start or /huddle-continue', () => {
  const skip = new Set(['.git', 'node_modules', '.claude']);
  const files = [];
  const walk = (dir) => {
    for (const e of readdirSync(dir)) {
      if (skip.has(e)) continue;
      const p = path.join(dir, e);
      if (statSync(p).isDirectory()) walk(p);
      else if (/\.(md|mjs|js|json|html|yml|yaml|txt)$/.test(e)) files.push(p);
    }
  };
  walk(root);
  const OLD = /huddle-start|huddle-continue/;
  const offenders = [];
  for (const f of files) {
    const rel = path.relative(root, f).split(path.sep).join('/');
    if (rel === 'CHANGELOG.md' || rel === 'test/setup/play.test.mjs') continue;
    let text = readFileSync(f, 'utf8');
    if (rel === 'docs/smoke-test.md') text = text.split(/\r?\n/).filter((l) => !(/^\s*\|/.test(l) && OLD.test(l))).join('\n');
    if (OLD.test(text)) offenders.push(rel);
  }
  assert.deepEqual(offenders, []);
});
