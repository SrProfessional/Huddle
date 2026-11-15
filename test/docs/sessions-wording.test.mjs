// Issue #132 (H57), docs/design.md §21, §22 and §23: the README, the guides, the PDF sources and the website say how Huddle works
// since 0.8.0 and #130. The sessions keep the labels right (no cloud labels job, schedule or token by default), every change to an
// Issue goes through a session and the next one repairs the board, and a project can use a staging branch with /huddle-release.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const raw = (rel) => readFileSync(fileURLToPath(new URL(`../../${rel}`, import.meta.url)), 'utf8');
/** The text a reader sees: tags dropped, entities for « » and spaces decoded, whitespace collapsed. */
const flat = (rel) => raw(rel)
  .replace(/<script[\s\S]*?<\/script>/g, ' ').replace(/<style[\s\S]*?<\/style>/g, ' ')
  .replace(/<[^>]+>/g, ' ')
  .replace(/&laquo;/g, '«').replace(/&raquo;/g, '»').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
  .replace(/\s+/g, ' ');

const TEXTS = [
  'README.md', 'docs/first-day.md', 'docs/team-guide.md', 'docs/roles.md',
  'docs/pdf/src/guide.html', 'docs/pdf/src/first-day.html', 'docs/pdf/src/first-day.section.html',
  'site/index.html', 'site/get-started/index.html', 'site/how-it-works/index.html',
];

test('no text says setup writes a labels workflow or a labels job', () => {
  for (const f of TEXTS) {
    const t = flat(f);
    assert.doesNotMatch(t, /the labels workflow \(`?\.github\/workflows\/huddle-labels\.yml/, f);
    assert.doesNotMatch(t, /writes[^.]*\bthe labels job\b/i, f);
  }
});

test('no text makes a GitLab schedule or HUDDLE_TOKEN a default step', () => {
  for (const f of TEXTS) {
    const t = flat(f);
    assert.doesNotMatch(t, /two more steps are only the Coach's/i, f);
    assert.doesNotMatch(t, /On GitLab the labels update on a pipeline schedule/i, f);
    assert.doesNotMatch(t, /on GitLab, by a schedule every 10 minutes/i, f);
    assert.doesNotMatch(t, /creates the GitLab `?HUDDLE_TOKEN`? variable, which holds a secret/i, f);
  }
});

test('no text says a job sets the labels, or that the cloud job catches up', () => {
  for (const f of TEXTS) {
    const t = flat(f);
    assert.doesNotMatch(t, /Nobody sets them by hand: a job does/i, f);
    assert.doesNotMatch(t, /the labels job \(`?huddle labels`?\) does/i, f);
    assert.doesNotMatch(t, /the labels job (assigns|does)\b/i, f);
    assert.doesNotMatch(t, /the labels job moves each Issue/i, f);
    assert.doesNotMatch(t, /the labels job updates these/i, f);
    assert.doesNotMatch(t, /that the labels job keeps/i, f);
    assert.doesNotMatch(t, /makes the labels job respect/i, f);
    assert.doesNotMatch(t, /the cloud job or the next session catches up/i, f);
  }
});

test('hourly and events are offered only in the GitLab guide and the team guide line for a hand-written value', () => {
  for (const f of TEXTS.filter((x) => x !== 'docs/team-guide.md')) {
    assert.doesNotMatch(flat(f), /\bhourly\b/, f);
  }
});

test('the GitLab job template does not call hourly the default', () => {
  assert.doesNotMatch(raw('templates/gitlab/huddle-labels.gitlab-ci.yml'), /`hourly` \(the default\)/);
});

test('the setup skill no longer says nothing uses the staging branch', () => {
  assert.doesNotMatch(raw('skills/huddle-setup/SKILL.md'), /nothing uses it yet/);
});

const RULE = /every change to an Issue goes through a (Huddle )?session/i;
const REPAIR = /next session that opens repairs the board/i;

test('the first-day guide, both PDF sources and the how-it-works page state the rule and the repair', () => {
  for (const f of ['docs/first-day.md', 'docs/pdf/src/guide.html', 'docs/pdf/src/first-day.html', 'site/how-it-works/index.html']) {
    const t = flat(f);
    assert.match(t, RULE, f);
    assert.match(t, REPAIR, f);
    assert.match(t, /reading and commenting/i, f);
    assert.match(t, /bug report form/i, f);
    assert.match(t, /✅ Tested in staging/, f);
  }
});

test('the how-it-works page, the get-started page and the guide PDF source describe the staging flow', () => {
  for (const f of ['site/how-it-works/index.html', 'site/get-started/index.html', 'docs/pdf/src/guide.html']) {
    const t = flat(f);
    assert.match(t, /staging_branch/, f);
    assert.match(t, /\/huddle-release/, f);
    assert.match(t, /huddle land/, f);
    assert.match(t, /huddle tested/, f);
  }
});
