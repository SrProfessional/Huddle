// Issue #290: a red base branch must not stall reviews. The skills are what the sessions follow, so they are tested as text.
// No real GitHub or GitLab is called.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const read = (rel) => readFileSync(fileURLToPath(new URL(`../../${rel}`, import.meta.url)), 'utf8').replace(/\s+/g, ' ');
const section19 = () => {
  const d = read('docs/design.md');
  const i = d.indexOf('## 19. Watching what waits');
  return d.slice(i, d.indexOf('## 20.', i));
};

test('the review skill compares the failing tests with the base, in a fresh worktree, with counts and names', () => {
  const t = read('skills/huddle-review/SKILL.md');
  assert.match(t, /Compare with the base/);
  assert.match(t, /same suite \(or the failing tests only\) on the base branch/);
  assert.match(t, /fresh worktree/);
  assert.match(t, /the two counts and the names/);
});

test('the review skill: no new failure counts as passing, and a red base never asks for changes', () => {
  const t = read('skills/huddle-review/SKILL.md');
  assert.match(t, /adds no new failure/);
  assert.match(t, /counts as passing/);
  assert.match(t, /a red base does not block/i);
});

test('the review skill writes the base failures once as one follow-up Issue and reuses an open one', () => {
  const t = read('skills/huddle-review/SKILL.md');
  assert.match(t, /one follow-up Issue/);
  assert.match(t, /existing open Issue for them is reused, never a second one/);
});

test('the review skill asks the Coach when the baseline cannot be compared', () => {
  const t = read('skills/huddle-review/SKILL.md');
  assert.match(t, /cannot be compared/);
  assert.match(t, /flaky/);
  assert.match(t, /❓ Decision for the Coach:/);
  assert.match(t, /--needs-decision/);
  assert.match(t, /never a silent stop/);
});

test('the watch skill reports a stopped review once, with the PR and the reason', () => {
  const t = read('skills/huddle-watch/SKILL.md');
  assert.match(t, /names the PR and the reason once/);
  assert.match(t, /needs-decision|«❓ Decision for the Coach:»/);
});

test('design §19 and the CHANGELOG say it', () => {
  const d = section19();
  assert.match(d, /Issue #290/);
  assert.match(d, /compares the failing test names with the base/);
  assert.match(d, /no new failure counts as passing/);
  assert.match(d, /names the PR and the reason once/);
  const c = read('CHANGELOG.md');
  assert.match(c, /Issue #290/);
  assert.match(c, /red base/i);
});
