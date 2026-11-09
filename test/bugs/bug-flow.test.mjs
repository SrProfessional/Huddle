// Huddle: the Bug flow (Issue #55): the Bug templates, the labels `bug` and `needs triage`, the triage rule and «blocking first».
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { run } from '../../lib/cli/run.mjs';
import { setup } from '../../lib/setup/index.mjs';
import { assignments, dependsOn, isBlockingBug, plan, severityOf, BUG_LABELS } from '../../lib/core/issue-status.mjs';
import { harness, CONFIG, GITLAB_CONFIG } from '../cli/harness.mjs';

const tpl = (rel) => readFileSync(fileURLToPath(new URL(`../../templates/${rel}`, import.meta.url)), 'utf8');
const NONE = '## Depends on\n\n- None\n';
const bug = (severity, extra = '') => `## What happens\n\nIt breaks.\n\n## Severity\n\n${severity}\n\n${NONE}${extra}`;

// --- the templates -------------------------------------------------------------------------------------------------------------------
const TASK_SECTIONS = ['## Goal', '## Depends on', '## Branch', '## Prompt for Claude Code', '## Allowed files', '## Contract or spec', '## Tests that must pass', '## Notes'];
const BUG_SECTIONS = ['## What happens', '## What should happen', '## How to reproduce', '## Evidence', '## Severity', '## Probable cause', '## The failing test to write first'];

