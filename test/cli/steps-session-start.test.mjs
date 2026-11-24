import test from 'node:test';
import assert from 'node:assert/strict';
import { run } from '../../lib/cli/run.mjs';
import { stepCloseBody, stepsBody } from '../../lib/core/steps.mjs';
import { fakeNow, harness } from './harness.mjs';

const COACH = 'SrProfessional';
const MANAGED = '## Depends on\n\n- None\n';
const first = { do: 'Open the Editor.', see: 'The project opens.', else: 'Send a screenshot.' };
const second = { ...first, do: 'Press Play.' };

function fixture({ gitlab, me = COACH, pending = false } = {}) {
  const h = harness({
    gitlab,
    setup: (w) => {
      for (const [number, assignee] of [[117, COACH], [118, COACH], [119, 'ana']]) {
        w.issue({ number, body: MANAGED, labels: ['in progress'], assignees: [assignee] });
        if (pending || number === 119) {
          w.comment(number, { id: number, author: 'ana', createdAt: `2026-11-24T10:0${number - 117}:00Z`, body: stepsBody({ reason: 'The person has the device.', steps: [first, second] }) });
        }
      }
    },
    wrap: (adapter) => ({ ...adapter, me: async () => me }),
  });
  h.ctx.sharedDir = '/shared';
  h.ctx.now = fakeNow('2026-11-24T11:00:00Z');
  return h;
}

async function start(h) {
  h.out.length = 0;
  const before = h.calls().length;
  assert.equal(await run(['hook'], h.ctx), 0);
  h.startCalls = h.calls().slice(before).map(({ args }) => JSON.stringify(args)).sort();
  return h.text() ? JSON.parse(h.text()) : {};
}

for (const gitlab of [false, true]) {
  const platform = gitlab ? 'GitLab' : 'GitHub';

  test(`${platform} Coach start reports the count and first current action using the existing reads`, async () => {
    const empty = fixture({ gitlab });
    const pending = fixture({ gitlab, pending: true });
    pending.world.comment(117, { id: 200, author: COACH, createdAt: '2026-11-24T10:04:00Z', body: stepCloseBody('done', { n: 1, total: 2, do: first.do }) });
    assert.equal((await start(empty)).systemMessage, undefined);
    const output = await start(pending);
    const reminder = /2 steps wait for you, the first on #117: Press Play\. Run \/huddle-steps\./;
    assert.match(output.systemMessage ?? '', reminder);
    assert.match(output.hookSpecificOutput.additionalContext, reminder);
    assert.doesNotMatch(output.systemMessage, /#118|#119|huddle (?:queue|steps)|\/huddle-(?:review|watch)/);
    assert.deepEqual(pending.startCalls, empty.startCalls);
    assert.equal(pending.writes.length, 0);
  });

  test(`${platform} Player start does not report steps`, async () => {
    const h = fixture({ gitlab, me: 'ana', pending: true });
    assert.doesNotMatch(JSON.stringify(await start(h)), /steps? wait|\/huddle-steps/);
  });

  test(`${platform} Coach start sees a posted step on an assigned Issue and clears it when closed`, async () => {
    const h = fixture({ gitlab });
    h.world.issue({ number: 120, body: MANAGED, assignees: [COACH], labels: ['assigned'] });
    h.ctx.writeFile('/shared/input', 'Reason: The person has the device.\nAfter: none\nStep: Open the Editor.\nSee: The project opens.\nOtherwise: Send a screenshot.');
    const before = await start(h);
    const baselineReads = h.startCalls;
    assert.equal(before.systemMessage, undefined);

    h.ctx.writeFile('/issue-worktree/huddle.json', h.ctx.readFile('/repo/huddle.json'));
    h.ctx.root = '/issue-worktree';
    assert.equal(await run(['steps', '120', '--post', '/shared/input'], h.ctx), 0);
    h.ctx.root = '/repo';
    assert.match((await start(h)).systemMessage, /1 step waits for you on #120: Open the Editor\. Run \/huddle-steps\./);
    assert.deepEqual(h.startCalls, baselineReads);
    assert.equal(await run(['steps', '120', '--done'], h.ctx), 0);
    assert.equal((await start(h)).systemMessage, undefined);
  });

  test(`${platform} Coach start refreshes local steps from comments already read by labels`, async () => {
    const h = fixture({ gitlab });
    h.world.issue({ number: 120, body: MANAGED, assignees: [COACH], labels: ['assigned'] });
    h.world.comment(120, { id: 120, author: 'ana', createdAt: '2026-11-24T10:03:00Z', body: stepsBody({ reason: 'The person has the device.', steps: [first] }) });
    assert.equal(await run(['labels', '--issue', '120'], h.ctx), 0);
    assert.match((await start(h)).systemMessage ?? '', /1 step waits for you on #120: Open the Editor/);

    h.world.comment(120, { id: 121, author: COACH, createdAt: '2026-11-24T10:04:00Z', body: stepCloseBody('done', { n: 1, total: 1, do: first.do }) });
    assert.equal(await run(['labels', '--issue', '120'], h.ctx), 0);
    assert.equal((await start(h)).systemMessage, undefined);
  });
}
