// Issue #181: the watch and the review waits leave a heartbeat next to the update cache, so the Coach and a Player can check from any terminal
// that they are alive: `huddle status` (no network, no login) and `huddle doctor` read it. Canned adapter and a fake clock only.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { run } from '../../lib/cli/run.mjs';
import { harness, fakeNow, request } from './harness.mjs';

const MANAGED = '## Depends on\n\n- None\n';
const T0 = Date.parse('2026-11-15T12:00:00Z');
const MIN = 60 * 1000;

/** A harness on a movable clock; its sleep ends the loop after `rounds` rounds. */
function mk({ setup, rounds = 1 } = {}) {
  let n = 0;
  const clock = { now: T0 };
  const h = harness({ setup, sleep: async () => { n += 1; if (n >= rounds) throw new Error('stop'); } });
  h.ctx.updateCachePath = '/data/huddle-update.json';
  h.ctx.now = fakeNow(() => clock.now);
  h.clock = clock;
  return h;
}

test('a round of queue --wait writes the watch heartbeat; status says on; later it is stale; --wait-off clears it', async () => {
  const h = mk({ setup: (w) => w.issue({ number: 5, body: MANAGED, labels: ['in progress'], assignees: ['ana'] }) });
  await run(['queue', '--wait', '300'], h.ctx).catch(() => {});
  h.out.length = 0;
  h.clock.now = T0 + 2 * MIN;
  assert.equal(await run(['status'], h.ctx), 0);
  assert.match(h.text(), /watch: on, (in Claude Code, )?last check 2 minutes ago/);
  h.out.length = 0;
  h.clock.now = T0 + 3 * 60 * MIN;
  await run(['status'], h.ctx);
  assert.match(h.text(), /watch: last check 3 hours ago: the session that ran it is closed or stopped: run \/huddle-watch/);
  await run(['queue', '--wait-off'], h.ctx);
  h.out.length = 0;
  await run(['status'], h.ctx);
  assert.match(h.text(), /watch: off/);
});

test('a round of wait <n> writes the Issue\'s entry; a finished Issue removes it; status shows fresh and stale waits', async () => {
  const h = mk({ setup: (w) => { w.issue({ number: 7, body: MANAGED, assignees: ['ana'], labels: ['in review'], reviews: [70] }); w.review({ number: 70 }); } });
  await run(['wait', '7'], h.ctx).catch(() => {});
  h.out.length = 0;
  h.clock.now = T0 + MIN;
  await run(['status'], h.ctx);
  assert.match(h.text(), /waiting: #7, last check 1 minute ago/);
  h.out.length = 0;
  h.clock.now = T0 + 60 * MIN;
  await run(['status'], h.ctx);
  assert.match(h.text(), /#7: last check 1 hour ago: the session that waited is closed or stopped: run \/huddle-play 7/);
  const done = mk({ setup: (w) => w.issue({ number: 7, state: 'merged', body: MANAGED }) });
  done.ctx.readFile = h.ctx.readFile;
  done.ctx.writeFile = h.ctx.writeFile;
  await run(['wait', '7'], done.ctx);
  h.out.length = 0;
  await run(['status'], h.ctx);
  assert.doesNotMatch(h.text(), /#7/);
});

test('status --json gives the same, and doctor shows the lines', async () => {
  const h = mk({ setup: (w) => w.issue({ number: 5, body: MANAGED, labels: ['in progress'], assignees: ['ana'] }) });
  await run(['queue', '--wait', '300'], h.ctx).catch(() => {});
  h.out.length = 0;
  h.clock.now = T0 + MIN;
  await run(['status', '--json'], h.ctx);
  const j = JSON.parse(h.text());
  assert.equal(j.watch.state, 'on');
  assert.equal(j.watch.ageSeconds, 60);
  assert.deepEqual(j.waits, []);
  h.out.length = 0;
  await run(['doctor'], h.ctx);
  assert.match(h.text(), /✔ watch: on, (in Claude Code, )?last check 1 minute ago/);
});

const read = (rel) => readFileSync(fileURLToPath(new URL(`../../${rel}`, import.meta.url)), 'utf8').replace(/\s+/g, ' ');

test('the watch skill\'s status runs huddle status, and parallel.md names it', () => {
  assert.ok(read('skills/huddle-watch/SKILL.md').includes('node "${CLAUDE_PLUGIN_ROOT}/bin/huddle" status'));
  assert.match(read('skills/huddle-play/parallel.md'), /huddle" status/);
});

void request;
