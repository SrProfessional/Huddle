// Issue #125 (H54), docs/design.md §22 and §23: Issues change only through a session, the board repairs itself when a session opens,
// and `labels_job` defaults to `sessions`. Fakes only: no real GitHub or GitLab, no process is started.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { run, labelsFiles } from '../../lib/cli/run.mjs';
import { loadConfig } from '../../lib/cli/config.mjs';
import { setup } from '../../lib/setup/index.mjs';
import { QUESTIONS } from '../../lib/setup/questions.mjs';
import { DEFAULT_LABELS_JOB } from '../../lib/setup/labels-job.mjs';
import { harness, CONFIG } from '../cli/harness.mjs';

const doc = (rel) => readFileSync(fileURLToPath(new URL(`../../${rel}`, import.meta.url)), 'utf8');
const RULE = /Every change to an Issue goes through a Huddle session/;
const dep = (...ns) => `## Goal\n\nx\n\n## Depends on\n\n${ns.length ? ns.map((n) => `- #${n}`).join('\n') : '- None'}\n`;

// --- the rule --------------------------------------------------------------------------------------------------------------------------

test('the CLAUDE.md block, the design, the team guide and the roles state the rule', () => {
  for (const file of ['templates/CLAUDE.huddle.md', 'docs/design.md', 'docs/team-guide.md', 'docs/roles.md']) {
    const text = doc(file);
    assert.match(text, RULE, file);
    assert.match(text, /\/huddle-issue/, file);
    assert.match(text, /huddle labels/, file);
  }
});

test('the rule names the three exceptions and says it is a rule, not a lock', () => {
  for (const file of ['templates/CLAUDE.huddle.md', 'docs/design.md', 'docs/team-guide.md']) {
    const text = doc(file);
    assert.match(text, /reading and commenting/i, file);
    assert.match(text, /bug report form/i, file);
    assert.match(text, /✅ Tested in staging/, file);
  }
  for (const file of ['docs/design.md', 'docs/team-guide.md']) {
    assert.match(doc(file), /a rule, not a lock/i, file);
    assert.match(doc(file), /next session that opens repairs the board/i, file);
  }
});

// --- skills ----------------------------------------------------------------------------------------------------------------------------

const LABELS_CMD = 'node "${CLAUDE_PLUGIN_ROOT}/bin/huddle" labels';

test('huddle-issue runs the full labels after creating the Issue, best effort, and no longer says the labels job does it', () => {
  const text = doc('skills/huddle-issue/SKILL.md');
  const create = text.indexOf('gh issue create');
  const full = text.indexOf(`${LABELS_CMD}\``, create);
  assert.ok(create > 0 && full > create, 'the full labels run comes after gh issue create');
  assert.match(text, /best effort/i);
  assert.doesNotMatch(text, /Do not add status labels or an\s+assignee: the labels job does that/);
  assert.match(text, /do not add them by hand/i);
});

test('huddle-bug runs the full labels after creating the Issue and after the rewrite of #N, best effort', () => {
  const text = doc('skills/huddle-bug/SKILL.md');
  const create = text.indexOf('gh issue create --label bug');
  const rewrite = text.indexOf('rewrite that report');
  const full = text.indexOf(`${LABELS_CMD}\``, Math.min(create, rewrite));
  assert.ok(create > 0 && rewrite > 0 && full > Math.max(create, rewrite), 'the full labels run comes after both ways of creating it');
  assert.match(text, /best effort/i);
  assert.match(text, /needs triage/);
  assert.doesNotMatch(text, /labels or an assignee: the labels job does that/);
});

test('huddle-review and huddle-release have the note on reopening, with both commands in order', () => {
  for (const file of ['skills/huddle-review/SKILL.md', 'skills/huddle-release/SKILL.md']) {
    const text = doc(file);
    const at = text.indexOf('Reopening an Issue');
    assert.ok(at > 0, file);
    const note = text.slice(at);
    const reopen = note.indexOf('gh issue reopen <n>');
    const scoped = note.indexOf(`${LABELS_CMD} --issue <n>`);
    const full = note.indexOf(`${LABELS_CMD}\``, scoped);
    assert.ok(reopen >= 0 && scoped > reopen && full > scoped, `${file}: reopen, then labels --issue <n>, then the full labels`);
    assert.match(note, /glab issue reopen <n>/);
    assert.match(note, /AI Manager/);
  }
});

// --- the board repairs itself when a session opens -------------------------------------------------------------------------------------

/** A hook run with a fake `startLabels` that records its arguments. `manager`: the logged-in user is the AI Manager. */
function hooked({ manager = false, config = {}, now = Date.parse('2026-11-13T10:00:00Z'), files } = {}) {
  const started = [];
  const h = harness({ config: { ...CONFIG, ai_manager: manager ? 'SrProfessional' : 'someone-else', ...config } });
  h.ctx.updateCachePath = '/cache/huddle-update.json';
  h.ctx.now = () => new Date(now.valueOf());
  h.ctx.startLabels = (args) => started.push(args);
  return { h, started };
}

