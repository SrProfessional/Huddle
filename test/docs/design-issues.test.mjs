// Huddle: checks on how the skills and docs describe a Design Issue (Issue #58). They only read files; nothing here calls GitHub or GitLab.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));
const flat = (rel) => readFileSync(path.join(root, rel), 'utf8').replace(/\s+/g, ' ');

test('/huddle-issue writes a design task from the Design template, with the design label and design/<n>-<slug>/ as the only allowed files', () => {
  const t = flat('skills/huddle-issue/SKILL.md');
  assert.match(t, /Design Issue/);
  assert.match(t, /\.github\/ISSUE_TEMPLATE\/design\.md/);
  assert.match(t, /\.gitlab\/issue_templates\/Design\.md/);
  assert.match(t, /design\/<issue number>-<slug>\//);
  for (const field of ['Screens', 'For whom', 'Visual guide', 'Content', 'Deliverable']) assert.ok(t.includes(field), field);
  assert.match(t, /never changes code/i);
  assert.match(t, /--label design/);
});

test('/huddle-play works a Design Issue: Claude Design, polish only in the chat, ready, then saves, opens the PR and closes', () => {
  const t = flat('skills/huddle-play/SKILL.md');
  assert.match(t, /Design Issue/);
  assert.match(t, /Claude Design/);
  assert.match(t, /design artifact/i);
  assert.match(t, /design system/i);
  assert.match(t, /visual guide/i);
  assert.match(t, /only (by|through) (writing to you|the chat)|in the chat/i);
  assert.match(t, /never change anything by hand on the canvas/i);
  assert.match(t, /a change you did not make|a change it did not make|saved from the page/i);
  assert.match(t, /keep (that|the) change or go back/i);
  assert.match(t, /«listo»|“listo”|listo/);
  assert.match(t, /ready/);
  assert.match(t, /one-line confirmation/i);
  for (const f of ['design/<issue number>-<slug>/', 'README.md', 'design.html', 'screens/', 'PNG', 'desktop and phone']) assert.ok(t.includes(f), f);
  assert.match(t, /Resolves #N/);
  assert.match(t, /screenshots inline/i);
  assert.match(t, /✅ Issue #N finished/);
  assert.match(t, /each (new )?round[^.]*commit/i);
  assert.match(t, /no version history|has no version history/i);
});

test('/huddle-play keeps a design Issue away from code and tests', () => {
  const t = flat('skills/huddle-play/SKILL.md');
  assert.match(t, /never change[s]? code|no code/i);
  assert.match(t, /no tests|not run tests|there are no tests/i);
});

test('/huddle-review reviews a design PR on the screens, content, visual guide, contrast and phone width, never tests, and offers the build Issue after the merge', () => {
  const t = flat('skills/huddle-review/SKILL.md');
  assert.match(t, /design PR/i);
  assert.match(t, /screenshots/i);
  assert.match(t, /design\.html/);
  assert.match(t, /contrast/i);
  assert.match(t, /phone width/i);
  assert.match(t, /never (checks|runs) tests/i);
  assert.match(t, /Changes requested/);
  assert.match(t, /Build <screen> from design #N/);
  assert.match(t, /- #N/);
  assert.match(t, /the `design[/]` folder/i);
});

test('the docs for designers: first day, team guide, README, changelog', () => {
  const first = flat('docs/first-day.md');
  assert.match(first, /If you are a designer/);
  assert.match(first, /Claude Code in VS Code/);
  assert.match(first, /GitHub account/);
  assert.match(first, /Claude plan/);
  assert.match(first, /in the chat/i);
  const guide = flat('docs/team-guide.md');
  assert.match(guide, /## Design tasks/);
  assert.match(guide, /design\/<issue number>-<slug>\//);
  assert.match(guide, /\/design-sync/);
  assert.match(flat('README.md'), /Design Issue/);
  const log = readFileSync(path.join(root, 'CHANGELOG.md'), 'utf8');
  const unreleased = log.slice(log.indexOf('## [Unreleased]'), log.indexOf('## [0.3.0]'));
  assert.match(unreleased, /#58/);
  assert.match(unreleased, /Design/);
});
