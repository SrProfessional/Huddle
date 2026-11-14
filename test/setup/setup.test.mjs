// Huddle: `setup` writes huddle.json, the templates of the chosen platform and the CLAUDE.md block (docs/design.md §4, §5, §6).
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { setup } from '../../lib/setup/index.mjs';
import { loadConfig } from '../../lib/cli/config.mjs';
import { renderLabelsJob } from '../../lib/setup/labels-job.mjs';

const tpl = (rel) => readFileSync(fileURLToPath(new URL(`../../templates/${rel}`, import.meta.url)), 'utf8');
const temp = () => mkdtempSync(path.join(tmpdir(), 'huddle-setup-'));
const read = (root, rel) => readFileSync(path.join(root, rel), 'utf8');
const GH = { platform: 'github', project: 'acme/app', ai_manager: 'santiago', assignees: ['ana', 'luis'] };
const GL = { platform: 'gitlab', host: 'gitlab.example.com', project: 'team/sub/app', ai_manager: 'santiago', assignees: ['ana'], max_open_per_person: 3, default_branch: 'develop' };

function inTemp(fn) {
  const root = temp();
  try { return fn(root); } finally { rmSync(root, { recursive: true, force: true }); }
}

test('GitHub: writes a valid huddle.json and the GitHub templates, and no GitLab file', () => inTemp((root) => {
  const r = setup(root, { ...GH, labels_job: 'hourly' });
  const config = loadConfig(root);
  assert.equal(config.platform, 'github');
  assert.equal(config.project, 'acme/app');
  assert.deepEqual(config.assignees, ['ana', 'luis']);
  assert.equal(JSON.parse(read(root, 'huddle.json')).$schema, 'https://raw.githubusercontent.com/SrProfessional/Huddle/main/huddle.schema.json');
  assert.equal(read(root, '.github/ISSUE_TEMPLATE/task.md'), tpl('github/ISSUE_TEMPLATE/task.md'));
  assert.equal(read(root, '.github/ISSUE_TEMPLATE/design.md'), tpl('github/ISSUE_TEMPLATE/design.md'));
  assert.equal(read(root, '.github/pull_request_template.md'), tpl('github/pull_request_template.md'));
  assert.equal(read(root, '.github/workflows/huddle-labels.yml'), renderLabelsJob('github', tpl('github/workflows/huddle-labels.yml'), 'hourly')); // asked for hourly: sessions is the default and writes no file (docs/design.md §23)
  assert.equal(existsSync(path.join(root, '.gitlab')), false);
  assert.equal(existsSync(path.join(root, 'huddle-labels.gitlab-ci.yml')), false);
  assert.ok(r.written.includes('huddle.json'));
  assert.equal(r.claudeMd, 'created');
}));

test('GitLab: writes the GitLab templates, the CI job and an .gitlab-ci.yml that includes it, and no GitHub file', () => inTemp((root) => {
  const r = setup(root, { ...GL, labels_job: 'hourly' });
  const config = loadConfig(root);
  assert.equal(config.host, 'gitlab.example.com');
  assert.equal(config.max_open_per_person, 3);
  assert.equal(config.default_branch, 'develop');
  assert.equal(read(root, '.gitlab/issue_templates/Task.md'), tpl('gitlab/issue_templates/Task.md'));
  assert.equal(read(root, '.gitlab/issue_templates/Design.md'), tpl('gitlab/issue_templates/Design.md'));
  assert.equal(read(root, '.gitlab/merge_request_templates/Default.md'), tpl('gitlab/merge_request_templates/Default.md'));
  assert.equal(read(root, 'huddle-labels.gitlab-ci.yml'), renderLabelsJob('gitlab', tpl('gitlab/huddle-labels.gitlab-ci.yml'), 'hourly'));
  assert.match(read(root, '.gitlab-ci.yml'), /include:\s*\n\s*- local: huddle-labels\.gitlab-ci\.yml/);
  assert.equal(existsSync(path.join(root, '.github')), false);
  assert.ok(r.notes.some((n) => /schedule/i.test(n)) && r.notes.some((n) => /HUDDLE_TOKEN/.test(n)));
}));

test('GitLab: an existing .gitlab-ci.yml is never edited; the include is left as a note', () => inTemp((root) => {
  writeFileSync(path.join(root, '.gitlab-ci.yml'), 'stages: [test]\n');
  const r = setup(root, { ...GL, labels_job: 'hourly' });
  assert.equal(read(root, '.gitlab-ci.yml'), 'stages: [test]\n');
  assert.ok(r.notes.some((n) => /include/.test(n) && /\.gitlab-ci\.yml/.test(n)));
}));

