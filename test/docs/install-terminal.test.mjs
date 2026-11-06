// Findings 6 and 7 of the first smoke test: the VS Code extension has no /plugin, and the labels workflow cloned the repo under the wrong case.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const read = (rel) => readFileSync(fileURLToPath(new URL(`../../${rel}`, import.meta.url)), 'utf8');

test('README Install and the first-day guide give the terminal form, for the VS Code extension, then a new session', () => {
  for (const file of ['README.md', 'docs/first-day.md']) {
    const t = read(file);
    assert.match(t, /VS Code/, file);
    assert.match(t, /claude plugin marketplace add SrProfessional\/Huddle/, file);
    assert.match(t, /claude plugin install huddle@huddle/, file);
    assert.match(t, /new session/i, file);
  }
});

test('the team guide «Updating Huddle» gives the terminal form too', () => {
  const t = read('docs/team-guide.md');
  const section = t.slice(t.indexOf('## Updating Huddle'));
  assert.match(section, /VS Code/);
  assert.match(section, /claude plugin marketplace update huddle/);
  assert.match(section, /claude plugin update huddle@huddle/);
  assert.match(section, /new session/i);
});

test('no doc says an Issue counts as merged because it was «closed as completed»', () => {
  for (const file of ['README.md', 'docs/first-day.md', 'docs/team-guide.md', 'docs/roles.md', 'docs/gitlab.md', 'templates/CLAUDE.huddle.md']) {
    assert.doesNotMatch(read(file), /closed as completed|CLOSED \+ COMPLETED|stateReason/i, file);
  }
});

test('the GitHub labels workflow template clones https://github.com/SrProfessional/Huddle.git', () => {
  const t = read('templates/github/workflows/huddle-labels.yml');
  assert.match(t, /git clone --quiet https:\/\/github\.com\/SrProfessional\/Huddle\.git /);
  assert.doesNotMatch(t, /SrProfessional\/huddle\b/);
});
