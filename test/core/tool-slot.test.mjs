// Issue #339: an Issue that needs a tool open on the person's main checkout (docs/design.md §24). Pure: a fake `git status`, a fake current branch and a fake
// detector answer go in, what to do comes out. Nothing here runs git; a test that did would change a real checkout.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { needsTool, toolState, DETECTORS, toolWait, checkoutPlan, returnPlan, verifyReturn } from '../../lib/core/tool-slot.mjs';
import { schedule } from '../../lib/core/schedule.mjs';
import { stepsBody } from '../../lib/core/steps.mjs';

const NL = '\n';
const needs = (...lines) => ['## Needs', '', ...lines, '', ''].join(NL);
const body = (section = '', effort = 2, files = ['a.mjs']) => `## Depends on${NL}${NL}- None${NL}${NL}## Effort${NL}${NL}${effort}${NL}${NL}${section}## Allowed files${NL}${NL}${files.map((f) => `- \`${f}\``).join(NL)}${NL}`;
const XCODE = needs('- Editor: Xcode');
const issue = (number, section = '', extra = {}) => ({ number, title: `T${number}`, body: body(section, 1, [`f${number}.mjs`]), ...extra });
const nums = (list) => list.map((i) => i.number);

test('«## Needs» is read with its tool name: «- Editor: <tool>», a plain «- Editor», and «- Unity Editor» as an alias', () => {
  const tool = (line) => needsTool(body(needs(line)));
  assert.deepEqual(tool('- Editor: Xcode'), { tool: 'Xcode' });
  assert.deepEqual(tool('- Editor: Unity'), { tool: 'Unity' });
  assert.deepEqual(tool('- Unity Editor'), { tool: 'Unity' });
  assert.deepEqual(tool('- editor:   Android Studio '), { tool: 'Android Studio' });
  assert.deepEqual(tool('- Editor'), { tool: null });
  assert.deepEqual(tool('- Editor:'), { tool: null }, 'an empty value is a plain Editor, never a dropped requirement');
  assert.deepEqual(tool('- Editor: '), { tool: null });
  assert.deepEqual(tool('- Editor:   .'), { tool: null });
  assert.deepEqual(needsTool(body(needs('- a phone', '- Editor: Xcode'))), { tool: 'Xcode' });
});

test('an Issue without the section, with other needs, in a comment or in a fence needs nothing', () => {
  assert.equal(needsTool(body()), null);
  assert.equal(needsTool(body(needs('- a phone'))), null);
  assert.equal(needsTool(body(needs('- Editorial review'))), null);
  assert.equal(needsTool(body(['## Needs', '', '<!-- - Editor: Xcode -->', '', ''].join(NL))), null);
  assert.equal(needsTool(body(['```text', '## Needs', '', '- Editor: Xcode', '```', '', ''].join(NL))), null);
  assert.equal(needsTool(null), null);
});

test('a holder can carry a note that the wait says (a closed Issue whose steps are open)', () => {
  assert.equal(toolWait({ candidate: { number: 5 }, holders: [9], active: [], notes: { 9: 'closed, its test steps are still open' } }), 'waits for the tool: #9 (closed, its test steps are still open) uses it');
});

test('the slot: an Issue that needs the tool starts only when nothing else of the login is active', () => {
  const c = { number: 5, needsTool: true };
  assert.equal(toolWait({ candidate: c, holders: [], active: [] }), null);
  assert.equal(toolWait({ candidate: c, holders: [], active: [{ number: 3 }] }), 'waits for the tool: #3 is running');
  assert.equal(toolWait({ candidate: c, holders: [], active: [{ number: 3, forLogin: 'bo' }, { number: 4, parked: 'paused' }, { number: 6, elsewhere: 'laptop' }] }), null, 'other logins, parked work and another machine do not use this checkout');
  assert.equal(toolWait({ candidate: { number: 5 }, holders: [], active: [{ number: 3 }] }), null, 'an Issue that does not need the tool is not held by the rule');
});

