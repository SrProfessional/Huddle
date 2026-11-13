// Issue #81, docs/design.md §17: `huddle update` brings a set-up repo to the installed version and asks only the questions the repo has not answered.
// These tests use a fake registry; the real one (staging-branch, 0.8.0) is covered in staging-branch.test.mjs.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { setup } from '../../lib/setup/index.mjs';
import { update, setupStatus } from '../../lib/setup/update.mjs';
import { QUESTIONS, pendingQuestions, compareVersions } from '../../lib/setup/questions.mjs';

const INSTALLED = JSON.parse(readFileSync(new URL('../../.claude-plugin/plugin.json', import.meta.url), 'utf8')).version;
const ANSWERS = { platform: 'github', project: 'acme/app', ai_manager: 'boss', assignees: ['ana', 'luis'], max_open_per_person: 2, staging_branch: '' }; // staging_branch answered: the real registry's 0.8.0 question is not pending
const Q = { id: 'progress-issue', since: INSTALLED, key: 'progress_issue', ask: 'Keep the «Huddle progress» Issue up to date?', options: [true, false], default: true, needed: (c) => c.progress_issue === undefined };
const REGISTRY = [Q];

const inTemp = (fn) => {
  const dir = mkdtempSync(path.join(tmpdir(), 'huddle-update-'));
  try { return fn(dir); } finally { rmSync(dir, { recursive: true, force: true }); }
};
const readConfig = (dir) => JSON.parse(readFileSync(path.join(dir, 'huddle.json'), 'utf8'));
const writeConfig = (dir, patch, drop = []) => {
  const config = { ...readConfig(dir), ...patch };
  for (const k of drop) delete config[k];
  writeFileSync(path.join(dir, 'huddle.json'), `${JSON.stringify(config, null, 2)}\n`);
};
/** Every file of the folder with its text: to prove that a command wrote nothing. */
const snapshot = (dir, rel = '') => Object.fromEntries(readdirSync(path.join(dir, rel)).flatMap((name) => {
  const p = path.join(rel, name);
  return statSync(path.join(dir, p)).isDirectory() ? Object.entries(snapshot(dir, p)) : [[p, readFileSync(path.join(dir, p), 'utf8')]];
}));
/** A repo set up long ago: the answers, then setup_version put back to `old`. */
const oldRepo = (dir, old = '0.4.1') => { setup(dir, ANSWERS); writeConfig(dir, { setup_version: old }); };
const spoilBlock = (dir) => writeFileSync(path.join(dir, 'CLAUDE.md'), readFileSync(path.join(dir, 'CLAUDE.md'), 'utf8').replace('Language', 'Idioma'));

test('the real registry has only the staging-branch question (0.8.0); the rest of this file uses a fake one', () => {
  assert.deepEqual(QUESTIONS.map((q) => q.id), ['staging-branch']);
});

test('compareVersions orders major.minor.patch numerically', () => {
  assert.equal(compareVersions('0.4.2', '0.4.1'), 1);
  assert.equal(compareVersions('0.4.10', '0.4.9'), 1);
  assert.equal(compareVersions('1.0.0', '0.99.99'), 1);
  assert.equal(compareVersions('0.4.2', '0.4.2'), 0);
  assert.equal(compareVersions('0.0.0', '0.4.2'), -1);
});

test('a question is pending only when since is newer than setup_version and its key is unset', () => {
  const base = { platform: 'github', project: 'a/b', ai_manager: 'x' };
  assert.deepEqual(pendingQuestions({ ...base, setup_version: '0.4.1' }, REGISTRY).map((q) => q.id), ['progress-issue']);
  assert.deepEqual(pendingQuestions({ ...base, setup_version: INSTALLED }, REGISTRY), [], 'the repo is already at that release');
  assert.deepEqual(pendingQuestions({ ...base, setup_version: '9.0.0' }, REGISTRY), [], 'a repo ahead of the question');
});

test('an answered key is never asked again, whatever the version', () => {
  const config = { platform: 'github', project: 'a/b', ai_manager: 'x', setup_version: '0.0.1', progress_issue: false };
  assert.deepEqual(pendingQuestions(config, REGISTRY), []);
});

test('a missing setup_version counts as 0.0.0', () => {
  const config = { platform: 'github', project: 'a/b', ai_manager: 'x' };
  assert.deepEqual(pendingQuestions(config, [{ ...Q, since: '0.0.1' }]).map((q) => q.id), ['progress-issue']);
});

