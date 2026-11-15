// Issue #162: every Issue template has «## Effort» right after «## Depends on»; /huddle-issue and /huddle-bug run the suggestion and propose
// a split; the design, the README and the team guide say the scale.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { effortOf } from '../../lib/core/effort.mjs';

const read = (rel) => readFileSync(fileURLToPath(new URL(`../../${rel}`, import.meta.url)), 'utf8').replace(/\r\n/g, '\n');
const TEMPLATES = ['templates/github/ISSUE_TEMPLATE/task.md', 'templates/github/ISSUE_TEMPLATE/bug.md', 'templates/github/ISSUE_TEMPLATE/design.md',
  'templates/gitlab/issue_templates/Task.md', 'templates/gitlab/issue_templates/Bug.md', 'templates/gitlab/issue_templates/Design.md',
  '.github/ISSUE_TEMPLATE/task.md', '.github/ISSUE_TEMPLATE/bug.md', '.github/ISSUE_TEMPLATE/design.md'];

for (const f of TEMPLATES) {
  test(`${f}: «## Effort» comes right after «## Depends on», and reads as 2`, () => {
    const t = read(f);
    const deps = t.indexOf('## Depends on');
    const effort = t.indexOf('## Effort');
    assert.ok(deps >= 0 && effort > deps, 'Effort after Depends on');
    assert.equal(t.slice(deps + 3).search(/^## /m) + deps + 3, effort, 'no other section in between');
    assert.equal(effortOf(t), 2);
  });
}

test('/huddle-issue and /huddle-bug run the suggestion, show the reasons and propose a split', () => {
  for (const f of ['skills/huddle-issue/SKILL.md', 'skills/huddle-bug/SKILL.md']) {
    const t = read(f).replace(/\s+/g, ' ');
    assert.ok(t.includes('node "${CLAUDE_PLUGIN_ROOT}/bin/huddle" effort --suggest <file>'), f);
    assert.match(t, /`reasons`/, f);
    assert.match(t, /`split: true`.*splitting/, f);
  }
});

test('the design, the README and the team guide say the scale', () => {
  assert.match(read('docs/design.md'), /^## 24\. The effort of an Issue: 1, 2 or 3 points/m);
  assert.match(read('README.md'), /huddle effort <n>/);
  assert.match(read('docs/team-guide.md'), /^## Effort/m);
});
