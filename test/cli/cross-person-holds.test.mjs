// Issue #313: an active Issue of one login holds its allowed files against the candidates of every other login, in `huddle next` and on the board,
// and never uses the other person's points. Canned adapters for GitHub and GitLab (two logins), no real call.
import test from 'node:test';
import assert from 'node:assert/strict';
import { run } from '../../lib/cli/run.mjs';
import { pauseBody } from '../../lib/core/pause.mjs';
import { harness } from './harness.mjs';

const body = (effort, files, deps = '- None') => `## Depends on\n\n${deps}\n\n## Effort\n\n${effort}\n\n## Allowed files\n\n${files.map((f) => `- \`${f}\``).join('\n')}\n`;
const as = (login, setup, gitlab) => {
  const h = harness({ gitlab, setup, wrap: (a) => ({ ...a, me: async () => login }) });
  h.ctx.updateCachePath = '/data/u.json';
  return h;
};
const world = (holderLabels = ['in progress'], extra = () => {}) => (w) => {
  w.issue({ number: 1, title: 'Luis runs', body: body(5, ['scene.unity', 'a.mjs']), assignees: ['luis'], labels: holderLabels, reviews: holderLabels.includes('in review') ? [10] : [] });
  if (holderLabels.includes('in review')) w.review({ number: 10 });
  w.issue({ number: 2, title: 'Ana waits', body: body(1, ['scene.unity']), assignees: ['ana'], labels: ['assigned'] });
  w.issue({ number: 3, title: 'Ana free', body: body(5, ['b.mjs']), assignees: ['ana'], labels: ['assigned'] });
  extra(w);
};
const nextJson = async (h) => { assert.equal(await run(['next', '--json'], h.ctx), 0, h.errText()); return JSON.parse(h.text()); };

for (const gitlab of [false, true]) {
  const on = gitlab ? 'GitLab' : 'GitHub';

  test(`${on}: next never offers an Issue that shares a file with another person's active Issue, and says whose it is`, async () => {
    const r = await nextJson(as('ana', world(), gitlab));
    assert.deepEqual(r.start.map((i) => i.issue), [3], 'the full-capacity Issue starts: luis uses none of ana\'s room');
    assert.match(r.wait.find((w) => w.issue === 2).why, /^shares scene\.unity with #1, which runs for luis/);
    assert.equal(r.used, 0, 'the other login\'s points are not ana\'s');
    assert.equal(r.capacity, 5);
  });

  test(`${on}: the board shows blocked with the reason, and the holder's own capacity is unchanged for luis`, async () => {
    const h = as('ana', world(), gitlab);
    assert.equal(await run(['labels'], h.ctx), 0, h.errText());
    assert.deepEqual(h.world.labelsOf(2), ['blocked']);
    assert.deepEqual(h.world.labelsOf(3), ['assigned']);
    assert.match(h.text(), /#2 → blocked − assigned \(waits for #1: shares scene\.unity with #1, which runs for luis\)/);
  });

  test(`${on}: back to assigned when the holder is no longer active`, async () => {
    const h = as('ana', world(), gitlab);
    await run(['labels'], h.ctx);
    h.world.issue({ number: 1, title: 'Luis runs', body: body(5, ['scene.unity', 'a.mjs']), assignees: ['luis'], labels: ['in review'], reviews: [10] });
    h.world.review({ number: 10 });
    h.out.length = 0;
    assert.equal(await run(['labels'], h.ctx), 0, h.errText());
    assert.deepEqual(h.world.labelsOf(2), ['assigned']);
    const r = await nextJson(as('ana', (w) => { world(['in review'])(w); }, gitlab));
    assert.ok(r.start.some((i) => i.issue === 2), 'next offers it again');
  });

  test(`${on}: a scoped run on the holder blocks the other person's waiter at once`, async () => {
    const h = as('luis', world(['assigned']), gitlab);
    assert.equal(await run(['labels', '--issue', '1', '--started'], h.ctx), 0, h.errText());
    assert.deepEqual(h.world.labelsOf(1), ['in progress']);
    assert.deepEqual(h.world.labelsOf(2), ['blocked'], 'ana\'s Issue waits for luis\'s');
  });

  test(`${on}: another person's explicitly paused Issue holds nothing on the board`, async () => {
    const paused = (w) => w.comment(1, { id: 900, author: 'SrProfessional', body: pauseBody('later'), createdAt: '2026-11-23T10:00:00Z' });
    const h = as('ana', world(['in progress'], paused), gitlab);
    assert.equal(await run(['labels'], h.ctx), 0, h.errText());
    assert.deepEqual(h.world.labelsOf(2), ['assigned']);
  });

  test(`${on}: work of the same login behaves as before`, async () => {
    const h = as('ana', (w) => {
      w.issue({ number: 1, title: 'Ana runs', body: body(2, ['scene.unity']), assignees: ['ana'], labels: ['in progress'] });
      w.issue({ number: 2, title: 'Ana waits', body: body(1, ['scene.unity']), assignees: ['ana'], labels: ['assigned'] });
    }, gitlab);
    const r = await nextJson(h);
    assert.match(r.wait.find((w) => w.issue === 2).why, /^shares scene\.unity with #1: it waits until that one is done/);
    assert.equal(r.used, 2);
  });
}
