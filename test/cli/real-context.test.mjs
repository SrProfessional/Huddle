// Issue #69: the real `ctx` from lib/cli/main.mjs, not a fake. Its `now()` must work for progress (the 90-day window) and for the
// update notice (the 24 h cache) at the same time. In 0.4.0 it returned milliseconds and progress threw «now.getTime is not a function».
// The network and the cache file stay fake: only the clock is the real one.
import test from 'node:test';
import assert from 'node:assert/strict';
import { realContext } from '../../lib/cli/main.mjs';
import { windowStart } from '../../lib/core/progress.mjs';
import { latestRelease, markShown, noticeDue } from '../../lib/core/update.mjs';
import { fakeNow } from './harness.mjs';

test('the real ctx.now() gives the progress window without error', () => {
  const ctx = realContext(process.cwd(), []);
  const since = windowStart(ctx.now());
  const days = (Date.now() - Date.parse(since)) / 86_400_000;
  assert.ok(days > 89.9 && days < 90.1, `window starts ${days} days ago`);
});

test('the real ctx.now() drives the update cache: one lookup a day, one notice a day', async () => {
  const ctx = realContext(process.cwd(), []);
  const files = new Map();
  let lookups = 0;
  ctx.readFile = (p) => files.get(p) ?? null;
  ctx.writeFile = (p, t) => files.set(p, t);
  ctx.updateCachePath = '/data/huddle-update.json';
  ctx.fetch = async () => { lookups += 1; return { ok: true, status: 200, json: async () => ({ tag_name: 'v9.9.9' }) }; };
  assert.equal(await latestRelease(ctx), '9.9.9');
  assert.equal(await latestRelease(ctx), '9.9.9');
  assert.equal(lookups, 1, 'the second call reads the cache');
  assert.equal(noticeDue(ctx), true);
  markShown(ctx);
  assert.equal(noticeDue(ctx), false);
});

test('fakeNow (the clock every CLI test uses) has the real shape: a Date', () => {
  assert.ok(realContext(process.cwd(), []).now() instanceof Date);
  assert.ok(fakeNow(Date.parse('2026-11-10T09:00:00Z'))() instanceof Date);
});
