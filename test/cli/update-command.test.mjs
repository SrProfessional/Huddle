// Issue #81, docs/design.md §17: the `huddle update` command (exit codes, output) and the `setup` line of `huddle doctor`.
// The repo is a real temporary folder (update only works on files); there is never a platform or a network.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { run } from '../../lib/cli/run.mjs';
import { setup } from '../../lib/setup/index.mjs';
import { harness } from './harness.mjs';

const INSTALLED = JSON.parse(readFileSync(new URL('../../.claude-plugin/plugin.json', import.meta.url), 'utf8')).version;
const ANSWERS = { platform: 'github', project: 'acme/app', ai_manager: 'boss', assignees: ['ana'], max_open_per_person: 2 };
const Q = { id: 'progress-issue', since: INSTALLED, key: 'progress_issue', ask: 'Keep the progress Issue up to date?', options: [true, false], default: true, needed: (c) => c.progress_issue === undefined };

/** A CLI context over a real folder. `old`: the setup_version the repo has; `registry`: the questions. */
function repo({ old = '0.4.1', registry = [], setupFirst = true } = {}) {
  const dir = mkdtempSync(path.join(tmpdir(), 'huddle-update-cli-'));
  if (setupFirst) {
    setup(dir, ANSWERS);
    const file = path.join(dir, 'huddle.json');
    writeFileSync(file, JSON.stringify({ ...JSON.parse(readFileSync(file, 'utf8')), setup_version: old }, null, 2));
  }
  const h = harness({ file: null });
  h.ctx.root = dir;
  h.ctx.questions = registry;
  h.ctx.createPlatform = async () => { throw new Error('update must not need a platform'); };
  return { h, dir, config: () => JSON.parse(readFileSync(path.join(dir, 'huddle.json'), 'utf8')), done: () => rmSync(dir, { recursive: true, force: true }) };
}

test('the usage line lists update', async () => {
  const h = harness();
  assert.equal(await run([], h.ctx), 2);
  assert.match(h.errText(), /update \[--check\] \[--dry-run\] \[--json\] \[--answer key=value\.\.\.\]/);
});

test('bad flags are exit 2 with the usage', async () => {
  for (const args of [['--bogus'], ['--answer'], ['--answer', 'novalue'], ['--answer', '=x'], ['stray']]) {
    const { h, done } = repo();
    assert.equal(await run(['update', ...args], h.ctx), 2, args.join(' '));
    assert.match(h.errText(), /^Usage: huddle /);
    done();
  }
});

test('a plain update refreshes and exits 0, with no platform and no login', async () => {
  const { h, config, done } = repo();
  try {
    assert.equal(await run(['update'], h.ctx), 0);
    assert.match(h.text(), /updated/i);
    assert.equal(config().setup_version, INSTALLED);
  } finally { done(); }
});

test('with a pending question and no answer: exit 3, nothing written, the question is printed', async () => {
  const { h, dir, config, done } = repo({ registry: [Q] });
  try {
    const before = readFileSync(path.join(dir, 'huddle.json'), 'utf8');
    assert.equal(await run(['update'], h.ctx), 3);
    assert.match(h.text(), /progress_issue/);
    assert.match(h.text(), /Keep the progress Issue up to date\?/);
    assert.equal(readFileSync(path.join(dir, 'huddle.json'), 'utf8'), before);
    assert.equal(config().setup_version, '0.4.1');
  } finally { done(); }
});

test('--json prints the report; pending questions have id, key, ask, options and default', async () => {
  const { h, done } = repo({ registry: [Q] });
  try {
    assert.equal(await run(['update', '--json'], h.ctx), 3);
    const r = JSON.parse(h.text());
    assert.equal(r.status, 'questions');
    assert.deepEqual(r.pendingQuestions, [{ id: 'progress-issue', key: 'progress_issue', ask: Q.ask, options: [true, false], default: true }]);
    for (const k of ['setupVersion', 'installed', 'written', 'skipped', 'changed', 'notes']) assert.ok(k in r, k);
  } finally { done(); }
  const ok = repo();
  try {
    assert.equal(await run(['update', '--json'], ok.h.ctx), 0);
    const r = JSON.parse(ok.h.text());
    assert.equal(r.status, 'updated');
    assert.deepEqual(r.pendingQuestions, []);
    assert.equal(r.installed, INSTALLED);
  } finally { ok.done(); }
});

test('--answer key=value gives the answer: exit 0, the value is read as JSON', async () => {
  const { h, config, done } = repo({ registry: [Q] });
  try {
    assert.equal(await run(['update', '--answer', 'progress_issue=false'], h.ctx), 0);
    assert.equal(config().progress_issue, false);
    assert.equal(config().setup_version, INSTALLED);
  } finally { done(); }
});