test('the CLAUDE.md block is inserted after the project text', () => inTemp((root) => {
  writeFileSync(path.join(root, 'CLAUDE.md'), '# Mine\n\nOwn rule.\n');
  const r = setup(root, GH);
  const text = read(root, 'CLAUDE.md');
  assert.ok(text.startsWith('# Mine\n\nOwn rule.\n'));
  assert.ok(text.includes(tpl('CLAUDE.huddle.md').trimEnd()));
  assert.equal(r.claudeMd, 'inserted');
}));

test('running setup again replaces only the block and keeps the project text', () => inTemp((root) => {
  writeFileSync(path.join(root, 'CLAUDE.md'), '# Mine\n\nOwn rule.\n');
  setup(root, GH);
  const first = read(root, 'CLAUDE.md');
  // The project edits around the block, and the block itself is stale.
  const edited = `${first.replace('Own rule.', 'Own rule, edited.').replace('## Huddle: how this team works', '## STALE')}\n## Own tail\n`;
  writeFileSync(path.join(root, 'CLAUDE.md'), edited);
  const r = setup(root, GH);
  const again = read(root, 'CLAUDE.md');
  assert.equal(r.claudeMd, 'updated');
  assert.ok(again.includes('Own rule, edited.'));
  assert.ok(again.includes('## Own tail'));
  assert.ok(!again.includes('## STALE'));
  assert.equal(again.split('<!-- huddle:start v1 -->').length, 2);
  assert.equal(again.split('<!-- huddle:end -->').length, 2);
}));

test('running setup again keeps edited templates (skipped) and keeps the keys setup does not ask for', () => inTemp((root) => {
  setup(root, GH);
  writeFileSync(path.join(root, '.github/pull_request_template.md'), 'my own PR template\n');
  const cfg = JSON.parse(read(root, 'huddle.json'));
  cfg.labels = { changes: 'needs changes' };
  writeFileSync(path.join(root, 'huddle.json'), JSON.stringify(cfg));
  const r = setup(root, { ...GH, assignees: ['ana'] });
  assert.equal(read(root, '.github/pull_request_template.md'), 'my own PR template\n');
  assert.ok(r.skipped.includes('.github/pull_request_template.md'));
  const after = JSON.parse(read(root, 'huddle.json'));
  assert.deepEqual(after.labels, { changes: 'needs changes' });
  assert.deepEqual(after.assignees, ['ana']);
}));

test('invalid answers are refused before any file is written', () => inTemp((root) => {
  assert.throws(() => setup(root, { ...GH, platform: 'bitbucket' }), /platform/);
  assert.throws(() => setup(root, { platform: 'github', project: '', ai_manager: 'x' }), /project/);
  assert.throws(() => setup(root, { platform: 'github', project: 'a/b' }), /ai_manager/);
  assert.equal(existsSync(path.join(root, 'huddle.json')), false);
  assert.equal(existsSync(path.join(root, 'CLAUDE.md')), false);
}));

test('an unknown answer such as a token is refused: no secret goes in huddle.json', () => inTemp((root) => {
  assert.throws(() => setup(root, { ...GH, token: 'ghp_abc' }), /token/);
  assert.equal(existsSync(path.join(root, 'huddle.json')), false);
}));

test('the CLI entry takes flags, works in the current folder and prints a JSON report', () => inTemp((root) => {
  const cli = fileURLToPath(new URL('../../lib/setup/cli.mjs', import.meta.url));
  const out = execFileSync(process.execPath, [cli, '--platform', 'github', '--project', 'acme/app', '--ai-manager', 'santiago', '--assignees', 'ana, luis'], { cwd: root, encoding: 'utf8' });
  const report = JSON.parse(out);
  assert.ok(report.written.includes('huddle.json'));
  assert.deepEqual(loadConfig(root).assignees, ['ana', 'luis']);
  assert.throws(() => execFileSync(process.execPath, [cli, '--platform', 'nope'], { cwd: root, stdio: 'pipe' }));
}));

test('setup tells the developer that the labels command creates the design label (setup itself never calls the network)', () => inTemp((root) => {
  for (const answers of [GH, GL]) assert.ok(setup(root, answers).notes.some((n) => /bin\/huddle" labels/.test(n) && /design/.test(n)), answers.platform);
}));
