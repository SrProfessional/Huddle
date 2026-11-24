// Issue #318: the shared readers of an Issue's sections skip a «None» allowed-files line and ignore headings inside fenced code blocks. Pure functions, no network.
import test from 'node:test';
import assert from 'node:assert/strict';
import { allowedFilesOf, effortOf } from '../../lib/core/effort.mjs';
import { dependsOn } from '../../lib/core/issue-status.mjs';
import { conflictReport } from '../../lib/core/conflicts.mjs';

const withFiles = (...lines) => `## Depends on\n\n- None\n\n## Allowed files\n\n${lines.join('\n')}\n`;

test('None and (none) list no file in the shared reader, in any form', () => {
  for (const line of ['- None', '- none', '- NONE', '- (none)', '- (None).', '- `None`', '- None.', 'None', '* (none)']) {
    assert.deepEqual(allowedFilesOf(withFiles(line)), [], line);
  }
});

test('a real file named like none.mjs is still a file, and None next to real files only drops the None line', () => {
  assert.deepEqual(allowedFilesOf(withFiles('- `none.mjs`')), ['none.mjs']);
  assert.deepEqual(allowedFilesOf(withFiles('- `lib/none.mjs`', '- None', '- `a.mjs`')), ['lib/none.mjs', 'a.mjs']);
});

test('a fenced «## Depends on» is skipped by dependsOn, and a fenced heading does not end or start a section', () => {
  const fenced = '## Goal\n\n```text\n## Depends on\n\n- #9\n```\n\n## Depends on\n\n- #4\n';
  assert.deepEqual(dependsOn(fenced), [4]);
  assert.equal(dependsOn('## Goal\n\n```\n## Depends on\n\n- #9\n```\n'), null, 'only a fenced one: the Issue has no section');
  const split = '## Depends on\n\n- #4\n\n```\n## Not a heading\n- #5\n```\n\n- #6\n';
  assert.deepEqual(dependsOn(split), [4, 6], 'the fenced line is blanked, the section goes on after the fence');
});

test('a fenced heading is skipped by section(): the effort and the allowed files come from the real sections', () => {
  const body = '## Goal\n\n```md\n## Effort\n\n3\n\n## Allowed files\n\n- `fake.mjs`\n```\n\n## Effort\n\n1\n\n## Allowed files\n\n- `real.mjs`\n';
  assert.equal(effortOf(body), 1);
  assert.deepEqual(allowedFilesOf(body), ['real.mjs']);
});

test('the shared reader gives the same files as huddle conflicts reads: two None Issues never conflict', () => {
  const issue = (number) => ({ number, title: 'x', body: withFiles('- None'), labels: [], assignees: [] });
  assert.deepEqual(conflictReport([issue(1), issue(2)]).rows, []);
  const real = (number) => ({ ...issue(number), body: withFiles('- `none.mjs`') });
  assert.equal(conflictReport([real(1), real(2)]).rows.length, 1, 'none.mjs is a real file');
});
