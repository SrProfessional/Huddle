// docs/design.md §21 (Issue #114): the skills and templates name the staging branch and `huddle land`, and still say the default branch where there is no staging.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const read = (p) => fs.readFileSync(fileURLToPath(new URL(`../../${p}`, import.meta.url)), 'utf8');
const flat = (p) => read(p).replace(/\s+/g, ' ');

test('huddle-play starts the branch from staging and opens the PR against it, with Closes #N', () => {
  const t = flat('skills/huddle-play/SKILL.md');
  assert.match(t, /staging_branch/);
  assert.match(t, /up-to-date staging branch/);
  assert.match(t, /\*\*against\*\* the staging branch/);
  assert.match(t, /Closes #N/);
  assert.match(t, /default branch/, 'without staging it is still the default branch');
});

test('huddle-issue writes the base as the staging branch, or the default branch when there is none', () => {
  const t = flat('skills/huddle-issue/SKILL.md');
  assert.match(t, /from an up-to-date <staging> \(the default branch when there is no staging\)/);
});

test('huddle-review checks, refuses a wrong base, lands, and says land is what closes the Issue', () => {
  const t = flat('skills/huddle-review/SKILL.md');
  assert.match(t, /huddle" land <pr> --check|huddle land <pr> --check/);
  assert.match(t, /retarget/i);
  assert.match(t, /not staging|other than staging|is not the staging branch/);
  assert.match(t, /(huddle"? land <pr>)(?! --check)[^`]*`?[^.]*labels/);
  assert.match(t, /Confirm the Issue closed.*it is `huddle land` that closes it/);
  assert.match(t, /default branch/);
});

test('the CLAUDE.md block and the Issue templates name the staging branch and that Huddle closes the Issue', () => {
  const block = flat('templates/CLAUDE.huddle.md');
  assert.match(block, /staging branch/);
  assert.match(block, /huddle land/);
  assert.match(block, /default branch/);
  for (const p of ['templates/github/ISSUE_TEMPLATE/task.md', 'templates/github/ISSUE_TEMPLATE/design.md', 'templates/github/ISSUE_TEMPLATE/bug.md',
    'templates/gitlab/issue_templates/Task.md', 'templates/gitlab/issue_templates/Design.md', 'templates/gitlab/issue_templates/Bug.md']) {
    const t = flat(p);
    assert.match(t, /up-to-date default branch/, `${p} still says the default branch`);
    assert.match(t, /or the staging branch when `huddle\.json` has one/, p);
  }
});

test('the PR and MR templates say the PR targets staging when huddle.json has one, and that Huddle closes the Issue', () => {
  for (const p of ['templates/github/pull_request_template.md', 'templates/gitlab/merge_request_templates/Default.md']) {
    const t = flat(p);
    assert.match(t, /^Closes #N/, p);
    assert.match(t, /staging branch/, p);
    assert.match(t, /Huddle closes the Issue/, p);
    assert.match(t, /default branch/, p);
  }
});

test('the design, the team guide, the README and the changelog describe land, the warning and clean', () => {
  const design = read('docs/design.md');
  const s21 = design.slice(design.indexOf('## 21.'));
  assert.match(s21, /H48 \(#114\)[^\n]*\| done \|/);
  assert.match(s21, /huddle land/);
  assert.match(s21, /--check/);
  assert.match(s21, /warning/i);
  assert.match(s21, /origin\/<staging_branch>/);
  assert.match(s21, /Meta PRs/);
  assert.match(design, /staging/);
  assert.match(flat('docs/team-guide.md'), /huddle land/);
  assert.match(read('README.md'), /\| `huddle land <pr> \[--check\]` \|/);
  const unreleased = read('CHANGELOG.md').split('\n## [')[1];
  assert.match(unreleased, /huddle land/);
});
