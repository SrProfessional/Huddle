// Issue #338: the steps of a person are data in an Issue comment (docs/design.md §13 and §24). The reader, the writer and the closing markers.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readSteps, stepsBody, stepCloseBody, checkStep, CLOSE_KINDS } from '../../lib/core/steps.mjs';
import { newestPause } from '../../lib/core/pause.mjs';
import { newestClaim } from '../../lib/core/machine.mjs';

const step = (n = 1) => ({ do: `Open the Editor on branch h${n}-x.`, see: 'The Console is empty.', else: 'Copy the first red line and send it to the Coach.' });
const list = (extra = {}) => ({ reason: 'only a person can run the Editor', steps: [step(1), step(2)], ...extra });
const at = (n) => `2026-11-24T1${n}:00:00Z`;
const comment = (id, body, createdAt, author = 'ana') => ({ id, author, body, createdAt });
const coach = { manager: 'SrProfessional' };
const COACH = 'SrProfessional';

test('a steps comment is written as a visible numbered list and read back into steps, the reason and the ending', () => {
  const body = stepsBody(list());
  assert.match(body, /🙋 Step 1 of 2: Open the Editor on branch h1-x\./);
  assert.match(body, /🙋 Step 2 of 2: /);
  assert.match(body, /You should see: The Console is empty\./);
  assert.match(body, /If you see something else: Copy the first red line/);
  const r = readSteps([comment(1, body, at(0))], coach);
  assert.equal(r.reason, 'only a person can run the Editor');
  assert.equal(r.then, 'resume', 'the default ending');
  assert.equal(r.total, 2);
  assert.deepEqual(r.steps.map((s) => [s.n, s.state]), [[1, 'pending'], [2, 'pending']]);
  assert.equal(r.steps[0].do, 'Open the Editor on branch h1-x.');
  assert.equal(r.steps[0].else, 'Copy the first red line and send it to the Coach.');
  assert.equal(r.current, 1);
  assert.equal(r.finished, false);
  assert.equal(readSteps([comment(1, stepsBody(list({ then: 'none' })), at(0))], coach).then, 'none');
});

test('no list, or a comment that only looks like one, reads as null', () => {
  assert.equal(readSteps([], coach), null);
  assert.equal(readSteps(undefined, coach), null);
  assert.equal(readSteps([comment(1, '🙋 Step 1 of 1: Open it', at(0))], coach), null, 'the visible text alone is not data');
  assert.equal(readSteps([comment(1, '<!-- huddle-steps {not json} -->', at(0))], coach), null);
});

test('the hidden marker survives text with dashes, angle brackets and quotes, and never ends the comment early', () => {
  const ok = { do: 'Open "Window > Package Manager" -- the list.', see: 'A list with a - bullet and 1 < 2.', else: 'Say "no".' };
  const body = stepsBody({ reason: 'a --> b', steps: [ok] });
  const hidden = /<!--[\s\S]*?-->/.exec(body)[0];
  assert.equal((hidden.match(/-->/g) ?? []).length, 1, 'only the closing arrow');
  const r = readSteps([comment(1, body, at(0))], coach);
  assert.equal(r.steps[0].do, ok.do);
  assert.equal(r.steps[0].see, ok.see);
  assert.equal(r.reason, 'a --> b');
});

test('a later list replaces an earlier one, and closings of the earlier list do not count for the new one', () => {
  const first = comment(1, stepsBody(list()), at(0));
  const done1 = comment(2, stepCloseBody('done', { n: 1, total: 2, do: 'x' }), at(1), COACH);
  const second = comment(3, stepsBody({ reason: 'again', steps: [step(3)] }), at(2));
  const r = readSteps([first, done1, second], coach);
  assert.equal(r.reason, 'again');
  assert.equal(r.total, 1);
  assert.equal(r.steps[0].state, 'pending');
  assert.equal(readSteps([second, first], coach).reason, 'again', 'the order of the list does not matter, the time does');
});

test('closings advance the current step in order; only the Coach comments close', () => {
  const l = comment(1, stepsBody(list()), at(0));
  const d1 = comment(2, stepCloseBody('done', { n: 1, total: 2, do: 'x' }), at(1), COACH);
  let r = readSteps([l, d1], coach);
  assert.deepEqual(r.steps.map((s) => s.state), ['done', 'pending']);
  assert.equal(r.current, 2);
  const forged = comment(3, stepCloseBody('done', { n: 2, total: 2, do: 'x' }), at(2), 'ana');
  r = readSteps([l, d1, forged], coach);
  assert.equal(r.current, 2, 'a Player done does not close it');
  const d2 = comment(4, stepCloseBody('skipped', { n: 2, total: 2, do: 'x', note: 'no tablet needed' }), at(3), COACH);
  r = readSteps([l, d1, d2], coach);
  assert.deepEqual(r.steps.map((s) => s.state), ['done', 'skipped']);
  assert.equal(r.steps[1].note, 'no tablet needed');
  assert.equal(r.current, null);
  assert.equal(r.finished, true);
  assert.equal(r.failed, false);
});

test('a failed step is kept with its note and the list reports failed', () => {
  const l = comment(1, stepsBody(list()), at(0));
  const f = comment(2, stepCloseBody('failed', { n: 1, total: 2, do: 'x', note: 'the Editor crashed' }), at(1), COACH);
  const r = readSteps([l, f], coach);
  assert.equal(r.steps[0].state, 'failed');
  assert.equal(r.steps[0].note, 'the Editor crashed');
  assert.equal(r.failed, true);
  assert.equal(r.current, 2, 'the next step becomes current');
});

