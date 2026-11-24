// Issue #338: `huddle steps` lists the steps only the person can do, and the Coach's login closes them one by one; the last «done» of a list that says
// `resume` puts the Issue back in play exactly as `huddle pause <n> --off` does (docs/design.md §13 and §24). Canned adapters for GitHub and GitLab.
import test from 'node:test';
import assert from 'node:assert/strict';
import { run } from '../../lib/cli/run.mjs';
import { pauseBody } from '../../lib/core/pause.mjs';
import { stepsBody } from '../../lib/core/steps.mjs';
import { harness } from './harness.mjs';

const body = (effort, files, deps = '- None') => `## Depends on\n\n${deps}\n\n## Effort\n\n${effort}\n\n## Allowed files\n\n${files.map((f) => `- \`${f}\``).join('\n')}\n`;
const step = (what) => ({ do: what, see: 'The Console is empty.', else: 'Send a screenshot to the Coach.' });
const list = (n, { then, reason = 'only a person can run the Editor', steps } = {}) => stepsBody({ reason, then, steps: steps ?? [step(`Open the Editor on branch h${n}-x.`), step('Press Play.'), step('Check the Denied counter in Staging.')] });
const put = (issue, id, text, createdAt, author = 'ana') => (w) => w.comment(issue, { id, author, body: text, createdAt });
const COACH = 'SrProfessional';
const mine = (n, h) => h.world.commentsOf(n);
const asAna = (setup, gitlab) => harness({ gitlab, setup, wrap: (a) => ({ ...a, me: async () => 'ana' }) });

const world = (w) => {
  w.issue({ number: 101, title: 'Editor one', body: body(2, ['a.mjs']), assignees: [COACH], labels: ['in progress'] });
  w.issue({ number: 117, title: 'Tablet one', body: body(1, ['b.mjs']), assignees: [COACH], labels: ['in progress'] });
  w.issue({ number: 120, title: 'Waits for 117', body: body(1, ['c.mjs'], '- #117'), assignees: [COACH], labels: [] });
  w.issue({ number: 121, title: 'Waits for 120', body: body(1, ['d.mjs'], '- #120'), assignees: [COACH], labels: [] });
  w.issue({ number: 130, title: 'No steps', body: body(1, ['e.mjs']), assignees: [COACH], labels: ['in progress'] });
  w.issue({ number: 140, title: 'Someone else', body: body(1, ['f.mjs']), assignees: ['luis'], labels: ['in progress'] });
  put(101, 1, list(101), '2026-11-02T10:00:00Z')(w);
  put(117, 2, list(117, { steps: [step('Open the app on the tablet.')] }), '2026-11-03T10:00:00Z')(w);
  put(140, 3, list(140), '2026-11-01T10:00:00Z', 'luis')(w);
};

for (const gitlab of [false, true]) {
  const on = gitlab ? 'GitLab' : 'GitHub';

  test(`${on}: huddle steps lists the current step of the login's Issues, the one most work waits for first, then the oldest`, async () => {
    const h = harness({ gitlab, setup: world });
    assert.equal(await run(['steps'], h.ctx), 0);
    const lines = h.out.filter((l) => /^#\d+ step/.test(l));
    assert.equal(lines.length, 2, 'only the login Issues with a list: #130 has none, #140 is luis');
    assert.match(lines[0], /^#117 step 1 of 1: Open the app on the tablet\./);
    assert.match(lines[0], /2 other Issues wait/, '#120 waits for it and #121 for #120');
    assert.match(lines[1], /^#101 step 1 of 3: Open the Editor on branch h101-x\./);
    h.out.length = 0;
    assert.equal(await run(['steps', '--json'], h.ctx), 0);
    const j = JSON.parse(h.text());
    assert.deepEqual(j.steps.map((s) => [s.issue, s.step, s.of, s.waiting]), [[117, 1, 1, 2], [101, 1, 3, 0]]);
    assert.equal(j.steps[1].reason, 'only a person can run the Editor');
    assert.equal(j.steps[1].then, 'resume');
    assert.equal(j.steps[1].see, 'The Console is empty.');
  });

  test(`${on}: equal waiting goes to the oldest list, and another login sees its own Issues`, async () => {
    const h = harness({ gitlab, setup: (w) => {
      w.issue({ number: 1, title: 'New', body: body(1, ['a']), assignees: ['ana'], labels: ['in progress'] });
      w.issue({ number: 2, title: 'Old', body: body(1, ['b']), assignees: ['ana'], labels: ['in progress'] });
      put(1, 1, list(1), '2026-11-03T10:00:00Z')(w);
      put(2, 2, list(2), '2026-11-02T10:00:00Z')(w);
    }, wrap: (a) => ({ ...a, me: async () => 'ana' }) });
    await run(['steps', '--json'], h.ctx);
    assert.deepEqual(JSON.parse(h.text()).steps.map((s) => s.issue), [2, 1]);
  });

  test(`${on}: nothing waiting is said in one line, and a finished list is not listed`, async () => {
    const h = harness({ gitlab, setup: (w) => w.issue({ number: 5, title: 'x', body: body(1, ['a']), assignees: [COACH], labels: [] }) });
    assert.equal(await run(['steps'], h.ctx), 0);
    assert.match(h.text(), /No steps wait for you/);
    h.out.length = 0;
    await run(['steps', '--json'], h.ctx);
    assert.deepEqual(JSON.parse(h.text()), { steps: [] });
  });

  test(`${on}: --done closes the current step with a marker comment, runs the labels, and the next step becomes current`, async () => {
    const h = harness({ gitlab, setup: world });
    assert.equal(await run(['steps', '101', '--done'], h.ctx), 0);
    const posted = mine(101, h).at(-1).body;
    assert.match(posted, /Step 1 of 3 done: Open the Editor on branch h101-x\./);
    assert.match(posted, /<!-- huddle-step-done:1 -->/);
    assert.match(h.text(), /step 2 of 3: Press Play\./);
    assert.deepEqual(h.world.labelsOf(101), ['in progress'], 'huddle labels --issue 101 ran');
    h.out.length = 0;
    await run(['steps', '--json'], h.ctx);
    assert.deepEqual(JSON.parse(h.text()).steps.filter((s) => s.issue === 101).map((s) => [s.step, s.of]), [[2, 3]]);
  });

  test(`${on}: --skip and --failed need a note, and leave it in the comment`, async () => {
    const h = harness({ gitlab, setup: world });
    assert.equal(await run(['steps', '101', '--skip'], h.ctx), 2);
    assert.equal(await run(['steps', '101', '--failed'], h.ctx), 2);
    assert.equal(mine(101, h).length, 1, 'only the list: nothing was posted');
    assert.equal(await run(['steps', '101', '--skip', '--note', 'no tablet needed'], h.ctx), 0);
    assert.match(mine(101, h).at(-1).body, /Note: no tablet needed/);
    assert.match(mine(101, h).at(-1).body, /<!-- huddle-step-skipped:1 -->/);
  });

  test(`${on}: only the Coach's login can close a step, with one clear line and no change`, async () => {
    const h = asAna((w) => {
      w.issue({ number: 7, title: 'Mine', body: body(1, ['a']), assignees: ['ana'], labels: ['in progress'] });
      put(7, 1, list(7), '2026-11-02T10:00:00Z')(w);
    }, gitlab);
    for (const flags of [['--done'], ['--failed', '--note', 'x'], ['--skip', '--note', 'x']]) {
      h.out.length = 0;
      assert.equal(await run(['steps', '7', ...flags], h.ctx), 1);
      assert.match(h.text(), /only the Coach \(SrProfessional\) can close a step; nothing changed/);
    }
    assert.equal(mine(7, h).length, 1);
    h.out.length = 0;
    assert.equal(await run(['steps'], h.ctx), 0, 'anyone can read their steps');
    assert.match(h.text(), /#7 step 1 of 3/);
  });

  test(`${on}: the last step done resumes the Issue exactly as huddle pause <n> --off does`, async () => {
    const paused = (w) => {
      w.issue({ number: 5, title: 'Paused', body: body(2, ['a.mjs']), assignees: [COACH], labels: ['in progress'] });
      put(5, 1, pauseBody('waiting for the person'), '2026-11-01T10:00:00Z', COACH)(w);
      put(5, 2, list(5, { steps: [step('Open the Editor.'), step('Press Play.')] }), '2026-11-02T10:00:00Z')(w);
    };
    const viaSteps = harness({ gitlab, setup: paused });
    assert.equal(await run(['steps', '5', '--done'], viaSteps.ctx), 0);
    assert.doesNotMatch(mine(5, viaSteps).map((c) => c.body).join('\n'), /huddle-resumed/, 'one step left: still paused');
    viaSteps.out.length = 0;
    assert.equal(await run(['steps', '5', '--done'], viaSteps.ctx), 0);
    const viaPause = harness({ gitlab, setup: paused });
    assert.equal(await run(['pause', '5', '--off'], viaPause.ctx), 0);
    const resumeOf = (h) => mine(5, h).at(-1).body;
    assert.equal(resumeOf(viaSteps), resumeOf(viaPause), 'the very same resume comment');
    assert.match(resumeOf(viaSteps), /<!-- huddle-resumed -->/);
    assert.match(viaSteps.text(), /#5 is back in play: it counts for its Player's capacity again\./, 'the same line as huddle pause --off');
    assert.match(mine(5, viaSteps).at(-2).body, /<!-- huddle-step-done:2 -->/, 'the step closes first, then the Issue resumes');
    assert.deepEqual(viaSteps.world.labelsOf(5), viaPause.world.labelsOf(5));
  });

  test(`${on}: an Issue that is not paused resumes the same way (the resume comment is the one of pause --off)`, async () => {
    const h = harness({ gitlab, setup: (w) => {
      w.issue({ number: 6, title: 'x', body: body(1, ['a']), assignees: [COACH], labels: ['in progress'] });
      put(6, 1, list(6, { steps: [step('Open the Editor.')] }), '2026-11-02T10:00:00Z')(w);
    } });
    assert.equal(await run(['steps', '6', '--done'], h.ctx), 0);
    assert.match(mine(6, h).at(-1).body, /<!-- huddle-resumed -->/);
  });

  test(`${on}: a list that ends with none does not resume, and a skipped last step does`, async () => {
    const h = harness({ gitlab, setup: (w) => {
      w.issue({ number: 6, title: 'x', body: body(1, ['a']), assignees: [COACH], labels: ['in progress'] });
      put(6, 1, list(6, { then: 'none', steps: [step('Open the Editor.')] }), '2026-11-02T10:00:00Z')(w);
      w.issue({ number: 8, title: 'y', body: body(1, ['b']), assignees: [COACH], labels: ['in progress'] });
      put(8, 2, list(8, { steps: [step('Open the Editor.')] }), '2026-11-02T10:00:00Z')(w);
    } });
    assert.equal(await run(['steps', '6', '--done'], h.ctx), 0);
    assert.doesNotMatch(mine(6, h).map((c) => c.body).join('\n'), /huddle-resumed/);
    assert.match(h.text(), /list is finished/i);
    assert.equal(await run(['steps', '8', '--skip', '--note', 'not needed'], h.ctx), 0);
    assert.match(mine(8, h).at(-1).body, /<!-- huddle-resumed -->/);
  });

  test(`${on}: --failed does not resume the Issue and says to open /huddle-bug`, async () => {
    const h = harness({ gitlab, setup: (w) => {
      w.issue({ number: 5, title: 'Paused', body: body(2, ['a.mjs']), assignees: [COACH], labels: ['in progress'] });
      put(5, 1, pauseBody('waiting for the person'), '2026-11-01T10:00:00Z', COACH)(w);
      put(5, 2, list(5, { steps: [step('Open the Editor.')] }), '2026-11-02T10:00:00Z')(w);
    } });
    assert.equal(await run(['steps', '5', '--failed', '--note', 'the Editor crashed'], h.ctx), 0);
    const all = mine(5, h).map((c) => c.body).join('\n');
    assert.match(all, /<!-- huddle-step-failed:1 -->/);
    assert.match(all, /Note: the Editor crashed/);
    assert.doesNotMatch(all, /huddle-resumed/);
    assert.match(h.text(), /\/huddle-bug/);
    assert.match(h.text(), /not resumed|stays paused/);
  });

  test(`${on}: a step failed earlier keeps the Issue paused even when the last step is done`, async () => {
    const h = harness({ gitlab, setup: (w) => {
      w.issue({ number: 5, title: 'x', body: body(2, ['a.mjs']), assignees: [COACH], labels: ['in progress'] });
      put(5, 2, list(5, { steps: [step('Open the Editor.'), step('Press Play.')] }), '2026-11-02T10:00:00Z')(w);
    } });
    await run(['steps', '5', '--failed', '--note', 'crashed'], h.ctx);
    await run(['steps', '5', '--done'], h.ctx);
    assert.doesNotMatch(mine(5, h).map((c) => c.body).join('\n'), /huddle-resumed/);
  });

  test(`${on}: an Issue with no steps, a closed list or no open Issue change nothing`, async () => {
    const h = harness({ gitlab, setup: (w) => {
      world(w);
      w.issue({ number: 9, title: 'Closed', body: body(1, ['x']), state: 'merged' });
    } });
    assert.equal(await run(['steps', '130', '--done'], h.ctx), 1);
    assert.match(h.text(), /#130 has no steps waiting; nothing changed/);
    assert.equal(await run(['steps', '9', '--done'], h.ctx), 1);
    assert.match(h.text(), /#9 is not an open Issue; nothing changed/);
    assert.equal(mine(130, h).length, 0);
    assert.equal(await run(['steps', '117', '--done'], h.ctx), 0);
    h.out.length = 0;
    assert.equal(await run(['steps', '117', '--done'], h.ctx), 1, 'its list is finished');
    assert.match(h.text(), /#117 has no steps waiting; nothing changed/);
  });

  test(`${on}: a Player comment with a closing marker never closes a step`, async () => {
    const h = harness({ gitlab, setup: (w) => {
      world(w);
      put(101, 10, '✅ Step 1 of 3 done: x\n\n<!-- huddle-step-done:1 -->\n', '2026-11-03T10:00:00Z', 'ana')(w);
    } });
    await run(['steps', '--json'], h.ctx);
    assert.equal(JSON.parse(h.text()).steps.find((s) => s.issue === 101).step, 1);
  });
}

test('huddle steps: bad arguments print the usage and change nothing', async () => {
  const h = harness({ setup: world });
  for (const args of [['steps', 'x'], ['steps', '101'], ['steps', '101', '--done', '--failed'], ['steps', '--done'], ['steps', '101', '--note', 'x'], ['steps', '--json', '--done']]) {
    h.err.length = 0;
    assert.equal(await run(args, h.ctx), 2, args.join(' '));
    assert.match(h.errText(), /steps <issue> --done/);
  }
  assert.equal(mine(101, h).length, 1);
});
