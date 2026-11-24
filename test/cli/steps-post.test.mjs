// Issue #344: `huddle steps <n> --post <file>` posts a list of steps with one command (docs/design.md §13). The file form is read, every refusal posts
// nothing, `--dry-run` prints and posts nothing, any login can post, and the labels run after. Canned adapters for GitHub and GitLab, a fake file.
import test from 'node:test';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { run } from '../../lib/cli/run.mjs';
import { parseStepsFile, readSteps } from '../../lib/core/steps.mjs';
import { harness } from './harness.mjs';

const issueBody = '## Depends on\n\n- None\n\n## Effort\n\n1\n\n## Allowed files\n\n- `a.mjs`\n';
const FILE = [
  'Reason: only a person can run the Editor',
  '',
  'Step: Open the Editor on branch h1-x.',
  'See: The Console is empty.',
  'Otherwise: Send a screenshot to the Coach.',
  '',
  'Step: Press Play.',
  'See: The Denied counter shows 0.',
  'Otherwise: Send a screenshot to the Coach.',
  '',
].join('\n');

const setup = (w) => {
  w.issue({ number: 7, title: 'Editor work', body: issueBody, assignees: ['ana'], labels: ['in progress'] });
  w.issue({ number: 8, title: 'Other', body: issueBody, assignees: ['ana'], labels: [] });
};
const withFile = (text, { gitlab = false, me = 'ana' } = {}) => {
  const h = harness({ gitlab, setup, wrap: (a) => ({ ...a, me: async () => me }) });
  h.ctx.writeFile('/tmp/steps.txt', text);
  return h;
};
const posted = (h, n = 7) => h.world.commentsOf(n).filter((c) => /huddle-steps/.test(c.body));

test('the file form is read: reason, After, steps with See and Otherwise, forgiving of blank lines and CRLF', () => {
  const a = parseStepsFile(FILE);
  assert.equal(a.reason, 'only a person can run the Editor');
  assert.equal(a.then, 'resume');
  assert.deepEqual(a.steps[1], { do: 'Press Play.', see: 'The Denied counter shows 0.', else: 'Send a screenshot to the Coach.' });
  const b = parseStepsFile(`\r\n\r\n${FILE.replace('\n\nStep: Open', '\n\n\n\nStep: Open').replace(/\n/g, '\r\n')}\r\nAfter: none\r\n`);
  assert.equal(b.steps.length, 2);
  assert.equal(b.then, 'none');
  assert.equal(b.reason, 'only a person can run the Editor');
});

test('the file form is strict: a See or Otherwise before any Step, a line it does not know, or no step at all is refused', () => {
  assert.throws(() => parseStepsFile('Reason: x\nSee: y\nStep: z'), /See:.*before the first Step:/);
  assert.throws(() => parseStepsFile('Reason: x\nOtherwise: y\nStep: z'), /Otherwise:.*before the first Step:/);
  assert.throws(() => parseStepsFile('Reason: x\nOpen the app\nStep: z'), /line 2/);
  assert.throws(() => parseStepsFile('Reason: x\n\nSee: y\nOtherwise: z'), /before the first Step:/);
  assert.throws(() => parseStepsFile('Reason: x\n'), /at least one Step:/);
  assert.throws(() => parseStepsFile('Reason: x\nStep: a\nSee: b\nSee: c\nOtherwise: d'), /step 1.*See:.*twice/);
  assert.throws(() => parseStepsFile('Reason: x\nAfter: later\nStep: a\nSee: b\nOtherwise: c'), /After:/);
});