test('with pending questions and no answers update writes nothing and lists the questions', () => inTemp((dir) => {
  oldRepo(dir);
  const before = snapshot(dir);
  const r = update(dir, { registry: REGISTRY });
  assert.equal(r.status, 'questions');
  assert.deepEqual(r.pendingQuestions, [{ id: 'progress-issue', key: 'progress_issue', ask: Q.ask, options: [true, false], default: true }]);
  assert.deepEqual(snapshot(dir), before);
}));

test('with every answer given the file gets them and the new setup_version', () => inTemp((dir) => {
  oldRepo(dir);
  const r = update(dir, { registry: REGISTRY, answers: { progress_issue: false } });
  assert.equal(r.status, 'updated');
  const config = readConfig(dir);
  assert.equal(config.progress_issue, false);
  assert.equal(config.setup_version, INSTALLED);
  assert.equal(config.project, 'acme/app', 'keys it was not given stay');
  assert.deepEqual(config.assignees, ['ana', 'luis']);
  assert.deepEqual(update(dir, { registry: REGISTRY }).pendingQuestions, [], 'and it is not asked again');
}));

test('an answer for only some of the pending questions still changes nothing', () => inTemp((dir) => {
  oldRepo(dir);
  const two = [Q, { ...Q, id: 'max-open', key: 'default_branch', options: undefined, default: 'main', needed: (c) => c.default_branch === undefined }];
  const before = snapshot(dir);
  const r = update(dir, { registry: two, answers: { progress_issue: true } });
  assert.equal(r.status, 'questions');
  assert.deepEqual(r.pendingQuestions.map((q) => q.key), ['default_branch']);
  assert.deepEqual(snapshot(dir), before);
}));

test('an unknown, secret-looking or not-pending key is refused and nothing is written', () => inTemp((dir) => {
  oldRepo(dir);
  const before = snapshot(dir);
  for (const answers of [{ token: 'ghp_x' }, { HUDDLE_TOKEN: 'x' }, { ai_manager: 'someone-else' }, { progress_issue: false, extra: 1 }]) {
    assert.throws(() => update(dir, { registry: REGISTRY, answers }), /not a pending question/);
  }
  assert.deepEqual(snapshot(dir), before);
}));

test('a value that fails the schema is refused and nothing is written', () => inTemp((dir) => {
  oldRepo(dir);
  const before = snapshot(dir);
  assert.throws(() => update(dir, { registry: REGISTRY, answers: { progress_issue: 'maybe' } }), /progress_issue/);
  assert.deepEqual(snapshot(dir), before);
}));

test('--check and --dry-run write nothing, and report what would change', () => inTemp((dir) => {
  oldRepo(dir);
  spoilBlock(dir);
  const before = snapshot(dir);
  const check = update(dir, { check: true });
  assert.equal(check.status, 'would-change');
  assert.ok(check.changed.includes('CLAUDE.md'));
  const dry = update(dir, { dryRun: true, registry: REGISTRY, answers: { progress_issue: true } });
  assert.equal(dry.status, 'would-change');
  assert.ok(dry.changed.includes('huddle.json'), 'the answer and the version are part of the change');
  assert.deepEqual(snapshot(dir), before);
}));

test('--check on a repo that needs nothing says up-to-date', () => inTemp((dir) => {
  setup(dir, ANSWERS);
  const before = snapshot(dir);
  const r = update(dir, { check: true });
  assert.equal(r.status, 'up-to-date');
  assert.deepEqual(r.pendingQuestions, []);
  assert.deepEqual(snapshot(dir), before);
}));

test('no huddle.json fails and names /huddle-setup', () => inTemp((dir) => {
  assert.throws(() => update(dir), /\/huddle-setup/);
  assert.deepEqual(readdirSync(dir), []);
}));

test('an invalid huddle.json fails without writing', () => inTemp((dir) => {
  writeFileSync(path.join(dir, 'huddle.json'), '{ nope');
  assert.throws(() => update(dir), /huddle\.json/);
  assert.equal(readFileSync(path.join(dir, 'huddle.json'), 'utf8'), '{ nope');
}));

