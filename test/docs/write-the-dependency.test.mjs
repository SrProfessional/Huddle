// Issue #298: a stop «waiting for #X» writes `- #X` in the Issue's «Depends on», so Huddle can park the Issue.
// The skills are what a session follows, so they are tested as text. No real GitHub or GitLab is called.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const read = (rel) => readFileSync(fileURLToPath(new URL(`../../${rel}`, import.meta.url)), 'utf8').replace(/\s+/g, ' ');
const section = (text, from, to) => {
  const a = text.indexOf(from);
  assert.ok(a >= 0, `missing: ${from}`);
  const b = text.indexOf(to, a + from.length);
  return text.slice(a, b < 0 ? undefined : b);
};

test('the play skill: a stop for a dependency writes `- #X` in «Depends on», comments, then runs labels', () => {
  const t = section(read('skills/huddle-play/SKILL.md'), '## A stop for a dependency', '## ');
  assert.match(t, /waiting for #X/);
  assert.match(t, /`- #X`/);
  assert.match(t, /«Depends on»/);
  assert.match(t, /`- None`/);
  assert.match(t, /--body-file/);
  assert.match(t, /comment/i);
  assert.match(t, /labels --issue <n>/);
  assert.ok(t.indexOf('`- #X`') < t.indexOf('labels --issue <n>'));
});

test('the play skill: an open PR/MR becomes a draft and the last message says so', () => {
  const t = read('skills/huddle-play/SKILL.md');
  assert.match(t, /gh pr ready --undo/);
  assert.match(t, /draft/i);
  assert.match(t, /say so in your last message/);
});

test('the play skill: «Start an Issue» step 2 and «While you work» point to that rule; a merged dependency edits nothing', () => {
  const t = read('skills/huddle-play/SKILL.md');
  assert.match(section(t, '2. Check each Issue under «Depends on»', '3. Create the branch'), /A stop for a dependency/);
  assert.match(t, /nothing is edited/i);
});

test('the parallel guide: the main session checks the stopped Issue names its dependency, and writes it if not', () => {
  const t = read('skills/huddle-play/parallel.md');
  const s = section(t, '- **It stopped for a dependency**', '- **It stopped for anything else**');
  assert.match(s, /dependency/);
  assert.match(s, /«Depends on»/);
  assert.match(s, /`- #X`/);
  assert.match(s, /yourself/);
});

test('the parallel subagent prompt names the dependency rule', () => {
  assert.match(read('skills/huddle-play/parallel.md'), /A stop for a dependency/);
});

test('design §18 and §24 and the CHANGELOG say it', () => {
  const d = read('docs/design.md');
  assert.match(section(d, '## 18. One command', '## 19.'), /Issue #298/);
  assert.match(section(d, '## 24. The effort', '## 25.'), /Issue #298/);
  for (const s of [section(d, '## 18. One command', '## 19.'), section(d, '## 24. The effort', '## 25.')]) {
    assert.match(s, /`- #X`/);
  }
  assert.match(section(read('CHANGELOG.md'), '## [Unreleased]', '## [1.0.2]'), /Issue #298/);
});
