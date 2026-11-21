// Issue #244: faster review rounds. The Coach runs the full suite only when it is about to approve, a docs-only round needs no run,
// the Player runs focused tests while it fixes and the full suite once before pushing. Never CI.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const read = (rel) => readFileSync(fileURLToPath(new URL(`../../${rel}`, import.meta.url)), 'utf8').replace(/\s+/g, ' ');

test('the review skill runs the full suite only before approving, on the head it merges, in a fresh worktree', () => {
  const t = read('skills/huddle-review/SKILL.md');
  assert.match(t, /only when you are about to approve/);
  assert.match(t, /asking for changes, do not run them/);
  assert.match(t, /never merge without that run/i);
  assert.match(t, /fresh worktree/);
  assert.match(t, /exact head/);
  assert.doesNotMatch(t, /and run the tests yourself/);
});

test('the review skill approves a docs-only round without a run, and says so in the review', () => {
  const t = read('skills/huddle-review/SKILL.md');
  assert.match(t, /docs-only/);
  assert.match(t, /no code and no test/);
  assert.match(t, /last full run/);
  assert.match(t, /say so in the review/);
});

test('the play skill runs focused tests while fixing and the full suite once before pushing', () => {
  const t = read('skills/huddle-play/SKILL.md');
  assert.match(t, /tests of the area you touched/);
  assert.match(t, /full suite once, right before pushing/);
  assert.match(t, /counts you report are that last full run/);
});

test('the watch merge recheck runs the full suite on the exact head it merges', () => {
  const t = read('skills/huddle-watch/SKILL.md');
  assert.match(t, /full suite/);
  assert.match(t, /exact head/);
});

test('the answer-review skill, when it exists, runs focused tests and the full suite once before pushing', () => {
  const t = read('skills/huddle-answer-review/SKILL.md');
  assert.match(t, /focused tests/);
  assert.match(t, /full suite once/);
});

test('no CI: no workflow is added by this change', () => {
  const dir = new URL('../../.github/workflows/', import.meta.url);
  const wf = existsSync(dir) ? readdirSync(dir) : [];
  assert.deepEqual(wf.filter((f) => /review|round/i.test(f)), []);
  assert.match(read('docs/design.md'), /never CI/i);
});
