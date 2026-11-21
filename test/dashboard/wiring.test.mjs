// Issue #232: what surrounds the page: .huddle/ in .gitignore (setup and update), the skill, the progress Issue line, the adapters' issueBody, the docs.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { setup } from '../../lib/setup/index.mjs';
import { update } from '../../lib/setup/update.mjs';
import { issueBody } from '../../lib/core/progress.mjs';
import { OPERATIONS } from '../../lib/platform/index.mjs';
import { createGithub } from '../../lib/platform/github.mjs';
import { createGitlab } from '../../lib/platform/gitlab.mjs';
import { fakeGithub } from '../platform/fake-gh.mjs';
import { fakeGitlab } from '../platform/fake-glab.mjs';

const repo = (rel) => readFileSync(fileURLToPath(new URL(`../../${rel}`, import.meta.url)), 'utf8');
const GH = { platform: 'github', project: 'acme/app', ai_manager: 'santiago', assignees: ['ana'], staging_branch: '', language: '' };
function inTemp(fn) {
  const root = mkdtempSync(path.join(tmpdir(), 'huddle-dash-'));
  try { return fn(root); } finally { rmSync(root, { recursive: true, force: true }); }
}
const lines = (text) => text.split(/\r?\n/).map((l) => l.trim());

test('setup creates .gitignore with .huddle/ when there is none', () => inTemp((root) => {
  const r = setup(root, GH);
  assert.deepEqual(lines(readFileSync(path.join(root, '.gitignore'), 'utf8')).filter(Boolean), ['.huddle/']);
  assert.ok(r.written.includes('.gitignore'));
}));

test('setup adds .huddle/ to an existing .gitignore, keeps the rest, and does it only once', () => inTemp((root) => {
  writeFileSync(path.join(root, '.gitignore'), 'node_modules/\ndist');
  setup(root, GH);
  setup(root, GH);
  const text = readFileSync(path.join(root, '.gitignore'), 'utf8');
  assert.equal(text, 'node_modules/\ndist\n.huddle/\n');
}));

test('a .gitignore that already ignores .huddle (in any of its usual spellings) is left byte for byte', () => inTemp((root) => {
  for (const line of ['.huddle', '.huddle/', '/.huddle', '/.huddle/']) {
    writeFileSync(path.join(root, '.gitignore'), `a\r\n${line}\r\n`);
    setup(root, GH);
    assert.equal(readFileSync(path.join(root, '.gitignore'), 'utf8'), `a\r\n${line}\r\n`, line);
  }
}));

test('a .gitignore with Windows line endings gets the line with Windows line endings', () => inTemp((root) => {
  writeFileSync(path.join(root, '.gitignore'), 'a\r\nb\r\n');
  setup(root, GH);
  assert.equal(readFileSync(path.join(root, '.gitignore'), 'utf8'), 'a\r\nb\r\n.huddle/\r\n');
}));

test('update brings .huddle/ to a repo that was set up before the dashboard', () => inTemp((root) => {
  setup(root, GH);
  writeFileSync(path.join(root, '.gitignore'), 'node_modules/\n');
  const check = update(root, { check: true });
  assert.ok(check.changed.includes('.gitignore'), `would change: ${check.changed.join(', ')}`);
  update(root, {});
  assert.match(readFileSync(path.join(root, '.gitignore'), 'utf8'), /^\.huddle\/$/m);
}));

test('the skill names the command in the three forms and runs it', () => {
  const skill = repo('skills/huddle-dashboard/SKILL.md');
  assert.match(skill, /^---\nname: huddle-dashboard\ndescription: .+\n---/);
  assert.match(skill, /huddle" dashboard/);
  assert.match(skill, /\/huddle-dashboard/);
  assert.match(skill, /\$huddle-dashboard/);
  assert.match(skill, /--no-open/);
  assert.match(skill, /\.huddle\/dashboard\/index\.html/);
});

test('the progress Issue says how to open the dashboard, in the three forms', () => {
  const body = issueBody({ areas: [], total: { merged: 0, total: 0, remaining: 0, percent: null }, noArea: 0 });
  assert.match(body, /`\/huddle-dashboard`/);
  assert.match(body, /`\$huddle-dashboard`/);
  assert.match(body, /`huddle dashboard`/);
});

test('both adapters read the text of an Issue (issueBody), so the effort of a closed Issue can be read', async () => {
  assert.ok(OPERATIONS.includes('issueBody'));
  const gh = fakeGithub();
  gh.world.issue({ number: 5, body: '## Effort\n\n2\n', state: 'merged' });
  assert.equal(await createGithub({ project: gh.project }, { run: gh.run }).issueBody(5), '## Effort\n\n2\n');
  const gl = fakeGitlab();
  gl.world.issue({ number: 5, body: '## Effort\n\n2\n', state: 'merged' });
  assert.equal(await createGitlab({ project: gl.project }, { run: gl.run }).issueBody(5), '## Effort\n\n2\n');
});

test('the docs say it: design §26, the team guide, the README and the changelog under Unreleased', () => {
  assert.match(repo('docs/design.md'), /`dashboard \[--no-open\]` command/);
  assert.match(repo('docs/design.md'), /\.huddle\/dashboard\/index\.html/);
  assert.match(repo('docs/team-guide.md'), /huddle-dashboard/);
  assert.match(repo('README.md'), /huddle-dashboard/);
  const changelog = repo('CHANGELOG.md');
  const unreleased = changelog.slice(changelog.indexOf('## [Unreleased]'), changelog.indexOf('## [', changelog.indexOf('## [Unreleased]') + 5));
  assert.match(unreleased, /dashboard/i);
});
