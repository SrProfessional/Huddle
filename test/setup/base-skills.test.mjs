// Issue #235: Huddle ships only five adapted MIT-licensed superpowers skills.
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (rel) => readFileSync(path.join(root, rel), 'utf8');
const chosen = [
  'huddle-tdd',
  'huddle-debug',
  'huddle-verify',
  'huddle-answer-review',
  'huddle-brainstorm',
];

test('the five Huddle base skills have metadata, a Codex note, and never authorize a merge', () => {
  for (const name of chosen) {
    const rel = `skills/${name}/SKILL.md`;
    assert.ok(existsSync(path.join(root, rel)), `${name} exists`);
    const text = read(rel);
    assert.match(text, new RegExp(`^---\\r?\\nname: ${name}\\r?\\ndescription: Use `), name);
    assert.match(text, /In OpenAI Codex/i, `${name} has a Codex note`);
    assert.match(text, /never merge/i, `${name} preserves the Player rule`);
  }
});

test('brainstorming is Coach-only and creates an Issue instead of a local spec', () => {
  const text = read('skills/huddle-brainstorm/SKILL.md');
  assert.match(text, /Player.*stop/i);
  assert.match(text, /Coach/i);
  assert.match(text, /\/huddle-issue/);
  assert.match(text, /do not create a local spec under `docs\/superpowers`/i);
});

test('the attribution keeps the MIT notice and locks the upstream revision', () => {
  const text = read('skills/THIRD-PARTY.md');
  assert.match(text, /MIT License/);
  assert.match(text, /obra\/superpowers/);
  assert.match(text, /22f0b463e7a5e579904dd6211a520321035526f7/);
});

test('skills outside the selected five were not copied', () => {
  for (const name of [
    'using-superpowers', 'finishing-a-development-branch', 'using-git-worktrees',
    'writing-plans', 'executing-plans', 'frontend-design', 'ui-ux-design',
  ]) assert.ok(!existsSync(path.join(root, 'skills', name)), `${name} is absent`);
});

test('the existing Player and Coach entry points name the relevant base skills', () => {
  assert.match(read('skills/huddle-play/SKILL.md'), /huddle-tdd.*huddle-debug.*huddle-verify.*huddle-answer-review/i);
  assert.match(read('skills/huddle-issue/SKILL.md'), /huddle-brainstorm/i);
});
