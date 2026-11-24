// Issue #339: `huddle next` and the tool slot (docs/design.md §24). An Issue that lists `- Editor: <tool>` under `## Needs` waits while another Issue of the login runs;
// while its test steps are open it holds the slot; closing them frees it. GitHub and GitLab, canned adapters; no git is run.
import test from 'node:test';
import assert from 'node:assert/strict';
import { run } from '../../lib/cli/run.mjs';
import { readSteps } from '../../lib/core/steps.mjs';
import { harness } from './harness.mjs';

const body = (files, needs = '') => `## Depends on\n\n- None\n\n## Effort\n\n1\n\n${needs}## Allowed files\n\n${files.map((f) => `- \`${f}\``).join('\n')}\n`;
const NEEDS = ['## Needs', '', '- Editor: Xcode', '', ''].join('\n');
const LIST = 'Reason: test it in the tool\nStep: Press Play on the scene.\nSee: The Denied counter shows 0.\nOtherwise: Send a screenshot to the Coach.\n';

const build = ({ gitlab, extra }) => {
  let who = 'ana';
  const h = harness({ gitlab, setup: extra, wrap: (a) => ({ ...a, me: async () => who }) });
  h.ctx.updateCachePath = '/data/u.json';
  h.as = (name) => { who = name; };
  return h;
};
const plan = async (h) => { h.out.length = 0; assert.equal(await run(['next', '--json'], h.ctx), 0); return JSON.parse(h.text()); };
const whyOf = (r) => Object.fromEntries(r.wait.map((w) => [w.issue, w.why]));

for (const gitlab of [false, true]) {
  const on = gitlab ? 'GitLab' : 'GitHub';

  test(`${on}: an tool Issue waits for the one that runs, and the plain Issues still start`, async () => {
    const h = build({ gitlab, extra: (w) => {
      w.issue({ number: 5, title: 'Running', body: body(['a.mjs']), assignees: ['ana'], labels: ['in progress'] });
      w.issue({ number: 10, title: 'Needs the tool', body: body(['e.mjs'], NEEDS), assignees: ['ana'], labels: ['assigned'] });
      w.issue({ number: 11, title: 'Plain', body: body(['p.mjs']), assignees: ['ana'], labels: ['assigned'] });
    } });
    const r = await plan(h);
    assert.deepEqual(r.start.map((s) => s.issue), [11]);
    assert.equal(whyOf(r)[10], 'waits for the tool: #5 is running');
    h.out.length = 0;
    await run(['next'], h.ctx);
    assert.match(h.text(), /#10 \(effort 1\): waits for the tool: #5 is running/);
  });

  test(`${on}: with nothing running it starts alone, and the others of its login wait for it`, async () => {
    const h = build({ gitlab, extra: (w) => {
      w.issue({ number: 10, title: 'Needs the tool', body: body(['e.mjs'], NEEDS), assignees: ['ana'], labels: ['assigned'] });
      w.issue({ number: 11, title: 'Plain', body: body(['p.mjs']), assignees: ['ana'], labels: ['assigned'] });
    } });
    const r = await plan(h);
    assert.deepEqual(r.start.map((s) => s.issue), [10]);
    assert.equal(whyOf(r)[11], 'waits for the tool: #10 uses it');
  });

  test(`${on}: it holds the slot from its start until its test steps are closed, then it is released`, async () => {
    const h = build({ gitlab, extra: (w) => {
      w.issue({ number: 7, title: 'Tool work', body: body(['e.mjs'], NEEDS), assignees: ['ana'], labels: ['in review'], reviews: [70] });
      w.review({ number: 70 });
      w.issue({ number: 11, title: 'Plain', body: body(['p.mjs']), assignees: ['ana'], labels: ['assigned'] });
      w.issue({ number: 12, title: 'Needs the tool too', body: body(['f.mjs'], NEEDS), assignees: ['ana'], labels: ['assigned'] });
    } });
    // in review with no steps: it ended, nothing is held
    assert.deepEqual((await plan(h)).start.map((s) => s.issue), [11]);
    h.ctx.writeFile('/tmp/steps.txt', LIST);
    assert.equal(await run(['steps', '7', '--post', '/tmp/steps.txt'], h.ctx), 0);
    let r = await plan(h);
    assert.deepEqual(r.start, []);
    assert.equal(whyOf(r)[11], 'waits for the tool: #7 uses it');
    assert.equal(whyOf(r)[12], 'waits for the tool: #7 uses it');
    assert.equal(r.used, 0, 'the holder counts only its effort, and an Issue in review has none');
    h.as('SrProfessional');
    h.out.length = 0;
    assert.equal(await run(['steps', '7', '--done'], h.ctx), 0);
    h.as('ana');
    r = await plan(h);
    assert.deepEqual(r.start.map((s) => s.issue), [11], 'the steps are closed: the slot is free');
  });

  test(`${on}: a failed or skipped last step also releases the slot`, async () => {
    for (const close of [['--failed', '--note', 'it crashed'], ['--skip', '--note', 'no time']]) {
      const h = build({ gitlab, extra: (w) => {
        w.issue({ number: 7, title: 'Tool work', body: body(['e.mjs'], NEEDS), assignees: ['ana'], labels: ['in review'], reviews: [70] });
        w.review({ number: 70 });
        w.issue({ number: 11, title: 'Plain', body: body(['p.mjs']), assignees: ['ana'], labels: ['assigned'] });
      } });
      h.ctx.writeFile('/tmp/steps.txt', LIST);
      await run(['steps', '7', '--post', '/tmp/steps.txt'], h.ctx);
      h.as('SrProfessional');
      assert.equal(await run(['steps', '7', ...close], h.ctx), 0);
      h.as('ana');
      assert.deepEqual((await plan(h)).start.map((s) => s.issue), [11]);
    }
  });

  test(`${on}: the slot is per login: another login's tool Issue neither holds nor waits for this one`, async () => {
    const h = build({ gitlab, extra: (w) => {
      w.issue({ number: 7, title: 'Luis runs the tool', body: body(['e.mjs'], NEEDS), assignees: ['luis'], labels: ['in progress'] });
      w.issue({ number: 10, title: 'Ana needs it too', body: body(['f.mjs'], NEEDS), assignees: ['ana'], labels: ['assigned'] });
    } });
    assert.deepEqual((await plan(h)).start.map((s) => s.issue), [10]);
  });

  test(`${on}: an Issue without «## Needs» behaves as before`, async () => {
    const h = build({ gitlab, extra: (w) => {
      w.issue({ number: 5, title: 'Running', body: body(['a.mjs']), assignees: ['ana'], labels: ['in progress'] });
      w.issue({ number: 10, title: 'Plain', body: body(['b.mjs']), assignees: ['ana'], labels: ['assigned'] });
    } });
    const r = await plan(h);
    assert.deepEqual(r.start.map((s) => s.issue), [10]);
    assert.deepEqual(r.wait, []);
  });

  test(`${on}: the person's answer to the checkout question travels as the note of «huddle steps <n> --done --note»`, async () => {
    const h = build({ gitlab, extra: (w) => {
      w.issue({ number: 7, title: 'Tool work', body: body(['e.mjs'], NEEDS), assignees: ['ana'], labels: ['in progress'] });
    } });
    h.ctx.writeFile('/tmp/steps.txt', 'Reason: the main checkout has changes that are not committed\nStep: Choose what happens to the changes in your main checkout: commit them, save them aside with a stash so I can give them back, or ask me to wait.\nSee: Your answer is saved on the Issue.\nOtherwise: Tell me what you saw.\n');
    assert.equal(await run(['steps', '7', '--post', '/tmp/steps.txt'], h.ctx), 0);
    h.as('SrProfessional');
    assert.equal(await run(['steps', '7', '--done', '--note', 'stash'], h.ctx), 0);
    assert.equal(readSteps(h.world.commentsOf(7)).steps[0].note, 'stash');
    assert.equal(await run(['steps', '7', '--done', '--bogus'], h.ctx), 2);
  });
}
