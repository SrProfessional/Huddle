// Issue #165: the Coach's watch reviews several PRs/MRs at once, each in a background subagent with a clean context, within its review
// capacity in effort points, and still merges one at a time, checking each one again against the updated base. Tested as text.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const read = (rel) => readFileSync(fileURLToPath(new URL(`../../${rel}`, import.meta.url)), 'utf8').replace(/\s+/g, ' ');
const watch = read('skills/huddle-watch/SKILL.md');
const review = read('skills/huddle-review/SKILL.md');

test('the watch starts reviews within review_capacity by effort, each in a background subagent with a clean context', () => {
  assert.match(watch, /`review_capacity`/);
  assert.match(watch, /the item's `effort`/);
  assert.match(watch, /oldest first/);
  assert.match(watch, /subagent with the Agent tool, \*\*in the background\*\*, with a clean context/);
  assert.match(watch, /bigger than the capacity is reviewed alone/);
});

test('subagents review but never merge; the main session merges one at a time after checking again against the updated base', () => {
  assert.match(watch, /never merges/);
  assert.match(watch, /one at a time/);
  assert.match(watch, /merges? cleanly/);
  assert.match(watch, /tests pass on the branch updated with the base/);
  assert.match(watch, /«🔁 Changes requested».*update the branch/);
  assert.match(watch, /nothing is merged/);
});

test('the review skill has the subagent form: the full review, a verdict, no merge', () => {
  assert.match(review, /## Reviewing for the watch/);
  assert.match(review, /verdict/i);
  assert.match(review, /do \*\*not\*\* approve or merge/);
});

test('the design says it', () => {
  const d = read('docs/design.md');
  assert.match(d, /Parallel reviews \(Issue #165\)/);
  assert.match(d, /review_capacity/);
});