test('while the slot is held no other Issue of that login starts; the holder itself is not blocked, and a resume is not a start', () => {
  assert.equal(toolWait({ candidate: { number: 5 }, holders: [9], active: [] }), 'waits for the tool: #9 uses it');
  assert.equal(toolWait({ candidate: { number: 5, needsTool: true }, holders: [9], active: [{ number: 9 }] }), 'waits for the tool: #9 uses it');
  assert.equal(toolWait({ candidate: { number: 9, needsTool: true }, holders: [9], active: [{ number: 9 }] }), null);
  assert.equal(toolWait({ candidate: { number: 5 }, holders: [9], active: [], blocksOthers: false }), null);
});

test('schedule: a tool Issue waits while another is running; with nothing active it starts alone and the others wait behind it', () => {
  const first = schedule({ active: [issue(3)], candidates: [issue(5, XCODE), issue(6)], capacity: 5 });
  assert.deepEqual(nums(first.start), [6]);
  assert.deepEqual(first.wait, [{ issue: 5, why: 'waits for the tool: #3 is running' }]);
  const idle = schedule({ active: [], candidates: [issue(5, XCODE), issue(6), issue(7)], capacity: 5 });
  assert.deepEqual(nums(idle.start), [5]);
  assert.deepEqual(idle.wait.map((w) => [w.issue, w.why]), [[6, 'waits for the tool: #5 uses it'], [7, 'waits for the tool: #5 uses it']]);
});

test('schedule: a holder with its test steps open blocks the starts of its login; the slot is released when they close', () => {
  const held = schedule({ active: [], candidates: [issue(6), issue(8, XCODE)], capacity: 5, toolHolders: [4] });
  assert.deepEqual(held.start, []);
  assert.deepEqual(held.wait.map((w) => w.why), ['waits for the tool: #4 uses it', 'waits for the tool: #4 uses it']);
  const released = schedule({ active: [], candidates: [issue(6), issue(8, XCODE)], capacity: 5, toolHolders: [] });
  assert.deepEqual(nums(released.start), [6]);
  assert.equal(released.wait[0].why, 'waits for the tool: #6 is running');
});

test('schedule: a resume is held by the tool rule only when it needs the tool itself; the holder resumes freely', () => {
  const s = schedule({ active: [], candidates: [issue(4, XCODE), issue(6)], capacity: 5, toolHolders: [4], toolBlocksOthers: false });
  assert.deepEqual(nums(s.start), [4, 6]);
});

test('schedule: the tool Issue counts only its effort, and another login is not affected', () => {
  const big = { number: 5, title: 'big', body: body(XCODE, 3, ['z.mjs']) };
  const s = schedule({ active: [{ ...issue(3), forLogin: 'bo' }], candidates: [big], capacity: 5 });
  assert.equal(s.used, 3);
  assert.deepEqual(nums(s.start), [5]);
});

test('an Issue without «## Needs» schedules exactly as before', () => {
  const s = schedule({ active: [issue(3)], candidates: [issue(5), issue(6)], capacity: 5 });
  assert.deepEqual(nums(s.start), [5, 6]);
  assert.deepEqual(s.wait, []);
});

const CLEAN = '';
const DIRTY = ` M Assets/Main.unity${NL}?? notes.txt${NL}`;
const BASE = { branch: 'staging', base: 'staging', issueBranch: 'h140-x' };
const FAKE_ENGINE = { tool: 'Unity', answers: { connected: true } };

test('the detector is one entry keyed by the tool name: connected, not connected or unknown', () => {
  assert.deepEqual(Object.keys(DETECTORS), ['unity']);
  assert.equal(toolState('Unity', { connected: true }), 'connected');
  assert.equal(toolState('unity', { connected: false }), 'not connected');
  assert.equal(toolState('Xcode', { connected: true }), 'unknown');
  assert.equal(toolState(null, { connected: true }), 'unknown');
});

