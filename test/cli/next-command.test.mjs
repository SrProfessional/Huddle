// Issue #164: `huddle next [--json]` says which of the Player's assigned Issues start now and which wait; `huddle capacity` lowers the
// Player's capacity on this machine (never above what the Coach set) and `reset` restores it. Canned adapter only.
import test from 'node:test';
import assert from 'node:assert/strict';
import { run } from '../../lib/cli/run.mjs';
import { harness, CONFIG } from './harness.mjs';

const body = (effort, files, deps = '- None') => `## Depends on\n\n${deps}\n\n## Effort\n\n${effort}\n\n## Allowed files\n\n${files.map((f) => `- \`${f}\``).join('\n')}\n`;
const world = (w) => {
  w.issue({ number: 5, title: 'Started', body: body(2, ['api/a.mjs']), assignees: ['ana'], labels: ['in progress'] });
  w.issue({ number: 6, title: 'In review', body: body(3, ['api/r.mjs']), assignees: ['ana'], labels: ['in review'], reviews: [60] });
  w.review({ number: 60 });
  w.issue({ number: 10, title: 'Ready small', body: body(1, ['web/x.tsx']), assignees: ['ana'], labels: ['assigned'] });
  w.issue({ number: 11, title: 'Ready big', body: body(3, ['db/y.sql']), assignees: ['ana'], labels: ['assigned'] });
  w.issue({ number: 12, title: 'Shares a file', body: body(1, ['api/a.mjs']), assignees: ['ana'], labels: ['assigned'] });
  w.issue({ number: 13, title: 'Blocked', body: body(1, ['z.mjs'], '- #99'), assignees: ['ana'], labels: ['blocked'] });
  w.issue({ number: 99, title: 'Not merged yet', body: body(1, ['q.mjs']), assignees: ['luis'], labels: ['assigned'] });
  w.issue({ number: 14, title: 'A design', body: `${body(1, ['design/14-x/'])}\n## Screens\n\n- home\n`, assignees: ['ana'], labels: ['assigned', 'design'] });
  w.issue({ number: 20, title: 'Someone else', body: body(1, ['o.mjs']), assignees: ['luis'], labels: ['assigned'] });
};
const asAna = (extra = {}) => {
  const h = harness({ setup: world, wrap: (a) => ({ ...a, me: async () => 'ana' }), ...extra });
  h.ctx.updateCachePath = '/data/u.json';
  return h;
};

test('next --json: in-progress work uses room, in-review uses none, the rest fills the capacity by effort; shared files, blocked and design wait', async () => {
  const h = asAna();
  assert.equal(await run(['next', '--json'], h.ctx), 0);
  const r = JSON.parse(h.text());
  assert.equal(r.capacity, 5);
  assert.equal(r.used, 2, 'only #5 (in progress) uses room; #6 is in review');
  assert.deepEqual(r.start.map((s) => [s.issue, s.effort]), [[10, 1]], '#10 fits (2+1); #11 (3) would make 6');
  const why = Object.fromEntries(r.wait.map((w) => [w.issue, w.why]));
  assert.match(why[11], /no room: 3 of 5 points in use, it needs 3/);
  assert.match(why[12], /shares api\/a\.mjs with #5/);
  assert.match(why[13], /waits for #99/);
  assert.match(why[14], /a Design Issue: work it in a session of its own/);
  assert.ok(!r.start.concat(r.wait).some((x) => x.issue === 20), 'never someone else\'s Issue');
});

test('next prints the same in words', async () => {
  const h = asAna();
  assert.equal(await run(['next'], h.ctx), 0);
  assert.match(h.text(), /Capacity: 5 points, 2 in use/);
  assert.match(h.text(), /Start now:\n  #10 \(effort 1\) Ready small/);
  assert.match(h.text(), /Waits:\n[\s\S]*#11 \(effort 3\): no room/);
});

test('capacity_per_person and capacity in huddle.json set the allowed value', async () => {
  const h = asAna({ config: { ...CONFIG, capacity: 4, capacity_per_person: { ana: 3 } } });
  await run(['next', '--json'], h.ctx);
  assert.equal(JSON.parse(h.text()).capacity, 3);
});

test('huddle capacity lowers it on this machine, refuses to raise it, and reset restores it', async () => {
  const h = asAna();
  assert.equal(await run(['capacity', '3'], h.ctx), 0);
  assert.match(h.text(), /Your capacity in this repo on this machine is now 3 points \(the Coach allows 5\)/);
  h.out.length = 0;
  await run(['next', '--json'], h.ctx);
  assert.equal(JSON.parse(h.text()).capacity, 3);
  h.out.length = 0;
  assert.equal(await run(['capacity', '6'], h.ctx), 1);
  assert.match(h.text(), /can only be lowered: the Coach allows 5/);
  h.out.length = 0;
  assert.equal(await run(['capacity', 'reset'], h.ctx), 0);
  h.out.length = 0;
  await run(['next', '--json'], h.ctx);
  assert.equal(JSON.parse(h.text()).capacity, 5);
});

test('bad arguments are exit 2', async () => {
  for (const args of [['next', 'x'], ['capacity', '0'], ['capacity', 'abc'], ['capacity', '1', '2']]) {
    const h = asAna();
    assert.equal(await run(args, h.ctx), 2, args.join(' '));
  }
});