test('--answer for a key that is not a pending question is refused (exit 1) and writes nothing', async () => {
  const { h, dir, done } = repo({ registry: [Q] });
  try {
    const before = readFileSync(path.join(dir, 'huddle.json'), 'utf8');
    assert.equal(await run(['update', '--answer', 'token=ghp_secret'], h.ctx), 1);
    assert.match(h.errText(), /not a pending question/);
    assert.doesNotMatch(h.errText() + h.text(), /ghp_secret/, 'a refused value is never echoed');
    assert.equal(readFileSync(path.join(dir, 'huddle.json'), 'utf8'), before);
  } finally { done(); }
});

test('--check: up to date is exit 0, a pending question or a change is exit 3, and nothing is written', async () => {
  const current = repo({ old: INSTALLED });
  try {
    assert.equal(await run(['update', '--check'], current.h.ctx), 0);
    assert.match(current.h.text(), /up to date/i);
  } finally { current.done(); }
  const asking = repo({ registry: [Q] });
  try {
    assert.equal(await run(['update', '--check'], asking.h.ctx), 3);
    assert.match(asking.h.text(), /progress_issue/);
    assert.equal(asking.config().setup_version, '0.4.1');
  } finally { asking.done(); }
  const stale = repo();
  try {
    writeFileSync(path.join(stale.dir, 'CLAUDE.md'), readFileSync(path.join(stale.dir, 'CLAUDE.md'), 'utf8').replace('Language', 'Idioma'));
    assert.equal(await run(['update', '--check'], stale.h.ctx), 3);
    assert.match(stale.h.text(), /CLAUDE\.md/);
    assert.match(readFileSync(path.join(stale.dir, 'CLAUDE.md'), 'utf8'), /Idioma/);
  } finally { stale.done(); }
});

test('--dry-run prints the change and writes nothing', async () => {
  const { h, config, done } = repo({ registry: [Q] });
  try {
    assert.equal(await run(['update', '--dry-run', '--answer', 'progress_issue=true'], h.ctx), 0);
    assert.match(h.text(), /huddle\.json/);
    assert.equal(config().progress_issue, undefined);
    assert.equal(config().setup_version, '0.4.1');
  } finally { done(); }
});

test('without a huddle.json it fails, exit 1, and says to run /huddle-setup', async () => {
  const { h, dir, done } = repo({ setupFirst: false });
  try {
    assert.equal(await run(['update'], h.ctx), 1);
    assert.match(h.errText(), /\/huddle-setup/);
    assert.deepEqual(readdirSync(dir), []);
  } finally { done(); }
});

// huddle doctor: the `setup` line (the status is canned: doctor reads files only, and these tests have no file system for it).

const healthy = () => harness({ wrap: (a) => ({ ...a, listLabels: async () => ['ready', 'assigned', 'in progress', 'in review', 'blocked', 'needs decision', 'changes requested from AI Manager'] }) });

const doctorLine = async (status) => {
  const h = healthy();
  h.ctx.setupStatus = () => status;
  await run(['doctor'], h.ctx);
  return h.text().split('\n').find((l) => l.includes(' setup:'));
};

test('doctor: setup is up to date', async () => {
  assert.equal(await doctorLine({ state: 'current', setupVersion: '0.4.2', installed: '0.4.2', pending: [], changed: [] }), '✔ setup: set up for 0.4.2 (up to date)');
});

test('doctor: setup needs an update', async () => {
  const line = await doctorLine({ state: 'needs', setupVersion: '0.4.1', installed: '0.4.2', pending: [], changed: ['CLAUDE.md'] });
  assert.equal(line, '⚠ setup: set up for 0.4.1, Huddle is 0.4.2: run /huddle-update on a branch');
});

test('doctor: only the version differs, nothing would change', async () => {
  const line = await doctorLine({ state: 'version-only', setupVersion: '0.4.1', installed: '0.4.2', pending: [], changed: [] });
  assert.match(line, /^✔ setup: set up for 0\.4\.1, Huddle is 0\.4\.2/);
  assert.match(line, /nothing to refresh/);
});

test('doctor: a repo set up before setup_version existed says so', async () => {
  const line = await doctorLine({ state: 'needs', setupVersion: null, installed: '0.4.2', pending: [], changed: [] });
  assert.match(line, /^⚠ setup: set up for an older version, Huddle is 0\.4\.2: run \/huddle-update/);
});

test('doctor has no setup line when it cannot read the repo, and never fails because of it', async () => {
  const h = healthy();
  h.ctx.setupStatus = () => null;
  assert.equal(await run(['doctor'], h.ctx), 0);
  assert.doesNotMatch(h.text(), / setup:/);
  const boom = healthy();
  boom.ctx.setupStatus = () => { throw new Error('boom'); };
  assert.equal(await run(['doctor'], boom.ctx), 0);
  assert.doesNotMatch(boom.text(), / setup:/);
});
