import test from 'node:test';
import assert from 'node:assert/strict';
import { newPluginRoot } from '../../lib/core/update.mjs';

const exists = (...dirs) => (dir) => dirs.includes(dir);

test('the new version folder is a sibling of the running one (0.5.2 -> 0.6.0, POSIX)', () => {
  const root = '/home/ana/.claude/plugins/cache/huddle/huddle/0.5.2';
  const next = '/home/ana/.claude/plugins/cache/huddle/huddle/0.6.0';
  assert.equal(newPluginRoot(root, '0.6.0', exists(next)), next);
});

test('works with Windows paths and keeps their separator', () => {
  const root = String.raw`C:\Users\Ana\.claude\plugins\cache\huddle\huddle\0.5.2`;
  const next = String.raw`C:\Users\Ana\.claude\plugins\cache\huddle\huddle\0.6.0`;
  assert.equal(newPluginRoot(root, '0.6.0', exists(next)), next);
  const mixed = 'C:/Users/Ana/.claude/plugins/cache/huddle/huddle/0.5.2/';
  assert.equal(newPluginRoot(mixed, 'v0.6.0', exists('C:/Users/Ana/.claude/plugins/cache/huddle/huddle/0.6.0')), 'C:/Users/Ana/.claude/plugins/cache/huddle/huddle/0.6.0');
});

test('null when that folder does not exist, or the input is not usable', () => {
  const root = '/p/cache/huddle/huddle/0.5.2';
  assert.equal(newPluginRoot(root, '0.6.0', exists()), null);
  assert.equal(newPluginRoot(null, '0.6.0', exists('/p/x')), null);
  assert.equal(newPluginRoot(root, 'latest', exists('/p/cache/huddle/huddle/latest')), null);
  assert.equal(newPluginRoot(root, '../0.6.0', () => true), null);
  assert.equal(newPluginRoot(root, '0.6.0', () => { throw new Error('boom'); }), null);
});