for (const gitlab of [false, true]) {
  const on = gitlab ? 'GitLab' : 'GitHub';

  test(`${on}: --post posts the list built by stepsBody, huddle steps reads it back, and the labels run after`, async () => {
    const h = withFile(FILE, { gitlab });
    assert.equal(await run(['steps', '7', '--post', '/tmp/steps.txt'], h.ctx), 0);
    const comments = posted(h);
    assert.equal(comments.length, 1);
    assert.match(comments[0].body, /🙋 Step 1 of 2: Open the Editor on branch h1-x\./);
    assert.match(h.text(), /#7 step 1 of 2: Open the Editor/);
    h.out.length = 0;
    assert.equal(await run(['steps', '--json'], h.ctx), 0);
    const j = JSON.parse(h.text());
    assert.deepEqual(j.steps.map((s) => [s.issue, s.step, s.of, s.then]), [[7, 1, 2, 'resume']]);
    assert.equal(readSteps(h.world.commentsOf(7)).total, 2);
  });

  test(`${on}: the labels run after the post (a dry run does not)`, async () => {
    const h = withFile(FILE, { gitlab });
    await run(['steps', '7', '--post', '/tmp/steps.txt'], h.ctx);
    assert.match(h.text(), /label change\(s\)\./);
    const dry = withFile(FILE, { gitlab });
    await run(['steps', '7', '--post', '/tmp/steps.txt', '--dry-run'], dry.ctx);
    assert.doesNotMatch(dry.text(), /label change/, 'a dry run touches nothing');
  });

  test(`${on}: any login can post (the Coach closes only), and a later list replaces the earlier one`, async () => {
    const h = withFile(FILE, { gitlab, me: 'someone-else' });
    assert.equal(await run(['steps', '7', '--post', '/tmp/steps.txt'], h.ctx), 0);
    h.ctx.writeFile('/tmp/steps.txt', 'Reason: new reason\nAfter: none\nStep: Press Stop.\nSee: Nothing moves.\nOtherwise: Tell the Coach.\n');
    assert.equal(await run(['steps', '7', '--post', '/tmp/steps.txt'], h.ctx), 0);
    const r = readSteps(h.world.commentsOf(7));
    assert.equal(r.reason, 'new reason');
    assert.equal(r.then, 'none');
    assert.equal(r.total, 1);
  });

  test(`${on}: a step checkStep refuses, a list over the limit or a missing Step posts nothing and names the step`, async () => {
    const two = FILE.replace('Step: Press Play.', 'Step: Press Play and then open the log.');
    const h = withFile(two, { gitlab });
    assert.equal(await run(['steps', '7', '--post', '/tmp/steps.txt'], h.ctx), 1);
    assert.match(h.text(), /step 2: it holds two actions/);
    assert.equal(h.text().split('\n').length, 1, 'one clear line');
    const many = Array.from({ length: 21 }, (_, i) => `Step: Press ${i}.\nSee: ok.\nOtherwise: tell.\n`).join('\n');
    h.ctx.writeFile('/tmp/steps.txt', `Reason: r\n${many}`);
    h.out.length = 0;
    assert.equal(await run(['steps', '7', '--post', '/tmp/steps.txt'], h.ctx), 1);
    assert.match(h.text(), /at most 20 steps/);
    h.ctx.writeFile('/tmp/steps.txt', 'Reason: r\nSee: ok.\nOtherwise: tell.\n');
    h.out.length = 0;
    assert.equal(await run(['steps', '7', '--post', '/tmp/steps.txt'], h.ctx), 1);
    assert.match(h.text(), /before the first Step:/);
    assert.equal(posted(h).length, 0, 'nothing was posted');
  });

  test(`${on}: --dry-run prints the comment and posts nothing; a closed or missing Issue and a missing file are refused`, async () => {
    const h = withFile(FILE, { gitlab });
    assert.equal(await run(['steps', '7', '--post', '/tmp/steps.txt', '--dry-run'], h.ctx), 0);
    assert.match(h.text(), /🙋 Steps for the person: only a person can run the Editor/);
    assert.equal(posted(h).length, 0);
    h.out.length = 0;
    assert.equal(await run(['steps', '99', '--post', '/tmp/steps.txt'], h.ctx), 1);
    assert.match(h.text(), /#99 is not an open Issue; nothing changed\./);
    h.out.length = 0;
    assert.equal(await run(['steps', '7', '--post', '/tmp/none.txt'], h.ctx), 1);
    assert.match(h.text(), /cannot read \/tmp\/none\.txt/);
    assert.equal(posted(h).length, 0);
  });

  test(`${on}: the arguments of --post must fit`, async () => {
    const h = withFile(FILE, { gitlab });
    assert.equal(await run(['steps', '7', '--post'], h.ctx), 2);
    assert.equal(await run(['steps', '7', '--dry-run'], h.ctx), 2);
    assert.equal(await run(['steps', '7', '--post', '/tmp/steps.txt', '--done'], h.ctx), 2);
    assert.equal(await run(['steps', '7', '--dry-run', '--post', '/tmp/steps.txt'], h.ctx), 0);
  });
}

test('the three skills name the command and the file form, and stay within their line limits', () => {
  const root = new URL('../../skills/', import.meta.url);
  for (const [name, limit] of [['huddle-play', 100], ['huddle-issue', 90], ['huddle-steps', 90]]) {
    const text = readFileSync(new URL(`${name}/SKILL.md`, root), 'utf8');
    assert.match(text, /huddle" steps <n> --post <file>/, `${name} names the command`);
    assert.match(text, /Reason:/, `${name} names the file form`);
    assert.ok(text.split('\n').length <= limit, `${name} stays within ${limit} lines`);
  }
});
