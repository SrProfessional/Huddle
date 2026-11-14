// Issue #109, docs/design.md §21: `staging_branch` is asked by setup and by update (id staging-branch, since 0.8.0). Nothing reads it yet.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { setup } from '../../lib/setup/index.mjs';
import { update } from '../../lib/setup/update.mjs';
import { QUESTIONS, pendingQuestions, describe } from '../../lib/setup/questions.mjs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const CLI = fileURLToPath(new URL('../../lib/setup/cli.mjs', import.meta.url));

const ANSWERS = { platform: 'github', project: 'acme/app', ai_manager: 'boss', assignees: ['ana'], labels_job: 'hourly' };
const INSTALLED = JSON.parse(readFileSync(new URL('../../.claude-plugin/plugin.json', import.meta.url), 'utf8')).version;
const inTemp = (fn) => {
  const dir = mkdtempSync(path.join(tmpdir(), 'huddle-staging-'));
  try { return fn(dir); } finally { rmSync(dir, { recursive: true, force: true }); }
};
const readConfig = (dir) => JSON.parse(readFileSync(path.join(dir, 'huddle.json'), 'utf8'));
const patch = (dir, p, drop = []) => {
  const c = { ...readConfig(dir), ...p };
  for (const k of drop) delete c[k];
  writeFileSync(path.join(dir, 'huddle.json'), `${JSON.stringify(c, null, 2)}\n`);
};
/** A repo set up under 0.7.0: no staging_branch key. */
const oldRepo = (dir) => { setup(dir, { ...ANSWERS, staging_branch: '' }); patch(dir, { setup_version: '0.7.0' }, ['staging_branch']); };

test('setup writes the staging branch given, and "none" as ""', () => {
  inTemp((dir) => { setup(dir, { ...ANSWERS, staging_branch: 'staging' }); assert.equal(readConfig(dir).staging_branch, 'staging'); });
  inTemp((dir) => { setup(dir, { ...ANSWERS, staging_branch: 'none' }); assert.equal(readConfig(dir).staging_branch, ''); });
  inTemp((dir) => { setup(dir, { ...ANSWERS, staging_branch: '' }); assert.equal(readConfig(dir).staging_branch, ''); });
});

test('setup with a bad staging branch refuses, naming the field, and writes nothing', () => inTemp((dir) => {
  assert.throws(() => setup(dir, { ...ANSWERS, staging_branch: 'main' }), /"staging_branch" must not be the same as "default_branch"/);
  assert.throws(() => setup(dir, { ...ANSWERS, staging_branch: 'a b' }), /"staging_branch"/);
  assert.throws(() => readFileSync(path.join(dir, 'huddle.json')), /ENOENT/);
}));

// lib/setup/cli.mjs runs setup in the current folder when it is imported, so it is only ever run here as a child process in a temp folder.
test('--staging-branch works on the command line (and none is stored as "")', () => {
  for (const [given, stored] of [['qa', 'qa'], ['none', '']]) {
    inTemp((dir) => {
      execFileSync(process.execPath, [CLI, '--platform', 'github', '--project', 'acme/app', '--ai-manager', 'boss', '--staging-branch', given], { cwd: dir, stdio: 'pipe' });
      assert.equal(readConfig(dir).staging_branch, stored);
    });
  }
});

test('an answer given before is kept when setup runs again, and an unknown key is still refused', () => inTemp((dir) => {
  setup(dir, { ...ANSWERS, staging_branch: 'qa' });
  setup(dir, {});
  assert.equal(readConfig(dir).staging_branch, 'qa');
  setup(dir, { ...ANSWERS });
  assert.equal(readConfig(dir).staging_branch, 'qa');
  assert.throws(() => setup(dir, { token: 'x' }), /does not take "token"/);
}));

test('the registry has the staging-branch question', () => {
  assert.ok(QUESTIONS.length >= 1);
  const q = QUESTIONS.find((x) => x.id === 'staging-branch');
  assert.deepEqual([q.id, q.key, q.default, q.since], ['staging-branch', 'staging_branch', '', '0.8.0']);
  assert.match(q.ask, /staging \(or QA\) branch/);
  assert.match(q.ask, /or none/);
  assert.equal(describe(q).default, '');
});

test('update: a repo without the key has the question pending once; a name or "none" writes the key', () => {
  for (const [given, stored] of [['staging', 'staging'], ['none', ''], ['', '']]) {
    inTemp((dir) => {
      oldRepo(dir);
      assert.deepEqual(pendingQuestions(readConfig(dir)).map((q) => q.id), ['staging-branch']);
      const asked = update(dir, {});
      assert.equal(asked.status, 'questions');
      assert.deepEqual(asked.pendingQuestions.map((q) => q.key), ['staging_branch']);
      const done = update(dir, { answers: { staging_branch: given } });
      assert.equal(done.status, 'updated');
      assert.equal(readConfig(dir).staging_branch, stored);
      assert.equal(readConfig(dir).setup_version, INSTALLED);
      assert.deepEqual(pendingQuestions(readConfig(dir)), [], 'not pending any more');
      assert.deepEqual(update(dir, {}).pendingQuestions, []);
    });
  }
});

test('update: a repo that already has the key is not asked, and a bad answer is refused with nothing written', () => {
  inTemp((dir) => {
    oldRepo(dir);
    patch(dir, { staging_branch: '' });
    assert.deepEqual(pendingQuestions(readConfig(dir)), []);
  });
  inTemp((dir) => {
    oldRepo(dir);
    const before = readFileSync(path.join(dir, 'huddle.json'), 'utf8');
    assert.throws(() => update(dir, { answers: { staging_branch: 'main' } }), /"staging_branch" must not be the same as "default_branch"/);
    assert.throws(() => update(dir, { answers: { staging_branch: '-x' } }), /"staging_branch"/);
    assert.equal(readFileSync(path.join(dir, 'huddle.json'), 'utf8'), before);
  });
});
