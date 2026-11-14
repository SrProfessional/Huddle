// Issue #121 (H52), docs/design.md §23: `labels_job` in huddle.json (sessions | hourly | events). Fakes only: files in temp folders.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { setup } from '../../lib/setup/index.mjs';
import { update } from '../../lib/setup/update.mjs';
import { QUESTIONS, pendingQuestions, describe } from '../../lib/setup/questions.mjs';
import { loadConfig } from '../../lib/cli/config.mjs';
import { run } from '../../lib/cli/run.mjs';
import { harness, CONFIG } from '../cli/harness.mjs';

const CLI = fileURLToPath(new URL('../../lib/setup/cli.mjs', import.meta.url));
const tpl = (rel) => readFileSync(fileURLToPath(new URL(`../../templates/${rel}`, import.meta.url)), 'utf8');
const GH_FILE = '.github/workflows/huddle-labels.yml';
const GL_FILE = 'huddle-labels.gitlab-ci.yml';
const GH = { platform: 'github', project: 'acme/app', ai_manager: 'boss', assignees: ['ana'] };
const GL = { platform: 'gitlab', project: 'team/app', ai_manager: 'boss', assignees: ['ana'] };
const inTemp = (fn) => {
  const dir = mkdtempSync(path.join(tmpdir(), 'huddle-labelsjob-'));
  try { return fn(dir); } finally { rmSync(dir, { recursive: true, force: true }); }
};
const read = (dir, rel) => readFileSync(path.join(dir, rel), 'utf8');
const readConfig = (dir) => JSON.parse(read(dir, 'huddle.json'));
const patch = (dir, p, drop = []) => {
  const c = { ...readConfig(dir), ...p };
  for (const k of drop) delete c[k];
  writeFileSync(path.join(dir, 'huddle.json'), `${JSON.stringify(c, null, 2)}\n`);
};
/** The `on:` block of a workflow: the lines from `on:` up to the next top-level key. */
const onBlock = (text) => /^on:\n(?:(?:[ \t].*)?\n)*?(?=\S)/m.exec(text)[0];
/** The `rules:` list of the GitLab job. */
const rules = (text) => /^ {2}rules:\n((?: {4}.*\n)+)/m.exec(text)[1];
/** Everything but the trigger block: it must be the same in every rendering. */
const withoutOn = (text) => text.replace(onBlock(text), '');
const withoutRules = (text) => text.replace(rules(text), '');

// --- config ----------------------------------------------------------------------------------------------------------------------------

const cfg = (extra) => loadConfig('/x', () => JSON.stringify({ platform: 'github', project: 'a/b', ai_manager: 'boss', ...extra }));

test('config: labels_job absent loads as hourly, the three values load, anything else is refused naming the field', () => {
  assert.equal(cfg({}).labels_job, 'hourly');
  for (const v of ['sessions', 'hourly', 'events']) assert.equal(cfg({ labels_job: v }).labels_job, v);
  for (const v of ['always', '', 3, true]) assert.throws(() => cfg({ labels_job: v }), /"labels_job"/);
});

// --- templates rendered by setup -------------------------------------------------------------------------------------------------------

test('GitHub events: the on: block is today\'s template, and the whole file equals it', () => inTemp((dir) => {
  setup(dir, { ...GH, labels_job: 'events' });
  assert.equal(read(dir, GH_FILE), tpl('github/workflows/huddle-labels.yml'));
  assert.match(onBlock(read(dir, GH_FILE)), /issues:[\s\S]*issue_comment:[\s\S]*pull_request:[\s\S]*cron: '\*\/30 \* \* \* \*'/);
}));

test('GitHub hourly (and the default): only schedule 17 * * * * and workflow_dispatch', () => {
  for (const answers of [{ ...GH, labels_job: 'hourly' }, GH]) {
    inTemp((dir) => {
      setup(dir, answers);
      const on = onBlock(read(dir, GH_FILE));
      assert.match(on, /schedule:\n\s+- cron: '17 \* \* \* \*'/);
      assert.match(on, /workflow_dispatch:/);
      for (const t of ['issues:', 'issue_comment:', 'pull_request:', 'push:', '\\*/30']) assert.doesNotMatch(on, new RegExp(t));
      assert.deepEqual(on.split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('#')), ['on:', 'schedule:', "- cron: '17 * * * *'", 'workflow_dispatch:']);
    });
  }
});

test('GitHub sessions writes no workflow file; the rest of setup is unchanged', () => inTemp((dir) => {
  const r = setup(dir, { ...GH, labels_job: 'sessions' });
  assert.equal(existsSync(path.join(dir, GH_FILE)), false);
  assert.ok(!r.written.includes(GH_FILE));
  assert.ok(existsSync(path.join(dir, '.github/pull_request_template.md')));
}));

