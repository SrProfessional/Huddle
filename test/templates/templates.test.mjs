// Huddle: checks on the files `huddle-setup` copies into a repo (docs/design.md §5, §7).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const abs = (rel) => fileURLToPath(new URL(`../../templates/${rel}`, import.meta.url));
const read = (rel) => readFileSync(abs(rel), 'utf8');

const FILES = [
  'CLAUDE.huddle.md',
  'github/ISSUE_TEMPLATE/task.md',
  'github/pull_request_template.md',
  'github/workflows/huddle-labels.yml',
  'gitlab/issue_templates/Task.md',
  'gitlab/merge_request_templates/Default.md',
  'gitlab/huddle-labels.gitlab-ci.yml',
];

test('every template file exists and is not empty', () => {
  for (const f of FILES) {
    assert.ok(existsSync(abs(f)), `${f} is missing`);
    assert.ok(read(f).trim().length > 0, `${f} is empty`);
  }
});

test('no template names SocialCortex or its paths', () => {
  for (const f of FILES) {
    assert.doesNotMatch(read(f), /socialcortex|social cortex|neon|docs\/equipo|scripts\/huddle/i, f);
  }
});

test('CLAUDE block sits between the v1 markers, once, and refers to huddle.json', () => {
  const text = read('CLAUDE.huddle.md');
  assert.equal(text.split('<!-- huddle:start v1 -->').length, 2);
  assert.equal(text.split('<!-- huddle:end -->').length, 2);
  assert.ok(text.startsWith('<!-- huddle:start v1 -->'));
  assert.ok(text.trimEnd().endsWith('<!-- huddle:end -->'));
  assert.match(text, /huddle\.json/);
  assert.match(text, /Before starting a task/);
  assert.match(text, /Decision for the AI Manager/);
  assert.match(text, /The AI Manager role/);
  assert.doesNotMatch(text, /SrProfessional/);
});

for (const [name, file] of [['GitHub', 'github/ISSUE_TEMPLATE/task.md'], ['GitLab', 'gitlab/issue_templates/Task.md']]) {
  test(`${name} Issue template keeps the headings exactly`, () => {
    const lines = read(file).split(/\r?\n/);
    for (const h of ['## Goal', '## Depends on', '## Branch', '## Prompt for Claude Code', '## Allowed files', '## Tests that must pass']) {
      assert.ok(lines.includes(h), `${file} lacks "${h}"`);
    }
  });
}

test('GitHub Issue template has front matter', () => {
  assert.match(read('github/ISSUE_TEMPLATE/task.md'), /^---\nname: .+\nabout: .+\n/);
});

test('both PR/MR templates close the Issue with «Closes #N» and have «What was NOT done»', () => {
  for (const f of ['github/pull_request_template.md', 'gitlab/merge_request_templates/Default.md']) {
    const text = read(f);
    assert.match(text, /^Closes #N$/m, f);
    assert.match(text, /What was NOT done/, f);
  }
});

test('GitLab CI job runs on a schedule and on MR pipelines, reads HUDDLE_TOKEN and never prints it', () => {
  const text = read('gitlab/huddle-labels.gitlab-ci.yml');
  assert.match(text, /\$CI_PIPELINE_SOURCE == "schedule"/);
  assert.match(text, /\$CI_PIPELINE_SOURCE == "merge_request_event"/);
  assert.match(text, /\$HUDDLE_TOKEN/);
  const code = text.split('\n').filter((l) => !l.trim().startsWith('#'));
  for (const l of code) {
    if (/echo|printf|printenv|set -x|xtrace|\bcat\b/.test(l)) assert.doesNotMatch(l, /\$\{?\w*TOKEN/, l);
    assert.doesNotMatch(l, /^\s*-?\s*(env|printenv|set -x)\s*$/, l);
    assert.doesNotMatch(l, /CI_JOB_TOKEN/, 'CI_JOB_TOKEN cannot edit Issues');
  }
  assert.doesNotMatch(text, /HUDDLE_TOKEN\s*[:=]\s*["']?[A-Za-z0-9_-]{8,}/, 'no literal token');
});

test('GitHub workflow pins every action to a full 40-hex SHA', () => {
  const text = read('github/workflows/huddle-labels.yml');
  const uses = [...text.matchAll(/^\s*-?\s*uses:\s*(\S+)/gm)].map((m) => m[1]);
  assert.ok(uses.length > 0);
  for (const u of uses) assert.match(u, /^[\w.-]+\/[\w./-]+@[0-9a-f]{40}$/, u);
});

test('GitHub workflow runs on schedule and Issue events, with least privilege and no token echo', () => {
  const text = read('github/workflows/huddle-labels.yml');
  assert.match(text, /^on:/m);
  assert.match(text, /^\s+issues:/m);
  assert.match(text, /^\s+schedule:/m);
  assert.match(text, /^permissions:\n(?:[ \t]+.*\n)*?[ \t]+issues: write/m);
  assert.doesNotMatch(text, /(echo|printf)[^\n]*(GH_TOKEN|secrets\.)/);
});