test('the closing comment of a note cannot carry a marker of its own', () => {
  const body = stepCloseBody('failed', { n: 1, total: 1, do: 'x', note: 'saw <!-- huddle-paused --> and <!-- huddle-resumed -->' });
  assert.equal(newestPause([comment(1, body, at(0), COACH)], coach), null);
  assert.match(body, /<!-- huddle-step-failed:1 -->/);
});

test('the markers do not collide with the pause markers or the machine claim, and the other readers ignore them', () => {
  const s = comment(1, stepsBody(list()), at(0));
  const c = comment(2, stepCloseBody('done', { n: 1, total: 2, do: 'x' }), at(1), COACH);
  assert.equal(newestPause([s, c]), null);
  assert.equal(newestClaim([s, c]), null);
  const others = [
    comment(3, '⏸️ Paused by the Coach: x\n\n<!-- huddle-paused -->\n', at(2), COACH),
    comment(4, '▶️ Resumed by the Coach\n\n<!-- huddle-resumed -->\n', at(3), COACH),
    comment(5, '🖥️ Working on this from m\n\n<!-- huddle-machine: abc -->\n', at(4)),
  ];
  assert.equal(readSteps(others, coach), null);
  assert.deepEqual(CLOSE_KINDS, ['done', 'failed', 'skipped']);
});

test('the writer refuses a step with two actions', () => {
  for (const bad of [
    'Open the Editor and then press Play.',
    'Open the Editor, then press Play.',
    'Open the Editor; then press Play.',
    'Open the Editor. Press Play.',
    '1. Open the Editor 2. Press Play',
  ]) assert.throws(() => stepsBody({ reason: 'r', steps: [{ ...step(), do: bad }] }), /two actions/, bad);
  for (const good of ['Open the Editor on branch h1-x.', 'Open the Package Manager and the Editor window you already use.', 'Check the Denied counter in Staging: it is not 0.']) {
    assert.doesNotThrow(() => stepsBody({ reason: 'r', steps: [{ ...step(), do: good }] }), good);
  }
});

test('the writer refuses a step that tells the person to type a huddle command', () => {
  for (const bad of ['Run huddle pause 101 --off in a terminal.', 'Type `huddle steps 5 --done`.', 'Paste node bin/huddle doctor.', 'Run `/huddle-steps 5`.']) {
    assert.throws(() => stepsBody({ reason: 'r', steps: [{ ...step(), do: bad }] }), /huddle command/, bad);
  }
  assert.throws(() => stepsBody({ reason: 'r', steps: [{ ...step(), else: 'Run huddle doctor.' }] }), /huddle command/);
  assert.doesNotThrow(() => stepsBody({ reason: 'r', steps: [{ ...step(), do: 'Open the Huddle dashboard page in the browser.' }] }));
});

test('the writer refuses an empty list, a step with a missing part, an unknown ending and text that holds a marker', () => {
  assert.throws(() => stepsBody({ reason: 'r', steps: [] }), /at least one step/);
  assert.throws(() => stepsBody({ reason: 'r', steps: [{ ...step(), see: '' }] }), /should see/);
  assert.throws(() => stepsBody({ reason: 'r', steps: [{ ...step(), else: ' ' }] }), /something else/);
  assert.throws(() => stepsBody({ reason: 'r', steps: [step()], then: 'merge' }), /resume.*none/);
  assert.throws(() => stepsBody({ reason: '', steps: [step()] }), /reason/);
  assert.throws(() => stepsBody({ reason: 'r', steps: [{ ...step(), do: 'Open <!-- huddle-paused --> it.' }] }), /marker/);
  assert.deepEqual(checkStep(step()), []);
  assert.ok(checkStep({ do: '', see: '', else: '' }).length >= 3);
});

test('normal good steps stay accepted: a plain «and <verb>», verbs inside quoted names, a single sentence', () => {
  for (const good of [
    'Press Play on the Activity scene and tap Denied.',
    'Open the folder named "Run and Build".',
    'Log in to the app and open the Settings page.',
    'Log in with the test account and open the Settings page.',
    'Tap the Save button and check the number at the top.',
    'Sign in as the tester and add a comment.',
    'Open the Unity Editor on the main checkout.',
    'Check that the Denied counter is not 0 in Staging.',
    'Open the Huddle dashboard.',
    'Huddle up with the team in the meeting room.',
  ]) assert.deepEqual(checkStep({ ...step(), do: good }), [], good);
});

test('the refusals stay: then, after that, a second action sentence, a second numbered action, and a typed command', () => {
  for (const bad of [
    'Open the Editor and then press Play.',
    'Open the Editor, then press Play.',
    'Open the Editor. After that press Play.',
    'Open the Editor after that press Play.',
    'Open the Editor. Press Play.',
    '1. Open the Editor 2. Press Play',
  ]) assert.match(checkStep({ ...step(), do: bad }).join(), /two actions/, bad);
  for (const bad of ['huddle pause 5 --off', 'huddle steps 3 --done']) assert.match(checkStep({ ...step(), do: bad }).join(), /huddle command/, bad);
});

test('the writer refuses a list that is too big, with a clear message', () => {
  assert.throws(() => stepsBody({ reason: 'r', steps: Array.from({ length: 21 }, () => step()) }), /at most 20 steps/);
  assert.throws(() => stepsBody({ reason: 'r', steps: [{ ...step(), see: 'x'.repeat(501) }] }), /step 1: .*500 characters/);
  assert.doesNotThrow(() => stepsBody({ reason: 'r', steps: Array.from({ length: 20 }, () => step()) }));
});
