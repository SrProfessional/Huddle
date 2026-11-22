// Issue #243: the Coach's watch checks every 2 minutes by default; an explicit interval still wins.
import test from 'node:test';
import assert from 'node:assert/strict';
import { run } from '../../lib/cli/run.mjs';
import { harness } from './harness.mjs';

const MANAGED = '## Depends on\n\nNone.\n';
const STOP = new Error('test: stop the loop');

// The loop sleeps the interval minus the time the round took, so allow a small slack.
const near = (ms, s) => ms <= s * 1000 && ms > s * 1000 - 5000;

/** Runs one quiet round (nothing waits), records the first sleep in ms and stops the loop. */
async function firstSleep(args) {
  const slept = [];
  const h = harness({ sleep: async (ms) => { slept.push(ms); throw STOP; } });
  h.ctx.updateCachePath = '/data/huddle-update.json';
  await run(args, h.ctx).catch(() => {});
  return slept[0];
}

test('queue --wait with no seconds sleeps 120 s between rounds', async () => {
  assert.ok(near(await firstSleep(['queue', '--wait']), 120));
  assert.ok(near(await firstSleep(['queue', '--wait', '--seen', '#1']), 120));
});

test('an explicit interval wins over the default', async () => {
  assert.ok(near(await firstSleep(['queue', '--wait', '600']), 600));
});
