// Huddle: the skill /huddle-areas and its docs (Issue #42). They only read files; nothing here calls GitHub or GitLab.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));
const read = (rel) => readFileSync(path.join(root, rel), 'utf8');
const skill = () => read('skills/huddle-areas/SKILL.md');

test('the skill is for the AI Manager only and stops for anyone else', () => {
  const t = skill();
  assert.match(t, /^name: huddle-areas$/m);
  assert.match(t, /^description: Use when /m);
  assert.match(t, /AI Manager only|For the AI Manager only/);
  assert.match(t, /doctor/);
  assert.match(t, /ai_manager/);
});

test('the skill says that areas are milestones and that their number depends on the project, never fixed', () => {
  const t = skill();
  assert.match(t, /areas are milestones/i);
  assert.match(t, /Huddle remaining: N/);
  assert.match(t, /never (a )?fixed|never assume a (fixed )?number/i);
  assert.match(t, /depends on the project/i);
});

test('the skill always proposes and explains, and changes nothing before the AI Manager says yes', () => {
  const t = skill();
  assert.match(t, /propose/i);
  assert.match(t, /explain/i);
  assert.match(t, /OK/);
  assert.match(t, /--dry-run/);
  assert.match(t, /never change[^.]*without/i);
});

test('the skill covers the five points: propose areas, create them, classify Issues, estimate remaining, check-up', () => {
  const t = skill();
  for (const re of [/huddle" areas list/, /huddle" areas set /, /huddle" areas assign /, /huddle" areas check/, /no area/i, /stale/i, /GitHub and GitLab|GitHub or GitLab/]) assert.match(t, re);
});

test('the skill is short and has no em dash', () => {
  assert.ok(skill().split('\n').length <= 90, 'keep it short');
  assert.ok(!skill().includes('—'));
});

test('the team guide explains /huddle-areas under «Progress» as the way to define areas', () => {
  const t = read('docs/team-guide.md');
  const progress = t.slice(t.indexOf('## Progress'), t.indexOf('## Every day'));
  assert.match(progress, /\/huddle-areas/);
  assert.match(progress, /huddle areas (list|set|assign|check)/);
  assert.match(progress, /depends on the project/i);
  assert.doesNotMatch(progress, /never creates or edits them/);
  assert.match(t, /huddle areas check/);
});

test('the README lists the skill and the command; the CHANGELOG has them under «Unreleased»', () => {
  const readme = read('README.md');
  assert.match(readme, /\| `\/huddle-areas` \| AI Manager \|/);
  assert.match(readme, /\| `huddle areas /);
  const log = read('CHANGELOG.md');
  const unreleased = log.slice(log.indexOf('## [Unreleased]'), log.indexOf('## [0.2.0]'));
  assert.match(unreleased, /huddle areas/);
  assert.match(unreleased, /\/huddle-areas/);
  assert.match(unreleased, /#42/);
});

test('roles.md points the AI Manager to /huddle-areas', () => {
  assert.match(read('docs/roles.md'), /`\/huddle-areas`/);
});
