// Issue #325, docs/design.md §20: a huddle.json written by a newer Huddle warns an older one instead of breaking it.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { loadConfig } from '../../lib/cli/config.mjs';
import { setup } from '../../lib/setup/index.mjs';
import { setupStatus } from '../../lib/setup/update.mjs';

const BASE = { platform: 'github', project: 'a/b', ai_manager: 'sr' };
const load = (obj, options) => loadConfig('/repo', () => JSON.stringify(obj), null, options);
const opts = (installed) => { const seen = []; return { installed, warn: (w) => seen.push(w), seen }; };

test('a newer setup_version with an unknown key loads, drops the key and reports it once', () => {
  const o = opts('0.9.5');
  const c = load({ ...BASE, setup_version: '1.0.3', future_key: 'es' }, o);
  assert.equal(c.coach, 'sr');
  assert.equal('future_key' in c, false);
  assert.equal(o.seen.length, 1);
  assert.deepEqual(o.seen[0], { setupVersion: '1.0.3', installed: '0.9.5', keys: ['future_key'] });
  assert.deepEqual(c.newer, o.seen[0]);
});

test('a nested unknown key of a newer file is ignored too, and named by its path', () => {
  const o = opts('0.9.5');
  const c = load({ ...BASE, setup_version: '1.0.3', labels: { nope: 'x' } }, o);
  assert.equal(c.labels.nope, undefined);
  assert.deepEqual(o.seen[0].keys, ['labels.nope']);
});

test('an unknown key with a setup_version that is not newer fails with the same text as before', () => {
  for (const setup_version of ['0.9.5', '0.9.4', undefined]) {
    const o = opts('0.9.5');
    assert.throws(() => load({ ...BASE, setup_version, future_key: 'es' }, o), (e) => e.message === 'huddle.json: "future_key" is not allowed', String(setup_version));
    assert.equal(o.seen.length, 0);
  }
  assert.throws(() => load({ ...BASE, future_key: 'es' }), /^Error: huddle\.json: "future_key" is not allowed$/);
});

test('an odd setup_version is never newer', () => {
  for (const setup_version of ['9.9', 'x', '9.9.9-beta', 5, null, '']) {
    assert.throws(() => load({ ...BASE, setup_version, future_key: 'es' }, opts('0.9.5')), /"future_key" is not allowed/, String(setup_version));
  }
  assert.throws(() => load({ ...BASE, setup_version: '9.9.9', future_key: 'es' }, opts(null)), /"future_key" is not allowed/, 'unknown installed version');
  assert.throws(() => load({ ...BASE, setup_version: '9.9.9', future_key: 'es' }, opts('oops')), /"future_key" is not allowed/);
});

test('other validation stays strict even when the file is newer', () => {
  const newer = { setup_version: '1.0.3', future_key: 'es' };
  assert.throws(() => load({ ...BASE, ...newer, max_open_per_person: 'two' }, opts('0.9.5')), /"max_open_per_person" must be of type integer/);
  assert.throws(() => load({ platform: 'github', ai_manager: 'sr', ...newer }, opts('0.9.5')), /"project" is required/);
  assert.throws(() => load({ platform: 'github', project: 'a/b', ...newer }, opts('0.9.5')), /"coach" is required/);
  // the unknown key is still reported with the other errors, as today
  assert.throws(() => load({ ...BASE, ...newer, platform: 'bitbucket' }, opts('0.9.5')), /"platform" must be one of[\s\S]*"future_key" is not allowed/);
});

test('a newer file with no unknown key loads quietly', () => {
  const o = opts('0.9.5');
  const c = load({ ...BASE, setup_version: '1.0.3' }, o);
  assert.equal(o.seen.length, 0);
  assert.equal('newer' in c, false);
});

test('without options nothing changes (the strictness of every old caller)', () => {
  assert.throws(() => load({ ...BASE, setup_version: '9.9.9', future_key: 'es' }), /"future_key" is not allowed/);
});

// docs/design.md §17, doctor's setup line: the states it is built from.
const inTemp = (fn) => {
  const dir = mkdtempSync(path.join(tmpdir(), 'huddle-newer-'));
  try { return fn(dir); } finally { rmSync(dir, { recursive: true, force: true }); }
};
const ANSWERS = { platform: 'github', project: 'acme/app', ai_manager: 'boss', assignees: [], max_open_per_person: 2, staging_branch: '', language: '', labels_job: 'hourly' };

test('setupStatus: a repo set up for a newer Huddle is «newer», not «needs»', () => inTemp((dir) => {
  setup(dir, ANSWERS);
  const file = path.join(dir, 'huddle.json');
  writeFileSync(file, JSON.stringify({ ...JSON.parse(JSON.stringify(ANSWERS)), setup_version: '99.0.0' }));
  const s = setupStatus(dir);
  assert.equal(s.state, 'newer');
  assert.equal(s.setupVersion, '99.0.0');
  writeFileSync(file, JSON.stringify({ ...ANSWERS, setup_version: '99.0' }));
  assert.notEqual(setupStatus(dir).state, 'newer', 'an odd version is not newer');
}));

test('setupStatus: equal versions say «needs» only because files differ, and lists them', () => inTemp((dir) => {
  setup(dir, ANSWERS);
  assert.equal(setupStatus(dir).state, 'current');
  writeFileSync(path.join(dir, 'CLAUDE.md'), '# Mine\n\nno Huddle block here\n');
  const s = setupStatus(dir);
  assert.equal(s.setupVersion, s.installed);
  assert.equal(s.state, 'needs');
  assert.deepEqual(s.pending, []);
  assert.ok(s.changed.includes('CLAUDE.md'));
}));