test('a template the project edited is kept and reported, the rest is refreshed', () => inTemp((dir) => {
  oldRepo(dir);
  const edited = path.join(dir, '.github', 'ISSUE_TEMPLATE', 'task.md');
  writeFileSync(edited, 'our own task template\n');
  spoilBlock(dir);
  const r = update(dir);
  assert.equal(readFileSync(edited, 'utf8'), 'our own task template\n');
  assert.ok(r.skipped.includes('.github/ISSUE_TEMPLATE/task.md'));
  assert.match(r.notes.join('\n'), /edited by the project/);
  assert.match(readFileSync(path.join(dir, 'CLAUDE.md'), 'utf8'), /Language/, 'the block is the current one');
  assert.equal(readConfig(dir).setup_version, INSTALLED);
}));

test('a plain update keeps every other key of huddle.json, even ones it does not own', () => inTemp((dir) => {
  oldRepo(dir);
  writeConfig(dir, { labels: { ready: 'listo' }, progress_issue: false });
  update(dir);
  const config = readConfig(dir);
  assert.deepEqual(config.labels, { ready: 'listo' });
  assert.equal(config.progress_issue, false);
}));

test('setup writes setup_version, and keeps the old one while a question is pending', () => inTemp((dir) => {
  setup(dir, ANSWERS);
  assert.equal(readConfig(dir).setup_version, INSTALLED);
  writeConfig(dir, { setup_version: '0.4.1' });
  setup(dir, {}, { registry: REGISTRY });
  assert.equal(readConfig(dir).setup_version, '0.4.1', 'the question is not hidden by a plain refresh');
  setup(dir, {});
  assert.equal(readConfig(dir).setup_version, INSTALLED);
}));

test('setup still refuses setup_version as an answer', () => inTemp((dir) => {
  assert.throws(() => setup(dir, { ...ANSWERS, setup_version: '9.9.9' }), /setup_version/);
}));

test('setupStatus: up to date, only the version differs, and needs an update', () => inTemp((dir) => {
  setup(dir, ANSWERS);
  const now = setupStatus(dir);
  assert.equal(now.state, 'current');
  assert.equal(now.setupVersion, INSTALLED);
  assert.equal(now.installed, INSTALLED);
  writeConfig(dir, { setup_version: '0.4.1' });
  const only = setupStatus(dir);
  assert.equal(only.state, 'version-only');
  assert.equal(only.setupVersion, '0.4.1');
  assert.equal(setupStatus(dir, { registry: REGISTRY }).state, 'needs', 'a pending question needs an update too');
  assert.deepEqual(setupStatus(dir, { registry: REGISTRY }).pending, ['progress-issue']);
  spoilBlock(dir);
  assert.equal(setupStatus(dir).state, 'needs');
}));

test('setupStatus on a repo without a usable huddle.json answers null', () => inTemp((dir) => {
  assert.equal(setupStatus(dir), null);
}));

// The skill: the text the session follows.

const readSkill = (name) => readFileSync(new URL(`../../skills/${name}/SKILL.md`, import.meta.url), 'utf8');

test('the update skill runs huddle update --json first, before it asks anything', () => {
  const text = readSkill('huddle-update');
  const run = text.search(/huddle"? update --json/);
  const ask = text.search(/^## (4\. )?(Ask|Questions)/m);
  assert.ok(run >= 0, 'it runs `huddle update --json`');
  assert.ok(ask >= 0, 'and has a section for the questions');
  assert.ok(run < ask, 'the command comes before the questions');
});

test('the update skill asks only the pending questions, with the default, then answers with --answer', () => {
  const text = readSkill('huddle-update');
  assert.match(text, /only (the )?pending/i);
  assert.match(text, /pendingQuestions/);
  assert.match(text, /default/i);
  assert.match(text, /--answer/);
  assert.match(text, /exit(s)? (code )?3/i);
});

test('the update skill never asks for a token, and says to commit on a branch and open a PR/MR', () => {
  const text = readSkill('huddle-update');
  assert.match(text, /never ask(s)? for a token/i);
  assert.match(text, /branch/i);
  assert.match(text, /PR\/MR/);
});

test('the update skill reports what changed: the block, the templates written and the ones kept', () => {
  const text = readSkill('huddle-update');
  assert.match(text, /block/i);
  assert.match(text, /skipped|kept/i);
  assert.match(text, /notes/i);
});

test('the setup skill sends an already-configured repo to /huddle-update', () => {
  assert.match(readSkill('huddle-setup'), /\/huddle-update/);
});
