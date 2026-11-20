// Issue #214: the docs say the Coach can work in OpenAI Codex too (#211-#213), with what still needs Claude Code (design work), and one
// watch per repo whatever the tool.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const read = (rel) => readFileSync(fileURLToPath(new URL(`../../${rel}`, import.meta.url)), 'utf8').replace(/\s+/g, ' ');

test('the team guide: the Coach works in Codex or Claude Code, one watch per repo, design work still in Claude Code', () => {
  const t = read('docs/team-guide.md');
  assert.match(t, /\| The Coach \| Claude Code or Codex \|/);
  assert.match(t, /One watch per repo:/);
  assert.match(t, /\*\*What stays in Claude Code:\*\* Design Issues and the review of a design PR/);
  assert.doesNotMatch(t, /A Codex session never reviews or merges/);
  assert.doesNotMatch(t, /What stays in Claude Code in this release:\*\* the Coach's skills/);
});

test('the README says the Coach can work in Codex too', () => {
  assert.match(read('README.md'), /The Coach can work in Codex too/);
});

test('the README heading no longer says «for Players», and §25 records the live Coach run of 2026-11-20 (review round of #214)', () => {
  const r = read('README.md');
  assert.match(r, /### In OpenAI Codex /);
  assert.doesNotMatch(r, /In OpenAI Codex \(for Players\)/);
  const d = read('docs/design.md');
  assert.match(d, /\*\*The Coach in Codex, end to end \(Issue #214\)\.\*\* On 2026-11-20/);
  assert.match(d, /Claude Code did not start a second watch/);
  assert.match(d, /the Codex review asked for a change/);
});