for (const [name, file] of [['GitHub', 'github/ISSUE_TEMPLATE/bug.md'], ['GitLab', 'gitlab/issue_templates/Bug.md']]) {
  test(`${name} Bug template: bug block first, then every Task section`, () => {
    const lines = tpl(file).split(/\r?\n/);
    const at = (h) => { const i = lines.indexOf(h); assert.ok(i >= 0, `${file} lacks "${h}"`); return i; };
    const order = [...BUG_SECTIONS, ...TASK_SECTIONS].map(at);
    assert.deepEqual(order, [...order].sort((a, b) => a - b), 'sections are out of order');
  });

  test(`${name} Bug template keeps «Depends on» readable by the labels job`, () => {
    const text = tpl(file);
    assert.deepEqual(dependsOn(text), []);
    assert.match(text, /^## Depends on[ \t]*\n[\s\S]*?^- None$/m);
  });
}

test('the two Bug templates carry the same content (front matter aside)', () => {
  const body = (t) => t.replace(/^---\n[\s\S]*?\n---\n/, '');
  assert.equal(body(tpl('github/ISSUE_TEMPLATE/bug.md')), body(tpl('gitlab/issue_templates/Bug.md')));
});

test('GitHub Bug template has front matter with the label bug', () => {
  assert.match(tpl('github/ISSUE_TEMPLATE/bug.md'), /^---\nname: Bug\nabout: .+\n(?:.*\n)*?labels: .*\bbug\b/);
});

test('the Bug template tells the reporter to add «needs triage» on GitLab, and the form applies both labels', () => {
  assert.match(tpl('gitlab/issue_templates/Bug.md'), /needs triage/);
  const form = tpl('github/ISSUE_TEMPLATE/bug-report.yml');
  assert.match(form, /^labels:\s*\n\s*- bug\s*\n\s*- needs triage/m);
  for (const id of ['what-happens', 'what-should-happen', 'steps', 'evidence', 'severity']) assert.match(form, new RegExp(`id: ${id}\\b`));
  for (const s of ['blocking', 'normal', 'minor']) assert.match(form, new RegExp(`- ${s}`));
});

// --- setup ---------------------------------------------------------------------------------------------------------------------------
const inTemp = (fn) => { const root = mkdtempSync(path.join(tmpdir(), 'huddle-bug-')); try { return fn(root); } finally { rmSync(root, { recursive: true, force: true }); } };
const read = (root, rel) => readFileSync(path.join(root, rel), 'utf8');

test('setup installs bug.md and bug-report.yml on GitHub', () => inTemp((root) => {
  const r = setup(root, { platform: 'github', project: 'acme/app', ai_manager: 'santiago' });
  assert.equal(read(root, '.github/ISSUE_TEMPLATE/bug.md'), tpl('github/ISSUE_TEMPLATE/bug.md'));
  assert.equal(read(root, '.github/ISSUE_TEMPLATE/bug-report.yml'), tpl('github/ISSUE_TEMPLATE/bug-report.yml'));
  assert.ok(r.written.includes('.github/ISSUE_TEMPLATE/bug.md') && r.written.includes('.github/ISSUE_TEMPLATE/bug-report.yml'));
}));

test('setup installs Bug.md on GitLab', () => inTemp((root) => {
  setup(root, { platform: 'gitlab', project: 'team/app', ai_manager: 'santiago' });
  assert.equal(read(root, '.gitlab/issue_templates/Bug.md'), tpl('gitlab/issue_templates/Bug.md'));
}));

// --- the core ------------------------------------------------------------------------------------------------------------------------
test('severityOf reads the Severity section: blocking, normal, minor; anything else is normal', () => {
  assert.equal(severityOf(bug('blocking')), 'blocking');
  assert.equal(severityOf(bug('Blocking')), 'blocking');
  assert.equal(severityOf(bug('minor')), 'minor');
  assert.equal(severityOf(bug('<!-- blocking, normal or minor -->\nnormal')), 'normal');
  assert.equal(severityOf(bug('')), 'normal');
  assert.equal(severityOf('## Goal\n\nblocking\n'), 'normal');
  assert.equal(severityOf(bug('blocking').replace(/\n/g, '\r\n')), 'blocking');
});

test('isBlockingBug needs the label bug and severity blocking', () => {
  assert.equal(isBlockingBug({ labels: ['bug'], body: bug('blocking') }), true);
  assert.equal(isBlockingBug({ labels: [], body: bug('blocking') }), false);
  assert.equal(isBlockingBug({ labels: ['bug'], body: bug('normal') }), false);
});

test('a blocking Bug is assigned before an older ready task', () => {
  const ready = [{ number: 3 }, { number: 20, blocking: true }];
  assert.deepEqual(assignments({ ready, team: ['ana'], load: new Map() }), [{ number: 20, to: 'ana' }, { number: 3, to: 'ana' }]);
  assert.deepEqual(assignments({ ready, team: ['ana'], load: new Map(), max: 1 }), [{ number: 20, to: 'ana' }]);
});

test('plan ignores an Issue with needs triage', () => {
  const issues = new Map();
  const it = { number: 5, body: bug('normal'), assignees: [], labels: ['bug', 'needs triage'] };
  assert.deepEqual(plan({ open: [it], issues }), []);
  assert.equal(plan({ open: [{ ...it, labels: ['bug'] }], issues })[0].add, 'ready');
});

test('BUG_LABELS names the two labels', () => {
  assert.deepEqual(Object.values(BUG_LABELS).map((l) => l.name), ['bug', 'needs triage']);
});

// --- the labels job ------------------------------------------------------------------------------------------------------------------
for (const gitlab of [false, true]) {
  const where = gitlab ? 'GitLab' : 'GitHub';
  const config = gitlab ? GITLAB_CONFIG : CONFIG;

  test(`${where}: labels creates bug and needs triage when missing`, async () => {
    const h = harness({ gitlab, setup: (w) => w.issue({ number: 1, body: NONE }) });
    await run(['labels'], h.ctx);
    const have = await (await h.ctx.createPlatform(config)).listLabels();
    assert.ok(have.includes('bug') && have.includes('needs triage'), have.join(', '));
  });

  test(`${where}: an Issue with needs triage never gets ready or an assignee`, async () => {
    const h = harness({ gitlab, setup: (w) => {
      w.issue({ number: 4, title: 'raw report', body: bug('blocking'), labels: ['bug', 'needs triage'] });
      w.issue({ number: 5, title: 'task', body: NONE });
    } });
    await run(['labels'], h.ctx);
    assert.deepEqual(h.world.labelsOf(4).sort(), ['bug', 'needs triage']);
    assert.deepEqual(h.world.assigneesOf(4), []);
    assert.deepEqual(h.world.labelsOf(5), ['assigned']);
  });

  test(`${where}: a blocking Bug is assigned before an older ready task of the same person`, async () => {
    const h = harness({ gitlab, config: { ...config, assignees: ['ana'], max_open_per_person: 1 }, setup: (w) => {
      w.issue({ number: 2, title: 'older task', body: NONE });
      w.issue({ number: 9, title: 'blocking bug', body: bug('blocking'), labels: ['bug'] });
    } });
    await run(['labels'], h.ctx);
    assert.deepEqual(h.world.labelsOf(9).sort(), ['assigned', 'bug']);
    assert.deepEqual(h.world.labelsOf(2), ['ready']);
  });
}
