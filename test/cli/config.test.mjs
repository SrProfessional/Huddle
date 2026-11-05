import test from 'node:test';
import assert from 'node:assert/strict';
import { loadConfig, labelNames } from '../../lib/cli/config.mjs';

const read = (text) => () => text;
const load = (obj) => loadConfig('/repo', read(typeof obj === 'string' ? obj : JSON.stringify(obj)));

test('a valid huddle.json loads with its defaults filled in', () => {
  const c = load({ platform: 'github', project: 'a/b', ai_manager: 'sr' });
  assert.equal(c.platform, 'github');
  assert.deepEqual(c.assignees, []);
  assert.equal(c.default_branch, 'main');
});
test('a missing file says where it looked', () => assert.throws(() => loadConfig('/repo', () => null), /huddle\.json not found.*\/repo/s));
test('broken JSON is refused', () => assert.throws(() => load('{nope'), /huddle\.json is not valid JSON/));
test('an invalid field is refused with the field named', () => {
  assert.throws(() => load({ platform: 'github', project: 'a/b', ai_manager: 'sr', max_open_per_person: 'two' }), /"max_open_per_person" must be of type integer/);
  assert.throws(() => load({ platform: 'bitbucket', project: 'a/b', ai_manager: 'sr' }), /"platform" must be one of github, gitlab/);
  assert.throws(() => load({ platform: 'github', ai_manager: 'sr' }), /"project" is required/);
  assert.throws(() => load({ platform: 'github', project: 'a/b' }), /"ai_manager" is required/);
  assert.throws(() => load({ platform: 'github', project: 'a/b', ai_manager: 'sr', labels: { changes: '' } }), /"labels\.changes" must not be empty/);
  assert.throws(() => load({ platform: 'github', project: 'a/b', ai_manager: 'sr', labels: { nope: 'x' } }), /"labels\.nope" is not allowed/);
});
test('two labels with the same name are refused', () => assert.throws(() => load({ platform: 'github', project: 'a/b', ai_manager: 'sr', labels: { ready: 'x', blocked: 'x' } }), /"labels".*same name/));
test('$schema is accepted', () => assert.ok(load({ $schema: 'https://x/y.json', platform: 'github', project: 'a/b', ai_manager: 'sr' })));
test('label renames override only the named defaults', () => {
  const names = labelNames({ labels: { changes: 'needs-changes' } });
  assert.equal(names.changes, 'needs-changes');
  assert.equal(names.ready, 'ready');
  assert.equal(names.review, 'in review');
});
