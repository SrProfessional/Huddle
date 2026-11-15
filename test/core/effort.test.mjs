// Issue #162: each Issue has an effort of 1, 2 or 3 points (docs/design.md §24). `effortOf` reads the «Effort» section; `suggestEffort` proposes one
// from the signals already in the Issue, and says when an Issue is too big and should be split.
import test from 'node:test';
import assert from 'node:assert/strict';
import { effortOf, suggestEffort } from '../../lib/core/effort.mjs';

const issue = ({ effort, files = [], tests = [], goal = 'Do one thing.', severity } = {}) => [
  '## Goal', '', goal, '',
  '## Depends on', '', '- None', '',
  ...(effort === undefined ? [] : ['## Effort', '', '<!-- 1 small, 2 medium, 3 large -->', '', effort, '']),
  ...(severity ? ['## Severity', '', severity, ''] : []),
  '## Allowed files', '', ...files.map((f) => `- \`${f}\``), '',
  '## Tests that must pass', '', ...tests.map((t) => `- ${t}`), '',
].join('\n');

test('effortOf reads the section in each written form', () => {
  for (const [text, n] of [['1', 1], ['2', 2], ['3', 3], ['S', 1], ['m', 2], ['L', 3], ['small', 1], ['Medium', 2], ['large', 3]]) {
    assert.equal(effortOf(issue({ effort: text })), n, text);
  }
});

test('effortOf is 2 when the section is missing or unreadable', () => {
  assert.equal(effortOf(issue()), 2);
  assert.equal(effortOf(issue({ effort: 'huge' })), 2);
  assert.equal(effortOf(issue({ effort: '5' })), 2);
  assert.equal(effortOf(''), 2);
  assert.equal(effortOf(undefined), 2);
});

const files = (n, dir = 'src') => Array.from({ length: n }, (_, i) => `${dir}/f${i}.mjs`);
const tests = (n) => Array.from({ length: n }, (_, i) => `test ${i}`);

test('a small Issue: few files, few tests, one folder -> 1', () => {
  const s = suggestEffort(issue({ files: files(2), tests: tests(1) }));
  assert.equal(s.effort, 1);
  assert.equal(s.split, false);
});

test('each signal moves the suggestion as the design says', () => {
  assert.equal(suggestEffort(issue({ files: files(4), tests: tests(1) })).effort, 1, '3-6 files: +1 point, still 1');
  assert.equal(suggestEffort(issue({ files: files(4), tests: tests(3) })).effort, 2, '+1 files +1 tests = 2 points');
  assert.equal(suggestEffort(issue({ files: files(8), tests: tests(1) })).effort, 2, '7-12 files: +2');
  assert.equal(suggestEffort(issue({ files: files(8), tests: tests(6) })).effort, 3, '+2 files +2 tests = 4 points');
  const mig = suggestEffort(issue({ files: ['db/migrations/081_x.sql', 'db/rollback/081_down.sql'], tests: tests(1) }));
  assert.equal(mig.effort, 1, 'a migration alone: +1 point');
  assert.ok(mig.reasons.some((r) => /migration/i.test(r)));
  const spread = suggestEffort(issue({ files: ['db/a.sql', 'api/b.mjs', 'web/c.tsx'], tests: tests(1) }));
  assert.ok(spread.reasons.some((r) => /3 top-level folders/.test(r)));
  assert.equal(spread.effort, 2, '3 files (+1) in 3 folders (+1) = 2 points');
});

test('a blocking bug never changes the effort; it only says so', () => {
  const plain = suggestEffort(issue({ files: files(2), tests: tests(1) }));
  const blocking = suggestEffort(issue({ files: files(2), tests: tests(1), severity: 'blocking' }));
  assert.equal(blocking.effort, plain.effort);
  assert.ok(blocking.reasons.some((r) => /blocking bug/i.test(r)));
});

test('a clearly too-big Issue gets split: true and a reason that says to split it', () => {
  const s = suggestEffort(issue({ files: [...files(8, 'api'), ...files(6, 'web'), 'db/migrations/090.sql'], tests: tests(7) }));
  assert.equal(s.effort, 3);
  assert.equal(s.split, true);
  assert.ok(s.reasons.some((r) => /split/i.test(r)));
});

test('HTML comments in the sections are not counted', () => {
  const body = issue({ files: files(1), tests: tests(1) }).replace('## Allowed files\n\n', '## Allowed files\n\n<!-- - `x/one.mjs`\n- `y/two.mjs` -->\n');
  assert.equal(suggestEffort(body).effort, 1);
});
