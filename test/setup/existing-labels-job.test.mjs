// Issue #70: setup finds a labels job the project already runs under another name, by what it does (it runs `huddle labels`),
// never adds a second one, and warns when that job pins an older Huddle than the one running setup.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { setup } from '../../lib/setup/index.mjs';

const VERSION = JSON.parse(readFileSync(new URL('../../.claude-plugin/plugin.json', import.meta.url), 'utf8')).version;
const GH = { platform: 'github', project: 'acme/app', ai_manager: 'santiago', assignees: ['ana'] };
const GL = { platform: 'gitlab', host: 'gitlab.example.com', project: 'team/app', ai_manager: 'santiago', assignees: ['ana'] };

function inTemp(files, fn) {
  const root = mkdtempSync(path.join(tmpdir(), 'huddle-setup-'));
  try {
    for (const [rel, text] of Object.entries(files)) {
      mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
      writeFileSync(path.join(root, rel), text);
    }
    return fn(root);
  } finally { rmSync(root, { recursive: true, force: true }); }
}

const workflow = (ref) => `name: issue-labels
on: { issues: { types: [opened] } }
jobs:
  labels:
    runs-on: ubuntu-latest
    env:
      HUDDLE_REF: ${ref}
    steps:
      - run: git clone --quiet https://github.com/SrProfessional/Huddle.git "$RUNNER_TEMP/huddle"
      - run: node "$RUNNER_TEMP/huddle/bin/huddle" labels
`;
const has = (r, re) => r.notes.some((n) => re.test(n));

test('GitHub: a labels workflow under another name is kept, and no huddle-labels.yml is added', () => inTemp({ '.github/workflows/issue-labels.yml': workflow('main') }, (root) => {
  const r = setup(root, GH);
  assert.equal(existsSync(path.join(root, '.github/workflows/huddle-labels.yml')), false);
  assert.ok(!r.written.includes('.github/workflows/huddle-labels.yml'));
  assert.ok(has(r, /Kept \.github\/workflows\/issue-labels\.yml: it already runs huddle labels/), r.notes.join('\n'));
  assert.ok(!has(r, /runs Huddle main/), 'main is always current: no update note');
  assert.ok(existsSync(path.join(root, '.github/ISSUE_TEMPLATE/task.md')), 'the other templates are still written');
}));

test('GitHub: a workflow that pins an older tag gets a note to update HUDDLE_REF', () => inTemp({ '.github/workflows/issue-labels.yml': workflow('v0.2.0') }, (root) => {
  const r = setup(root, GH);
  assert.ok(has(r, new RegExp(`\\.github/workflows/issue-labels\\.yml runs Huddle v0\\.2\\.0; this is ${VERSION.replaceAll('.', '\\.')}\\. Update HUDDLE_REF to v${VERSION.replaceAll('.', '\\.')}`)), r.notes.join('\n'));
}));

test('GitHub: a full SHA with its tag in a comment is read by the tag; the current tag gets no note', () => {
  inTemp({ '.github/workflows/issue-labels.yml': workflow('402347309f0c2b1a9d8e7f6a5b4c3d2e1f0a9b8c # v0.2.0') }, (root) => {
    const r = setup(root, GH);
    assert.ok(has(r, /runs Huddle 402347309f0c2b1a9d8e7f6a5b4c3d2e1f0a9b8c \(v0\.2\.0\); this is/), r.notes.join('\n'));
  });
  inTemp({ '.github/workflows/issue-labels.yml': workflow(`8e8d6e0af2cb3eda0f73a1c54b9b896e09d2e94f # v${VERSION}`) }, (root) => {
    assert.ok(!has(setup(root, GH), /runs Huddle/));
  });
});

test('GitHub: a SHA without a tag cannot be dated, so the note asks to check it', () => inTemp({ '.github/workflows/issue-labels.yml': workflow('402347309f0c2b1a9d8e7f6a5b4c3d2e1f0a9b8c') }, (root) => {
  assert.ok(has(setup(root, GH), /runs Huddle 402347309f0c2b1a9d8e7f6a5b4c3d2e1f0a9b8c; check it is v\d/));
}));

test('GitHub: a workflow that does not run huddle labels does not count', () => inTemp({ '.github/workflows/tests.yml': 'jobs:\n  t:\n    steps:\n      - run: npm test\n' }, (root) => {
  const r = setup(root, GH);
  assert.ok(existsSync(path.join(root, '.github/workflows/huddle-labels.yml')));
  assert.ok(!has(r, /already runs huddle labels/));
}));

test('GitLab: a labels job in .gitlab-ci.yml is kept: no huddle-labels.gitlab-ci.yml and no include note', () => inTemp({
  '.gitlab-ci.yml': 'labels:\n  variables:\n    HUDDLE_REF: v0.1.0\n  script:\n    - node /tmp/huddle/bin/huddle labels\n',
}, (root) => {
  const r = setup(root, GL);
  assert.equal(existsSync(path.join(root, 'huddle-labels.gitlab-ci.yml')), false);
  assert.ok(has(r, /Kept \.gitlab-ci\.yml: it already runs huddle labels/), r.notes.join('\n'));
  assert.ok(!has(r, /Add this to your existing \.gitlab-ci\.yml/));
  assert.ok(has(r, /\.gitlab-ci\.yml runs Huddle v0\.1\.0; this is/));
}));

test('GitLab: a labels job in a file that .gitlab-ci.yml includes is found too', () => inTemp({
  '.gitlab-ci.yml': 'include:\n  - local: ci/labels.yml\n',
  'ci/labels.yml': 'labels:\n  script:\n    - node /tmp/huddle/bin/huddle labels\n',
}, (root) => {
  const r = setup(root, GL);
  assert.equal(existsSync(path.join(root, 'huddle-labels.gitlab-ci.yml')), false);
  assert.ok(has(r, /Kept ci\/labels\.yml: it already runs huddle labels/), r.notes.join('\n'));
}));

test('GitHub: when setup\'s own huddle-labels.yml is there too, the note says both run and one must go', () => inTemp({
  '.github/workflows/issue-labels.yml': workflow('main'),
  '.github/workflows/huddle-labels.yml': workflow('main'),
}, (root) => {
  assert.ok(has(setup(root, GH), /huddle-labels\.yml runs huddle labels too: .*twice/));
}));
