// Finding 5 of the first smoke test: `setup` writes the .claude/settings.json snippet of the README, so no project adds it by hand.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { setup } from '../../lib/setup/index.mjs';

const GH = { platform: 'github', project: 'acme/app', ai_manager: 'santiago', assignees: ['ana'] };
const SNIPPET = {
  extraKnownMarketplaces: { huddle: { source: { source: 'github', repo: 'SrProfessional/Huddle' } } },
  enabledPlugins: { 'huddle@huddle': true },
};
const SETTINGS = '.claude/settings.json';

function inTemp(fn) {
  const root = mkdtempSync(path.join(tmpdir(), 'huddle-settings-'));
  try { return fn(root); } finally { rmSync(root, { recursive: true, force: true }); }
}
const put = (root, text) => { mkdirSync(path.join(root, '.claude'), { recursive: true }); writeFileSync(path.join(root, SETTINGS), text); };
const settings = (root) => JSON.parse(readFileSync(path.join(root, SETTINGS), 'utf8'));

test('creates .claude/settings.json with the marketplace and the enabled plugin when it is missing', () => inTemp((root) => {
  const r = setup(root, GH);
  assert.deepEqual(settings(root), SNIPPET);
  assert.ok(r.written.includes(SETTINGS));
  assert.ok(!r.skipped.includes(SETTINGS));
}));

test('merges into an existing settings.json and keeps every other key', () => inTemp((root) => {
  put(root, JSON.stringify({
    model: 'sonnet',
    permissions: { allow: ['Bash(npm test)'] },
    extraKnownMarketplaces: { other: { source: { source: 'github', repo: 'acme/other' } } },
    enabledPlugins: { 'other@other': true, 'old@thing': false },
  }));
  const r = setup(root, GH);
  const s = settings(root);
  assert.equal(s.model, 'sonnet');
  assert.deepEqual(s.permissions, { allow: ['Bash(npm test)'] });
  assert.deepEqual(s.extraKnownMarketplaces.other, { source: { source: 'github', repo: 'acme/other' } });
  assert.deepEqual(s.extraKnownMarketplaces.huddle, SNIPPET.extraKnownMarketplaces.huddle);
  assert.deepEqual(s.enabledPlugins, { 'other@other': true, 'old@thing': false, 'huddle@huddle': true });
  assert.ok(r.written.includes(SETTINGS));
}));

test('replaces only the huddle entries when they differ, and a second run changes nothing', () => inTemp((root) => {
  put(root, JSON.stringify({ extraKnownMarketplaces: { huddle: { source: { source: 'github', repo: 'old/place' } } }, enabledPlugins: { 'huddle@huddle': false }, theme: 'dark' }));
  setup(root, GH);
  assert.deepEqual(settings(root), { ...SNIPPET, theme: 'dark' });
  const first = readFileSync(path.join(root, SETTINGS), 'utf8');
  setup(root, GH);
  assert.equal(readFileSync(path.join(root, SETTINGS), 'utf8'), first);
}));

test('an existing settings.json that is not valid JSON is left untouched and reported in skipped', () => inTemp((root) => {
  put(root, '{ "model": // a comment\n }');
  const r = setup(root, GH);
  assert.equal(readFileSync(path.join(root, SETTINGS), 'utf8'), '{ "model": // a comment\n }');
  assert.ok(r.skipped.includes(SETTINGS));
  assert.ok(!r.written.includes(SETTINGS));
  assert.ok(r.notes.some((n) => /settings\.json/.test(n) && /extraKnownMarketplaces/.test(n)), 'the note gives the snippet to add by hand');
}));

test('a settings.json whose marketplace keys are not objects is left untouched and reported in skipped', () => inTemp((root) => {
  put(root, JSON.stringify({ enabledPlugins: ['x'] }));
  const r = setup(root, GH);
  assert.deepEqual(settings(root), { enabledPlugins: ['x'] });
  assert.ok(r.skipped.includes(SETTINGS));
}));

test('GitLab gets the same settings.json', () => inTemp((root) => {
  setup(root, { platform: 'gitlab', project: 'team/app', ai_manager: 'santiago' });
  assert.deepEqual(settings(root), SNIPPET);
}));

// Finding 4: the skill gave examples for platform, host and project but none for the AI Manager and the team.
test('the huddle-setup skill gives examples for the AI Manager and the team, and says it writes settings.json', () => {
  const t = readFileSync(new URL('../../skills/huddle-setup/SKILL.md', import.meta.url), 'utf8');
  assert.match(t, /\*\*AI Manager:\*\*[^\n]*for example `SrProfessional`/);
  assert.match(t, /gh api user/);
  assert.match(t, /glab api user/);
  assert.match(t, /\*\*Team:\*\*[^\n]*for example `SrProfessional, Santiago123`/);
  assert.match(t, /\.claude\/settings\.json/);
});
