// Issue #252: the Coach merges when the PR/MR is correct and safe; what does not block becomes a new Issue, not another round.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const read = (rel) => readFileSync(fileURLToPath(new URL(`../../${rel}`, import.meta.url)), 'utf8').replace(/\s+/g, ' ');

test('the review skill asks for changes only for what blocks, and turns the rest into new Issues', () => {
  const t = read('skills/huddle-review/SKILL.md');
  assert.match(t, /Ask for changes only for what blocks: a contract item not done, a failing test, a bug a user would hit, a security or privacy hole, data loss, a broken rule of the repo\./);
  assert.match(t, /Anything else \(a rarer edge case, extra hardening, a nicer structure, more tests of the same thing\) never holds the merge: approve and merge, and write each one now as a new Issue with `\/huddle-issue`, named in the approval comment/);
});

test('the CLAUDE.md block says the same in the Coach\'s section', () => {
  assert.match(read('templates/CLAUDE.huddle.md'), /A review asks for changes only for what blocks; what does not block is merged and written as a new Issue\./);
});