test('the hook starts the labels pass with --no-assign for a developer and without it for the AI Manager', async () => {
  const dev = hooked();
  assert.equal(await run(['hook'], dev.h.ctx), 0);
  assert.deepEqual(dev.started, [['labels', '--no-assign']]);
  const boss = hooked({ manager: true });
  assert.equal(await run(['hook'], boss.h.ctx), 0);
  assert.deepEqual(boss.started, [['labels']]);
});

test('the hook starts the pass at most once every 10 minutes, and again after that', async () => {
  const t = { at: Date.parse('2026-11-13T10:00:00Z') };
  const { h, started } = hooked();
  h.ctx.now = () => new Date(t.at);
  await run(['hook'], h.ctx);
  t.at += 9 * 60 * 1000;
  await run(['hook'], h.ctx);
  assert.equal(started.length, 1, 'nine minutes later: not again');
  t.at += 2 * 60 * 1000;
  await run(['hook'], h.ctx);
  assert.equal(started.length, 2, 'eleven minutes later: again');
});

test('labels_on_start false turns the pass off; hourly and events still run it', async () => {
  const off = hooked({ config: { labels_on_start: false } });
  await run(['hook'], off.h.ctx);
  assert.deepEqual(off.started, []);
  for (const labels_job of ['hourly', 'events', 'sessions']) {
    const on = hooked({ config: { labels_job } });
    await run(['hook'], on.h.ctx);
    assert.equal(on.started.length, 1, labels_job);
  }
  assert.equal(loadConfig('/r', () => JSON.stringify({ ...CONFIG, labels_on_start: false })).labels_on_start, false);
  assert.throws(() => loadConfig('/r', () => JSON.stringify({ ...CONFIG, labels_on_start: 'no' })), /"labels_on_start"/);
});

test('a pass that cannot start, or offline, never changes the hook\'s exit or output', async () => {
  const broken = hooked();
  broken.h.ctx.startLabels = () => { throw new Error('spawn failed'); };
  assert.equal(await run(['hook'], broken.h.ctx), 0);
  assert.equal(broken.h.errText(), '');
  assert.equal(broken.h.text(), '');

  const offline = hooked();
  const failing = harness({ config: CONFIG, wrap: (a) => new Proxy(a, { get: (t, p) => (p === 'me' ? async () => { throw new Error('offline'); } : t[p]) }) });
  const started = [];
  failing.ctx.startLabels = (args) => started.push(args);
  failing.ctx.updateCachePath = '/cache/huddle-update.json';
  assert.equal(await run(['hook'], failing.ctx), 0);
  assert.deepEqual(started, [], 'offline: nothing started');
  assert.equal(failing.text(), '');
  assert.deepEqual(offline.started, []);
});

test('the «corrected N label(s)» line shows once, and only when N is more than 0', async () => {
  const { h } = hooked();
  const { count } = labelsFiles(h.ctx);
  h.ctx.writeFile(count, '3'); // the pass of an earlier session left its count
  assert.equal(await run(['hook'], h.ctx), 0);
  assert.match(JSON.parse(h.text()).systemMessage, /Huddle corrected 3 label\(s\): something changed outside a session\./);
  const again = hooked();
  again.h.ctx.readFile = h.ctx.readFile;
  again.h.ctx.writeFile = h.ctx.writeFile;
  h.out.length = 0;
  await run(['hook'], again.h.ctx);
  assert.equal(again.h.text(), '', 'cleared: it does not show twice');

  const zero = hooked();
  zero.h.ctx.writeFile(labelsFiles(zero.h.ctx).count, '0');
  await run(['hook'], zero.h.ctx);
  assert.equal(zero.h.text(), '', 'N = 0 says nothing');
});

test('the skill notice says the corrected line too, once', async () => {
  const { h } = hooked();
  h.ctx.writeFile(labelsFiles(h.ctx).count, '2');
  assert.equal(await run(['notice'], h.ctx), 0);
  assert.match(h.text(), /Huddle corrected 2 label\(s\)/);
  const next = hooked();
  next.h.ctx.readFile = h.ctx.readFile;
  next.h.ctx.writeFile = h.ctx.writeFile;
  await run(['notice'], next.h.ctx);
  assert.doesNotMatch(next.h.text(), /corrected/);
});

test('the labels pass writes its count to the count file only when it changed something', async () => {
  const run1 = async (labels) => {
    const written = [];
    const h = harness({ setup: (w) => { w.issue({ number: 5, body: dep(), labels }); } });
    h.ctx.labelsCountFile = '/cache/count';
    h.ctx.writeFile = (p, text) => written.push([p, text]);
    assert.equal(await run(['labels', '--no-assign'], h.ctx), 0);
    return written.filter(([p]) => p === '/cache/count');
  };
  assert.deepEqual(await run1([]), [['/cache/count', '1']]);
  assert.deepEqual(await run1(['ready']), []);
});

// --- huddle labels --no-assign ---------------------------------------------------------------------------------------------------------

