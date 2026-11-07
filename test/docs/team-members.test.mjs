// Huddle: the docs and the skill of «add or remove a team member» (Issue #36). They only read files.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));
const read = (rel) => readFileSync(path.join(root, rel), 'utf8');
const section = (text, heading) => {
  const m = text.match(new RegExp(`^## ${heading}\\r?\\n([\\s\\S]*?)(?=^## |(?![\\s\\S]))`, 'm'));
  assert.ok(m, `no section «${heading}»`);
  return m[1];
};

test('the team guide has «Add or remove someone»: the three steps, the skill and the command', () => {
  const t = section(read('docs/team-guide.md'), 'Add or remove someone');
  assert.match(t, /collaborator/i);
  assert.match(t, /Developer/);
  assert.match(t, /`assignees`/);
  assert.match(t, /PR\/MR/);
  assert.match(t, /gh auth login/);
  assert.match(t, /glab auth login/);
  assert.match(t, /claude plugin marketplace add SrProfessional\/Huddle/);
  assert.match(t, /claude plugin install huddle@huddle/);
  assert.match(t, /\/huddle-team/);
  assert.match(t, /huddle team add/);
  assert.match(t, /huddle team remove/);
  assert.match(t, /--anyway/);
  assert.match(t, /stays? `?ready`?/i);
});

test('the roles doc links the team guide section, and the README lists the command and the skill', () => {
  assert.match(read('docs/roles.md'), /\]\(team-guide\.md#add-or-remove-someone\)/);
  const readme = read('README.md');
  assert.match(readme, /\| `\/huddle-team` \| AI Manager \|/);
  assert.match(readme, /\| `huddle team( \[add[^`]*)?` \|/);
});

test('the CHANGELOG lists it under Unreleased', () => {
  const t = read('CHANGELOG.md');
  const unreleased = t.slice(t.indexOf('## [Unreleased]'), t.indexOf('## [0.1.0]'));
  assert.match(unreleased, /huddle team/);
  assert.match(unreleased, /\/huddle-team/);
  assert.match(unreleased, /#36/);
});

test('the huddle-team skill is for the AI Manager, uses the CLI, never merges and never commits to the default branch', () => {
  const t = read('skills/huddle-team/SKILL.md');
  assert.match(t, /For the AI Manager only/);
  assert.match(t, /bin\/huddle" team add/);
  assert.match(t, /bin\/huddle" team|team remove/);
  assert.match(t, /Never commit to the default branch/);
  assert.match(t, /Never merge it/);
  assert.match(t, /Team: add <login>/);
  assert.match(t, /gh pr create/);
  assert.match(t, /glab mr create/);
});

test('the skill checks the whole assignees array, not one line, and gives both PR/MR titles', () => {
  const t = read('skills/huddle-team/SKILL.md');
  assert.match(t, /only the `assignees` array may differ/);
  assert.doesNotMatch(t, /only the `assignees` line/);
  assert.match(t, /Team: add <login>/);
  assert.match(t, /Team: remove <login>/);
  assert.match(t, /--title "Team: add <login>" or "Team: remove <login>"/);
});

test('the skill prints the message for the new person: both install commands, the login command and, on GitLab, the git credential step', () => {
  const t = read('skills/huddle-team/SKILL.md');
  assert.match(t, /claude plugin marketplace add SrProfessional\/Huddle/);
  assert.match(t, /claude plugin install huddle@huddle/);
  assert.match(t, /gh auth login/);
  assert.match(t, /glab auth login/);
  const gitlabDoc = read('docs/gitlab.md');
  const credential = gitlabDoc.match(/git config --global --add credential\.https:\/\/gitlab\.com\.helper "[^"]+"/)[0];
  assert.ok(t.includes(credential), 'the credential step is the one of docs/gitlab.md');
});

test('the skill and the CLI agree on the steps for the AI Manager', () => {
  const t = read('skills/huddle-team/SKILL.md');
  assert.match(t, /Settings → Collaborators/);
  assert.match(t, /gh api -X PUT repos\/<project>\/collaborators\/<login>/);
  assert.match(t, /Manage → Members/);
});