test('GitHub: permissions, concurrency, HUDDLE_REF and the steps are the same in every rendering', () => {
  const texts = ['events', 'hourly'].map((m) => inTemp((dir) => { setup(dir, { ...GH, labels_job: m }); return read(dir, GH_FILE); }));
  assert.equal(withoutOn(texts[0]), withoutOn(texts[1]));
  assert.match(texts[1], /^permissions:[\s\S]*^concurrency:\n {2}group: huddle-labels[\s\S]*HUDDLE_REF: main[\s\S]*huddle\/bin\/huddle" labels/m);
});

test('GitLab events: the rules are today\'s (schedule and merge_request_event), and the whole file equals the template', () => inTemp((dir) => {
  setup(dir, { ...GL, labels_job: 'events' });
  assert.equal(read(dir, GL_FILE), tpl('gitlab/huddle-labels.gitlab-ci.yml'));
  assert.deepEqual(rules(read(dir, GL_FILE)).split('\n').filter(Boolean).map((l) => l.trim()), ['- if: $CI_PIPELINE_SOURCE == "schedule"', '- if: $CI_PIPELINE_SOURCE == "merge_request_event"']);
}));

test('GitLab hourly (and the default): only the schedule rule and a web rule', () => {
  for (const answers of [{ ...GL, labels_job: 'hourly' }, GL]) {
    inTemp((dir) => {
      setup(dir, answers);
      const text = read(dir, GL_FILE);
      assert.deepEqual(rules(text).split('\n').filter(Boolean).map((l) => l.trim()), ['- if: $CI_PIPELINE_SOURCE == "schedule"', '- if: $CI_PIPELINE_SOURCE == "web"']);
      assert.doesNotMatch(text.split('\n').filter((l) => !l.trim().startsWith('#')).join('\n'), /merge_request_event/);
    });
  }
});

test('GitLab sessions writes no job file and no include; the steps, resource_group and HUDDLE_REF are the same in every rendering', () => {
  inTemp((dir) => {
    const r = setup(dir, { ...GL, labels_job: 'sessions' });
    assert.equal(existsSync(path.join(dir, GL_FILE)), false);
    assert.equal(existsSync(path.join(dir, '.gitlab-ci.yml')), false);
    assert.ok(!r.notes.some((n) => /schedule/i.test(n) && /cron/i.test(n)));
  });
  const texts = ['events', 'hourly'].map((m) => inTemp((dir) => { setup(dir, { ...GL, labels_job: m }); return read(dir, GL_FILE); }));
  assert.equal(withoutRules(texts[0]), withoutRules(texts[1]));
  assert.match(texts[1], /resource_group: huddle-labels/);
  assert.match(texts[1], /HUDDLE_REF: main/);
});

test('GitLab: the file says the interval is a project setting, with the cron of each mode; the note names the cron of the mode asked', () => {
  const comments = tpl('gitlab/huddle-labels.gitlab-ci.yml').split('\n').filter((l) => l.trim().startsWith('#')).join('\n');
  assert.match(comments, /17 \* \* \* \*/);
  assert.match(comments, /\*\/10 \* \* \* \*/);
  assert.match(comments, /CI\/CD > Schedules/);
  inTemp((dir) => assert.ok(setup(dir, { ...GL, labels_job: 'hourly' }).notes.some((n) => /17 \* \* \* \*/.test(n))));
  inTemp((dir) => assert.ok(setup(dir, { ...GL, labels_job: 'events' }).notes.some((n) => /\*\/10 \* \* \* \*/.test(n))));
});

test('the report says what the setting asks for, one line', () => {
  for (const [m, re] of [['sessions', /sessions/], ['hourly', /hourly/], ['events', /events/]]) {
    inTemp((dir) => assert.equal(setup(dir, { ...GH, labels_job: m }).notes.filter((n) => /^Labels job:/.test(n) && re.test(n)).length, 1));
  }
});

test('an edited labels file is kept, reported as skipped, with the way to get the new one', () => inTemp((dir) => {
  setup(dir, { ...GH, labels_job: 'events' });
  const mine = `${read(dir, GH_FILE)}# our own note\n`;
  writeFileSync(path.join(dir, GH_FILE), mine);
  const r = setup(dir, { labels_job: 'hourly' });
  assert.equal(read(dir, GH_FILE), mine);
  assert.ok(r.skipped.includes(GH_FILE));
  assert.ok(r.notes.some((n) => n.includes(GH_FILE) && /Delete one and run setup again/.test(n)));
}));

test('changing the mode of an unedited file rewrites its triggers', () => inTemp((dir) => {
  setup(dir, { ...GH, labels_job: 'events' });
  assert.match(read(dir, GH_FILE), /issue_comment:/);
  setup(dir, { labels_job: 'hourly' });
  assert.doesNotMatch(read(dir, GH_FILE), /issue_comment:/);
  setup(dir, { labels_job: 'events' });
  assert.equal(read(dir, GH_FILE), tpl('github/workflows/huddle-labels.yml'));
}));

test('moving to sessions leaves the old file alone and says to delete it', () => inTemp((dir) => {
  setup(dir, { ...GH, labels_job: 'events' });
  const r = setup(dir, { labels_job: 'sessions' });
  assert.ok(existsSync(path.join(dir, GH_FILE)));
  assert.ok(r.notes.some((n) => n.includes(GH_FILE) && /delete/i.test(n)));
}));

// --- setup answers and update ----------------------------------------------------------------------------------------------------------

test('setup writes the answer, rejects a bad one naming the field, and keeps an answer given before', () => inTemp((dir) => {
  setup(dir, { ...GH, labels_job: 'events' });
  assert.equal(readConfig(dir).labels_job, 'events');
  setup(dir, {}); // run again with no answer: the earlier one stays
  assert.equal(readConfig(dir).labels_job, 'events');
  assert.throws(() => setup(dir, { labels_job: 'always' }), /"labels_job"/);
}));

test('--labels-job works on the command line', () => {
  for (const mode of ['sessions', 'hourly', 'events']) {
    inTemp((dir) => {
      execFileSync(process.execPath, [CLI, '--platform', 'github', '--project', 'acme/app', '--ai-manager', 'boss', '--labels-job', mode], { cwd: dir, stdio: 'pipe' });
      assert.equal(readConfig(dir).labels_job, mode);
    });
  }
});

test('the question is in the registry, since 0.8.0, needed only while the key is absent', () => {
  const q = QUESTIONS.find((x) => x.id === 'labels-job');
  assert.ok(q);
  assert.equal(q.key, 'labels_job');
  assert.equal(q.default, 'hourly');
  assert.equal(q.since, '0.8.0');
  assert.equal(q.needed({}), true);
  assert.equal(q.needed({ labels_job: 'sessions' }), false);
  assert.match(describe(q).ask, /sessions/);
  assert.match(describe(q).ask, /hourly/);
  assert.match(describe(q).ask, /events/);
  assert.deepEqual(pendingQuestions({ setup_version: '0.7.0' }).map((x) => x.id).filter((id) => id === 'labels-job'), ['labels-job']);
});

/** A repo set up under 0.7.0: no staging_branch and no labels_job. */
const oldRepo = (dir, platform = GH) => { setup(dir, { ...platform, staging_branch: '', labels_job: 'events' }); patch(dir, { setup_version: '0.7.0' }, ['staging_branch', 'labels_job']); };

test('update: a repo with no labels_job has the question pending once; answering writes it and refreshes the file', () => inTemp((dir) => {
  oldRepo(dir);
  const first = update(dir, { answers: { staging_branch: '' } });
  assert.equal(first.status, 'questions');
  assert.deepEqual(first.pendingQuestions.map((q) => q.id), ['labels-job']);
  const done = update(dir, { answers: { staging_branch: '', labels_job: 'hourly' } });
  assert.equal(done.status, 'updated');
  assert.equal(readConfig(dir).labels_job, 'hourly');
  assert.doesNotMatch(read(dir, GH_FILE), /issue_comment:/);
  assert.ok(done.changed.includes(GH_FILE));
  const again = update(dir, { check: true });
  assert.equal(again.status, 'up-to-date');
  assert.deepEqual(again.pendingQuestions, []);
}));

test('update: an edited labels file is kept and reported when the answer changes the triggers', () => inTemp((dir) => {
  oldRepo(dir);
  const mine = `${read(dir, GH_FILE)}# ours\n`;
  writeFileSync(path.join(dir, GH_FILE), mine);
  const done = update(dir, { answers: { staging_branch: '', labels_job: 'hourly' } });
  assert.equal(read(dir, GH_FILE), mine);
  assert.ok(done.skipped.includes(GH_FILE));
}));

test('update: answering for the GitLab file rewrites the rules', () => inTemp((dir) => {
  oldRepo(dir, GL);
  update(dir, { answers: { staging_branch: '', labels_job: 'hourly' } });
  assert.match(read(dir, GL_FILE), /\$CI_PIPELINE_SOURCE == "web"/);
  assert.doesNotMatch(read(dir, GL_FILE).replace(/^\s*#.*$/gm, ''), /merge_request_event/);
}));

// --- doctor ----------------------------------------------------------------------------------------------------------------------------

async function doctorLines(extra) {
  const LABELS = ['ready', 'assigned', 'in progress', 'in review', 'blocked', 'needs decision', 'changes requested from AI Manager'];
  const h = harness({ config: { ...CONFIG, ...extra }, wrap: (adapter) => ({ ...adapter, listLabels: async () => LABELS }) });
  h.ctx.pluginInstalled = true;
  await run(['doctor'], h.ctx);
  return h.text();
}

test('doctor: one `labels job` line per mode, and with sessions it says nothing runs in the cloud', async () => {
  const none = await doctorLines({});
  assert.match(none, /labels job: hourly/);
  for (const mode of ['events', 'hourly']) assert.match(await doctorLines({ labels_job: mode }), new RegExp(`labels job: ${mode}`));
  const sessions = await doctorLines({ labels_job: 'sessions' });
  assert.match(sessions, /labels job: sessions.*nothing runs in the cloud.*sessions keep the labels/);
  assert.equal(sessions.split('\n').filter((l) => /labels job:/.test(l)).length, 1);
});
