// Huddle: checks on the files `huddle-setup` copies into a repo (docs/design.md §5, §7).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dependsOn } from '../../lib/core/issue-status.mjs';

const abs = (rel) => fileURLToPath(new URL(`../../templates/${rel}`, import.meta.url));
const read = (rel) => readFileSync(abs(rel), 'utf8');

const FILES = [
  'CLAUDE.huddle.md',
  'github/ISSUE_TEMPLATE/task.md',
  'github/ISSUE_TEMPLATE/design.md',
  'github/pull_request_template.md',
  'github/workflows/huddle-labels.yml',
  'gitlab/issue_templates/Task.md',
  'gitlab/issue_templates/Design.md',
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

test('the Huddle block has a «Language» rule: chat in the developer\'s language, the repo in English (Issue #74)', () => {
  const text = read('CLAUDE.huddle.md');
  const m = text.match(/^###? Language\s*$([\s\S]*?)(?=^###? |<!-- huddle:end)/m);
  assert.ok(m, 'the block has a «Language» heading');
  const rule = m[1];
  assert.match(rule, /developer's language/i, 'chat in the developer\'s language');
  assert.match(rule, /`language`/, 'names the language key');
  assert.match(rule, /~\/\.claude\/settings\.json/, 'of the personal settings file');
  assert.match(rule, /own words/i, 'else the language of their own words');
  assert.match(rule, /never[^.]*pasted Issue prompt/i, 'never the language of a pasted Issue prompt');
  assert.match(rule, /Huddle's output/i, 'nor of Huddle\'s output');
  assert.match(rule, /English/, 'everything written to the repo is in English');
  for (const w of ['commits', 'Issue', 'comments', 'docs', 'names']) assert.ok(rule.includes(w), `the English list names ${w}`);
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

test('GitHub workflow also runs on comments and on new commits of a PR', () => {
  const text = read('github/workflows/huddle-labels.yml');
  assert.match(text, /^\s+issue_comment:\n\s+types: \[created, edited, deleted\]/m);
  assert.match(text, /^\s+pull_request:\n\s+types: \[[^\]]*\bsynchronize\b[^\]]*\]/m);
});

test('GitLab job says the label can lag up to 10 minutes after a comment', () => {
  const comments = read('gitlab/huddle-labels.gitlab-ci.yml').split('\n').filter((l) => l.trim().startsWith('#')).join('\n');
  assert.match(comments, /up to 10 minutes/);
  assert.match(comments, /comment/i);
});

test('nobody is told to add or remove «changes requested from AI Manager» by hand', () => {
  for (const f of FILES) {
    for (const line of read(f).split('\n')) {
      if (!/changes requested/i.test(line)) continue;
      assert.doesNotMatch(line, /\b(add|remove|put|set|delete|clear)\b/i, `${f}: ${line}`);
    }
  }
  assert.match(read('CLAUDE.huddle.md'), /by hand/);
});

// --- Design Issues (Issue #58) ---
const DESIGN = [['GitHub', 'github/ISSUE_TEMPLATE/design.md'], ['GitLab', 'gitlab/issue_templates/Design.md']];
const TASK_SECTIONS = ['## Goal', '## Depends on', '## Branch', '## Prompt for Claude Code', '## Allowed files', '## Contract or spec', '## Tests that must pass', '## Notes'];
const DESIGN_SECTIONS = ['## Screens', '## For whom', '## Visual guide', '## Content', '## Deliverable'];

for (const [name, file] of DESIGN) {
  test(`${name} Design template keeps every section the labels job and /huddle-start read, plus the design block`, () => {
    const lines = read(file).split(/\r?\n/);
    for (const h of [...TASK_SECTIONS, ...DESIGN_SECTIONS]) assert.ok(lines.includes(h), `${file} lacks "${h}"`);
    assert.equal(lines.filter((l) => l === '## Depends on').length, 1);
  });

  test(`${name} Design template: allowed files are always design/<issue number>-<slug>/ and never code`, () => {
    const text = read(file);
    assert.match(text, /design\/<issue number>-<slug>\//);
    assert.match(text, /never changes code/i);
  });

  test(`${name} Design template asks for real texts, and the labels job reads it as a managed task`, () => {
    assert.match(read(file), /lorem ipsum/i);
    assert.deepEqual(dependsOn(read(file)), [], 'it has «## Depends on» (so it is managed) and, by default, no dependency');
  });
}

test('GitHub Design template has front matter with the design label', () => {
  assert.match(read('github/ISSUE_TEMPLATE/design.md'), /^---\nname: Design\nabout: .+\ntitle: .*\nlabels: design\n/);
});

test('GitLab Design template puts the design label with a quick action (Issue templates have no front matter)', () => {
  assert.match(read('gitlab/issue_templates/Design.md'), /^\/label ~design$/m);
});