test('a main checkout with uncommitted changes: ONE step with the three choices, and nothing is switched, stashed or reset', () => {
  for (const t of [FAKE_ENGINE, { tool: 'Xcode' }, { tool: null }]) {
    const plan = checkoutPlan({ ...BASE, ...t, status: DIRTY });
    assert.equal(plan.action, 'ask');
    assert.equal(plan.kind, 'changes');
    assert.deepEqual(plan.commands, []);
    assert.equal(plan.list.steps.length, 1);
    const text = plan.list.steps[0].do;
    assert.match(text, /commit them/);
    assert.match(text, /stash/);
    assert.match(text, /wait/);
    assert.doesNotThrow(() => stepsBody(plan.list), 'the list is accepted by the steps rules (one action, no huddle command)');
  }
});

test('a detectable tool that is not connected: one step «open it on the main checkout»', () => {
  const plan = checkoutPlan({ ...BASE, tool: 'Unity', answers: { connected: false }, status: CLEAN });
  assert.equal(plan.action, 'ask');
  assert.equal(plan.kind, 'tool');
  assert.deepEqual(plan.commands, []);
  assert.equal(plan.list.steps[0].do, 'Open Unity on the main checkout.');
  assert.doesNotThrow(() => stepsBody(plan.list));
});

test('a tool with no detector, or no name, always gives the «open it» step, once: it goes on when the person closed it', () => {
  const ask = checkoutPlan({ ...BASE, tool: 'Xcode', answers: { connected: true }, status: CLEAN });
  assert.equal(ask.action, 'ask');
  assert.equal(ask.kind, 'tool');
  assert.deepEqual(ask.commands, []);
  assert.equal(ask.list.steps[0].do, 'Open Xcode on the main checkout.');
  assert.doesNotThrow(() => stepsBody(ask.list));
  assert.equal(checkoutPlan({ ...BASE, tool: null, status: CLEAN }).list.steps[0].do, 'Open the tool on the main checkout.');
  const go = checkoutPlan({ ...BASE, tool: 'Xcode', toolOpened: true, status: CLEAN });
  assert.equal(go.action, 'switch');
  assert.deepEqual(go.commands, ['git fetch origin', 'git switch h140-x']);
  assert.equal(checkoutPlan({ ...BASE, tool: 'Unity', toolOpened: true, answers: { connected: false }, status: CLEAN }).action, 'ask', 'a detectable tool is still checked');
});

test('a tool with a detector and one without behave the same except for the detection', () => {
  const detected = checkoutPlan({ ...BASE, ...FAKE_ENGINE, status: CLEAN });
  const unknown = checkoutPlan({ ...BASE, tool: 'Xcode', toolOpened: true, status: CLEAN });
  assert.deepEqual(detected, unknown);
  const moved = (t) => checkoutPlan({ ...BASE, ...t, branch: 'my-own-work', status: CLEAN });
  assert.equal(moved(FAKE_ENGINE).kind, 'branch');
  assert.equal(moved({ tool: 'Xcode', toolOpened: true }).kind, 'branch');
});

test('changes are asked before the tool, one question at a time', () => {
  const plan = checkoutPlan({ ...BASE, tool: 'Xcode', status: ` M a${NL}` });
  assert.equal(plan.kind, 'changes');
  assert.equal(plan.list.steps.length, 1);
});

test('a clean checkout on the base branch with the tool open: the switch, as commands for the session to run; a new branch is made there from the base', () => {
  const plan = checkoutPlan({ ...BASE, ...FAKE_ENGINE, status: CLEAN });
  assert.equal(plan.action, 'switch');
  assert.deepEqual(plan.commands, ['git fetch origin', 'git switch h140-x']);
  assert.equal(plan.list, undefined);
  assert.deepEqual(checkoutPlan({ ...BASE, ...FAKE_ENGINE, status: CLEAN, newBranch: true }).commands, ['git fetch origin', 'git switch -c h140-x origin/staging']);
});

test('already on the Issue branch and clean: stay; on some other branch of the person: one question, nothing moved', () => {
  const stay = checkoutPlan({ ...BASE, ...FAKE_ENGINE, status: CLEAN, branch: 'h140-x' });
  assert.equal(stay.action, 'stay');
  assert.deepEqual(stay.commands, []);
  const other = checkoutPlan({ ...BASE, ...FAKE_ENGINE, status: CLEAN, branch: 'my-own-work' });
  assert.equal(other.action, 'ask');
  assert.equal(other.kind, 'branch');
  assert.deepEqual(other.commands, []);
  assert.doesNotThrow(() => stepsBody(other.list));
});

