// Issue #157: `huddle queue --wait` is the AI Manager's watch with no Claude tokens: a Node loop that runs the labels pass and reads the queue
// each round, and ends only when something new waits. Canned adapter and a fake sleep: no test calls a real platform or really waits.
import test from 'node:test';
import assert from 'node:assert/strict';
import { run } from '../../lib/cli/run.mjs';
import { harness } from './harness.mjs';

const MANAGED = '## Depends on\n\nNone.\n';
const review = (w) => { w.issue({ number: 42, title: 'Add login form', body: MANAGED, assignees: ['ana'], reviews: [51] }); w.review({ number: 51, head: 'a1b2c3d' }); };
const decision = (w) => {
  w.issue({ number: 47, title: 'Which payment provider?', body: MANAGED, labels: ['needs decision'] });
  w.comment(47, { id: 1, author: 'ana', body: '❓ Decision for the AI Manager: which one?', createdAt: '2026-11-10T10:00:00Z' });
};
const STOP = new Error('test: stop the loop');

/** A harness whose sleep counts the rounds and, after `rounds`, runs `then` (to change the world) or ends the loop. */
function looping({ setup, rounds = 1, then, me } = {}) {
  let n = 0;
  const h = harness({
    setup,
    wrap: me ? (a) => ({ ...a, me: async () => me }) : undefined,
    sleep: async () => { n += 1; if (then && n === rounds) return then(h); if (n >= rounds) throw STOP; },
  });
  h.ctx.updateCachePath = '/data/huddle-update.json';
  h.rounds = () => n;
  return h;
}

test('an unseen item ends the wait at once and prints only the new items', async () => {
  const h = looping({ setup: (w) => { review(w); decision(w); } });
  assert.equal(await run(['queue', '--wait', '300'], h.ctx), 0);
  const out = JSON.parse(h.text());
  assert.deepEqual(out.waiting.map((w) => w.issue), [42, 47]);
  assert.equal(out.waiting[0].head, 'a1b2c3d');
  assert.equal(h.rounds(), 0);
});

test('the queue comes first: with something new it wakes at once, without the slow labels pass (on a real project 15 s against 4m46s)', async () => {
  const calls = [];
  const h = harness({ setup: (w) => { review(w); decision(w); }, wrap: (a) => new Proxy(a, { get: (t, p) => (typeof t[p] === 'function' ? (...args) => { calls.push(String(p)); return t[p](...args); } : t[p]) }) });
  h.ctx.updateCachePath = '/data/huddle-update.json';
  assert.equal(await run(['queue', '--wait', '300'], h.ctx), 0);
  assert.equal(JSON.parse(h.text()).waiting.length, 2);
  assert.ok(!calls.includes('listClosedIssues') && !calls.includes('setLabels'), `no labels pass before waking: ${calls.join(', ')}`);
});

test('seen items do not wake it; a new commit on a seen PR does', async () => {
  const h = looping({ setup: (w) => { review(w); decision(w); }, rounds: 1, then: (hh) => { hh.world.review({ number: 51, head: 'ffff000' }); } });
  assert.equal(await run(['queue', '--wait', '300', '--seen', '51@a1b2c3d,#47'], h.ctx), 0);
  assert.equal(h.rounds(), 1, 'it slept once on the seen items');
  const out = JSON.parse(h.text());
  assert.deepEqual(out.waiting.map((w) => [w.issue, w.head]), [[42, 'ffff000']]);
});

test('nothing new: it keeps waiting, and runs the labels pass each round', async () => {
  const h = looping({ setup: (w) => { decision(w); w.issue({ number: 60, title: 'Ready one', body: MANAGED }); }, rounds: 2 });
  await run(['queue', '--wait', '300', '--seen', '#47'], h.ctx).catch(() => {});
  assert.equal(h.rounds(), 2);
  assert.deepEqual(h.world.labelsOf(60), ['assigned'], 'the labels pass ran: the ready Issue got its label and was assigned');
  assert.doesNotMatch(h.text(), /waiting/);
});

test('--wait-off leaves a stop mark; the loop ends with stopped at its next round, and a new --wait clears an old mark', async () => {
  const h = looping({ setup: decision, rounds: 1, then: async (hh) => { await run(['queue', '--wait-off'], hh.ctx); } });
  assert.equal(await run(['queue', '--wait', '300', '--seen', '#47'], h.ctx), 0);
  assert.match(h.text(), /"stopped": ?true/);
  const again = looping({ setup: (w) => { review(w); } });
  await run(['queue', '--wait-off'], again.ctx);
  assert.equal(await run(['queue', '--wait', '300'], again.ctx), 0);
  assert.equal(JSON.parse(again.text().split('\n').slice(1).join('\n')).waiting[0].issue, 42, 'an old mark does not stop a new watch');
});

test('another login is refused', async () => {
  const h = looping({ setup: review, me: 'ana' });
  assert.equal(await run(['queue', '--wait', '300'], h.ctx), 1);
  assert.match(h.text(), /AI Manager only/);
});

test('bad intervals and arguments are exit 2', async () => {
  for (const args of [['queue', '--wait', '60'], ['queue', '--wait', '4000'], ['queue', '--wait', 'abc'], ['queue', '--seen', '#1'], ['queue', '--wait', '300', '--seen']]) {
    const h = looping({ setup: review });
    assert.equal(await run(args, h.ctx), 2, args.join(' '));
  }
  const dflt = looping({ setup: review });
  assert.equal(await run(['queue', '--wait'], dflt.ctx), 0, 'the interval is optional (default 300)');
});