const recorded = (log) => (adapter) => new Proxy(adapter, {
  get: (target, prop) => (typeof target[prop] === 'function' ? (...args) => { log.push(String(prop)); return target[prop](...args); } : target[prop]),
});

for (const gitlab of [false, true]) {
  const kind = gitlab ? 'gitlab' : 'github';
  const world = (w) => { w.issue({ number: 5, body: dep() }); w.issue({ number: 6, body: dep(5), labels: [] }); };

  test(`${kind}: labels --no-assign changes the labels and never assigns`, async () => {
    const log = [];
    const h = harness({ gitlab, setup: world, wrap: recorded(log) });
    assert.equal(await run(['labels', '--no-assign'], h.ctx), 0);
    assert.ok(!log.includes('assign'), 'assign is never called');
    assert.ok(log.includes('setLabels'), 'the labels still change');
    assert.doesNotMatch(h.text(), /assigned to/);
  });

  test(`${kind}: labels without the flag still assigns`, async () => {
    const log = [];
    const h = harness({ gitlab, setup: world, wrap: recorded(log) });
    assert.equal(await run(['labels'], h.ctx), 0);
    assert.ok(log.includes('assign'));
  });

  test(`${kind}: --no-assign works with --dry-run and is refused with anything else`, async () => {
    const h = harness({ gitlab, setup: world });
    assert.equal(await run(['labels', '--no-assign', '--dry-run'], h.ctx), 0);
    const bad = harness({ gitlab, setup: world });
    assert.equal(await run(['labels', '--no-assign', '--bogus'], bad.ctx), 2);
    assert.match(bad.errText(), /Usage:.*labels \[--dry-run\] \[--no-assign\]/);
  });
}

// --- the default -----------------------------------------------------------------------------------------------------------------------

test('with no key loadConfig gives sessions, and the setup default and question say the same', () => {
  assert.equal(loadConfig('/r', () => JSON.stringify({ platform: 'github', project: 'a/b', ai_manager: 'boss' })).labels_job, 'sessions');
  assert.equal(DEFAULT_LABELS_JOB, 'sessions');
  const q = QUESTIONS.find((x) => x.id === 'labels-job');
  assert.equal(q.default, 'sessions');
  assert.match(q.ask, /sessions \(recommended: the sessions keep the labels right, no cloud job and no CI minutes\)/);
  assert.match(q.ask, /hourly \(a safety net once an hour, for a team where changes may happen outside a session\)/);
  assert.match(q.ask, /events \(every Issue, PR and comment event: it uses a lot of CI minutes\)/);
  assert.match(doc('huddle.schema.json'), /sessions \(default when absent\)/);
});

const inTemp = (fn) => {
  const dir = mkdtempSync(path.join(tmpdir(), 'huddle-sessions-'));
  try { return fn(dir); } finally { rmSync(dir, { recursive: true, force: true }); }
};

test('setup with no answer writes no labels job file on either platform and reports it', () => inTemp((dir) => {
  const r = setup(dir, { platform: 'github', project: 'acme/app', ai_manager: 'boss', assignees: ['ana'] });
  assert.ok(!existsSync(path.join(dir, '.github/workflows/huddle-labels.yml')));
  assert.match(r.notes.join('\n'), /Labels job: sessions/);
}));

test('setup on GitLab with no answer writes no labels job file and no CI include', () => inTemp((dir) => {
  const r = setup(dir, { platform: 'gitlab', project: 'team/app', ai_manager: 'boss', assignees: ['ana'] });
  assert.ok(!existsSync(path.join(dir, 'huddle-labels.gitlab-ci.yml')));
  assert.ok(!existsSync(path.join(dir, '.gitlab-ci.yml')));
  assert.match(r.notes.join('\n'), /Labels job: sessions/);
}));

test('a repo that still has the cloud job file is told which file can go and why', () => inTemp((dir) => {
  setup(dir, { platform: 'github', project: 'acme/app', ai_manager: 'boss', assignees: ['ana'], labels_job: 'hourly' });
  const r = setup(dir, { platform: 'github', project: 'acme/app', ai_manager: 'boss', assignees: ['ana'], labels_job: 'sessions' });
  const notes = r.notes.join('\n');
  assert.match(notes, /\.github\/workflows\/huddle-labels\.yml is still there/);
  assert.match(notes, /the sessions keep the labels/);
  assert.match(notes, /delete it in a PR/);
  assert.match(notes, /hourly or events/);
}));

test('hourly and events still render as before when asked for', () => inTemp((dir) => {
  setup(dir, { platform: 'github', project: 'acme/app', ai_manager: 'boss', assignees: ['ana'], labels_job: 'events' });
  assert.equal(readFileSync(path.join(dir, '.github/workflows/huddle-labels.yml'), 'utf8'), readFileSync(fileURLToPath(new URL('../../templates/github/workflows/huddle-labels.yml', import.meta.url)), 'utf8'));
}));

test('the update registry asks the labels_job question with sessions as the default', () => {
  assert.equal(QUESTIONS.find((x) => x.id === 'labels-job').default, 'sessions');
});