test('while the test steps are open nothing touches the checkout; when they are closed it returns to the base branch, up to date and clean', () => {
  const r = { status: CLEAN, branch: 'h140-x', issueBranch: 'h140-x', base: 'staging' };
  assert.deepEqual(returnPlan({ ...r, stepsOpen: true }), { action: 'wait', commands: [] });
  const back = returnPlan({ ...r, stepsOpen: false });
  assert.equal(back.action, 'return');
  assert.deepEqual(back.commands, ['git fetch origin', 'git switch staging', 'git merge --ff-only origin/staging']);
  assert.deepEqual(back.verify, ['git status --porcelain', 'git rev-parse --abbrev-ref HEAD', 'git rev-list --count HEAD..origin/staging']);
});

test('the return stops with one question, never forcing, when there are new changes or the person moved the branch', () => {
  const r = { issueBranch: 'h140-x', base: 'staging', stepsOpen: false };
  const dirty = returnPlan({ ...r, status: ` M a${NL}`, branch: 'h140-x' });
  assert.equal(dirty.action, 'ask');
  assert.equal(dirty.kind, 'changes');
  assert.deepEqual(dirty.commands, []);
  const moved = returnPlan({ ...r, status: CLEAN, branch: 'other' });
  assert.equal(moved.action, 'ask');
  assert.equal(moved.kind, 'branch');
  assert.deepEqual(moved.commands, []);
  const onBase = returnPlan({ ...r, status: CLEAN, branch: 'staging' });
  assert.equal(onBase.action, 'return', 'already on the base still needs a fresh check');
  assert.deepEqual(onBase.commands, ['git fetch origin', 'git merge --ff-only origin/staging']);
});

test('after the return: on the base, clean and not behind means released; anything else is one question', () => {
  assert.deepEqual(verifyReturn({ status: CLEAN, branch: 'staging', base: 'staging', behind: 0 }), { ok: true });
  for (const bad of [{ status: ` M a${NL}` }, { branch: 'h140-x' }, { behind: 2 }, { behind: '' }, { behind: null }]) {
    const r = verifyReturn({ status: CLEAN, branch: 'staging', base: 'staging', behind: 0, ...bad });
    assert.equal(r.ok, false);
    assert.equal(r.list.steps.length, 1);
    assert.doesNotThrow(() => stepsBody(r.list));
  }
});

test('the library never runs a command, and no export is named after one tool', async () => {
  const src = readFileSync(new URL('../../lib/core/tool-slot.mjs', import.meta.url), 'utf8');
  assert.doesNotMatch(src, /child_process|execSync|spawn|execFile/);
  const names = Object.keys(await import('../../lib/core/tool-slot.mjs'));
  assert.ok(names.length > 0);
  assert.ok(names.every((n) => !/unity|xcode|android/i.test(n)), names.join(', '));
});

for (const [name, file] of [['GitHub', 'templates/github/ISSUE_TEMPLATE/task.md'], ['GitLab', 'templates/gitlab/issue_templates/Task.md']]) {
  test(`the ${name} Task template has the optional «Needs» section, which needs nothing until a line is written`, () => {
    const t = readFileSync(new URL(`../../${file}`, import.meta.url), 'utf8');
    assert.ok(t.indexOf('## Needs') > t.indexOf('## How to test in staging'));
    assert.ok(t.indexOf('## Needs') < t.indexOf('## Allowed files'));
    assert.match(t, /the tool that must be open on the main checkout, for example: Unity Editor/);
    assert.equal(needsTool(t), null, 'the template as it comes needs no tool');
    assert.deepEqual(needsTool(t.replace(/## Needs(\r?\n)+/, (m) => `${m}- Editor: Xcode${NL}${NL}`)), { tool: 'Xcode' });
  });
}
