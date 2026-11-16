// Issue #191: the watch comes on time and a failing round shows. A round starts every <interval> from the start of the previous one; the
// full labels pass runs at most every 15 minutes; the heartbeat is written only after a good round, and a failing round records its error.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { run } from '../../lib/cli/run.mjs';
import { harness, fakeNow } from './harness.mjs';

const MANAGED = '## Depends on\n\n- None\n';
const T0 = Date.parse('2026-11-16T19:48:00Z');
const MIN = 60 * 1000;

/**
 * A harness on a fake clock. Each call to listClosedIssues (the full labels pass) moves the clock `labelsMinutes`; each sleep is recorded and
 * moves the clock by what it sleeps; the loop ends after `rounds` sleeps. `failing` makes every queue read throw.
 */
function mk({ rounds = 1, labelsMinutes = 4, failing = false, setup } = {}) {
  const clock = { now: T0 };
  const slept = [];
  let labelsPasses = 0;
  const h = harness({
    setup: setup ?? ((w) => w.issue({ number: 5, body: MANAGED, labels: ['in progress'], assignees: ['ana'] })),
    wrap: (a) => ({
      ...a,
      listClosedIssues: async (...x) => { labelsPasses += 1; clock.now += labelsMinutes * MIN; return a.listClosedIssues(...x); },
      openReviews: failing ? async () => { throw new Error('API rate limit exceeded'); } : a.openReviews,
    }),
    sleep: async (ms) => { slept.push(ms); clock.now += ms; if (slept.length >= rounds) throw new Error('stop'); },
  });
  h.ctx.updateCachePath = '/data/huddle-update.json';
  h.ctx.now = fakeNow(() => clock.now);
  return { h, clock, slept, passes: () => labelsPasses };
}

test('a round that took 4 minutes sleeps only what is left of the 5-minute interval', async () => {
  const { h, slept } = mk({ rounds: 1, labelsMinutes: 4 });
  await run(['queue', '--wait', '300'], h.ctx).catch(() => {});
  assert.equal(slept[0], 1 * MIN, 'the next round starts 5 minutes after this one started, not 9');
});

test('the labels pass runs on the first round, and not again within 15 minutes', async () => {
  const { h, passes } = mk({ rounds: 3, labelsMinutes: 1 });
  await run(['queue', '--wait', '300'], h.ctx).catch(() => {});
  assert.equal(passes(), 1, 'rounds at 0, 5 and 10 minutes: one labels pass; the next is due at 15');
  const later = mk({ rounds: 4, labelsMinutes: 1 });
  await run(['queue', '--wait', '300'], later.h.ctx).catch(() => {});
  assert.equal(later.passes(), 2, 'by the round at 15 minutes it runs again');
});

test('a failing round records its error and keeps the last good time; status shows it as failing', async () => {
  const ok = mk({ rounds: 1 });
  await run(['queue', '--wait', '300'], ok.h.ctx).catch(() => {});
  const bad = mk({ rounds: 1, failing: true });
  bad.h.ctx.readFile = ok.h.ctx.readFile;
  bad.h.ctx.writeFile = ok.h.ctx.writeFile;
  bad.clock.now = T0 + 6 * MIN;
  await run(['queue', '--wait', '300'], bad.h.ctx).catch(() => {});
  bad.h.out.length = 0;
  await run(['status'], bad.h.ctx);
  assert.match(bad.h.text(), /⚠ watch: last round failed .*API rate limit exceeded/);
  assert.match(bad.h.text(), /last good check 6 minutes ago|last good check 1[01] minutes ago/);
});

test('a Player\'s wait that fails records its error too', async () => {
  const { h } = mk({
    rounds: 1,
    failing: true,
    setup: (w) => { w.issue({ number: 7, body: MANAGED, assignees: ['ana'], labels: ['in review'], reviews: [70] }); w.review({ number: 70 }); },
  });
  h.ctx.createPlatform = ((orig) => async (cfg) => ({ ...(await orig(cfg)), comments: async () => { throw new Error('network down'); } }))(h.ctx.createPlatform);
  await run(['wait', '7'], h.ctx).catch(() => {});
  h.out.length = 0;
  await run(['status'], h.ctx);
  assert.match(h.text(), /#7: last round failed .*network down/);
});

const read = (rel) => readFileSync(fileURLToPath(new URL(`../../${rel}`, import.meta.url)), 'utf8').replace(/\s+/g, ' ');

test('the watch skill and the block say to read the queue before saying what waits', () => {
  assert.match(read('skills/huddle-watch/SKILL.md'), /never answer from memory/);
  for (const f of ['templates/CLAUDE.huddle.md', 'CLAUDE.md']) assert.match(read(f), /read it now with `huddle queue`, never from memory/, f);
});
