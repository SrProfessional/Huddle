// Issue #283: the machines of one login are told apart. Work claimed by another machine does not use this machine's capacity and is not
// offered here, but its allowed files still hold (docs/design.md §24). Canned adapters only, a fake shared folder.
import test from 'node:test';
import assert from 'node:assert/strict';
import { run } from '../../lib/cli/run.mjs';
import { claimBody } from '../../lib/core/machine.mjs';
import { harness, request } from './harness.mjs';

const body = (effort, files) => `## Depends on\n\n- None\n\n## Effort\n\n${effort}\n\n## Allowed files\n\n${files.map((f) => `- \`${f}\``).join('\n')}\n`;
const claim = (issue, id, name, at, cid) => (w) => w.comment(issue, { id: cid, author: 'ana', body: claimBody({ id, name }), createdAt: at });
const key = (p) => p.split(String.fromCharCode(92)).join('/');

// The shared folder of one machine: its id, its name and its host name. The default machine is `me-id`, named `ana-pc`.
const asMachine = (h, { id = 'me-id', name = 'ana-pc' } = {}) => {
  const machineFile = '/home/.huddle/machine.json';
  h.ctx.sharedDir = '/home/.huddle';
  h.ctx.updateCachePath = '/home/.huddle/u.json';
  h.ctx.hostName = () => name;
  if (!h.ctx.rawFiles) {
    h.ctx.rawFiles = { read: h.ctx.readFile, write: h.ctx.writeFile };
  }
  const { read, write } = h.ctx.rawFiles;
  write(machineFile, JSON.stringify({ id, name }));
  h.ctx.readFile = (p) => read(p);
  h.ctx.writeFile = (p, t) => write(p, t);
  return { read: () => read(machineFile) };
};

const world = (claims = () => {}) => (w) => {
  w.issue({ number: 5, title: 'Started elsewhere', body: body(2, ['api/a.mjs']), assignees: ['ana'], labels: ['in progress'] });
  w.issue({ number: 6, title: 'Started here', body: body(1, ['api/b.mjs']), assignees: ['ana'], labels: ['in progress'] });
  w.issue({ number: 10, title: 'Ready', body: body(3, ['web/x.tsx']), assignees: ['ana'], labels: ['assigned'] });
  w.issue({ number: 12, title: 'Shares a file with #5', body: body(1, ['api/a.mjs']), assignees: ['ana'], labels: ['assigned'] });
  w.issue({ number: 13, title: 'Shares a file with #6', body: body(1, ['api/b.mjs']), assignees: ['ana'], labels: ['assigned'] });
  claims(w);
};
const mk = ({ claims, gitlab = false } = {}) => {
  const h = harness({ gitlab, setup: world(claims), wrap: (a) => ({ ...a, me: async () => 'ana' }) });
  asMachine(h);
  return h;
};
const next = async (h) => { h.out.length = 0; assert.equal(await run(['next', '--json'], h.ctx), 0); return JSON.parse(h.text()); };

for (const gitlab of [false, true]) {
  const on = gitlab ? 'GitLab' : 'GitHub';

  test(`${on}: huddle machine prints the id and the name; huddle machine <name> sets the name`, async () => {
    const h = harness({ gitlab, setup: world() });
    const m = asMachine(h, { id: 'abc-123', name: 'ana-pc' });
    assert.equal(await run(['machine'], h.ctx), 0);
    assert.match(h.text(), /abc-123/);
    assert.match(h.text(), /ana-pc/);
    h.out.length = 0;
    assert.equal(await run(['machine', 'mac mini'], h.ctx), 0);
    assert.match(h.text(), /mac mini/);
    assert.equal(JSON.parse(m.read()).id, 'abc-123');
  });

  test(`${on}: work claimed by another machine does not use this machine's points, is listed apart, and its files still hold`, async () => {
    const h = mk({ gitlab, claims: (w) => { claim(5, 'other-id', 'mac-mini', '2026-11-22T10:00:00Z', 501)(w); claim(6, 'me-id', 'ana-pc', '2026-11-22T10:00:00Z', 601)(w); } });
    const r = await next(h);
    assert.equal(r.used, 1, 'only #6 (this machine) counts; #5 runs on the mac-mini');
    assert.deepEqual(r.elsewhere.map((e) => [e.issue, e.machine]), [[5, 'mac-mini']]);
    assert.deepEqual(r.start.map((s) => s.issue), [10], '#10 (3 points) fits next to #6 (1): 4 of 5');
    const why = Object.fromEntries(r.wait.map((x) => [x.issue, x.why]));
    assert.equal(why[12], 'shares api/a.mjs with #5, which runs on mac-mini');
    assert.match(why[13], /shares api\/b\.mjs with #6/);
    assert.ok(!r.start.some((s) => s.issue === 5 || s.issue === 12));
    h.out.length = 0;
    await run(['next'], h.ctx);
    assert.match(h.text(), /Capacity: 5 points, 1 in use/);
    assert.match(h.text(), /running on other machines: #5 \(mac-mini\)/);
  });
}

test('with no claim, or a claim by this machine, the result is the same as today', async () => {
  const none = await next(mk());
  assert.equal(none.used, 3, '#5 and #6 both count when no claim says otherwise');
  assert.deepEqual(none.elsewhere, []);
  assert.deepEqual(none.start, [], '#10 needs 3 and only 2 are free');
  const mine = await next(mk({ claims: claim(5, 'me-id', 'ana-pc', '2026-11-22T10:00:00Z', 501) }));
  assert.equal(mine.used, 3);
  assert.deepEqual(mine.elsewhere, []);
});

test('the newest claim wins', async () => {
  const r = await next(mk({ claims: (w) => { claim(5, 'other-id', 'mac-mini', '2026-11-22T10:00:00Z', 501)(w); claim(5, 'me-id', 'ana-pc', '2026-11-22T11:00:00Z', 502)(w); } }));
  assert.equal(r.used, 3, 'the later claim moved #5 back here');
  assert.deepEqual(r.elsewhere, []);
});

test('the claims are read for the active Issues only', async () => {
  const r = await next(mk({ claims: claim(10, 'other-id', 'mac-mini', '2026-11-22T10:00:00Z', 1001) }));
  assert.deepEqual(r.elsewhere, [], '#10 is only assigned: nobody works on it, its stale claim means nothing');
});

const fresh = (id, name) => {
  const h = harness({ setup: (w) => w.issue({ number: 7, title: 'New', body: body(1, ['n.mjs']), assignees: ['ana'], labels: ['assigned'] }), wrap: (a) => ({ ...a, me: async () => 'ana' }) });
  asMachine(h, { id, name });
  return h;
};
const claimsOn = (h, n) => h.world.commentsOf(n).filter((c) => /huddle-machine/.test(c.body));

test('labels --started leaves one claim; the same machine again adds none; another machine starting it by hand takes the work', async () => {
  const h = fresh('me-id', 'ana-pc');
  assert.equal(await run(['labels', '--issue', '7', '--started'], h.ctx), 0);
  assert.equal(claimsOn(h, 7).length, 1);
  assert.match(claimsOn(h, 7)[0].body, /🖥️ Working on this from ana-pc/);
  assert.match(claimsOn(h, 7)[0].body, /<!-- huddle-machine: me-id -->/);
  assert.equal(await run(['labels', '--issue', '7', '--started'], h.ctx), 0);
  assert.equal(claimsOn(h, 7).length, 1, 'the same machine again: nothing new');
  asMachine(h, { id: 'mac-id', name: 'mac-mini' });
  assert.equal(await run(['labels', '--issue', '7', '--started'], h.ctx), 0);
  assert.equal(claimsOn(h, 7).length, 2, 'another machine starts it by hand: it takes the work');
  assert.match(claimsOn(h, 7).at(-1).body, /huddle-machine: mac-id/);
});

test('--dry-run leaves no claim, and a plain labels run leaves none either', async () => {
  const h = fresh('me-id', 'ana-pc');
  assert.equal(await run(['labels', '--issue', '7', '--started', '--dry-run'], h.ctx), 0);
  assert.equal(await run(['labels', '--issue', '7'], h.ctx), 0);
  assert.equal(h.world.commentsOf(7).length, 0);
});

test('huddle take leaves a claim when it takes a request', async () => {
  const h = harness({
    setup: (w) => { w.issue({ number: 3, title: 'Came back', body: body(2, ['c.mjs']), assignees: ['ana'], labels: ['changes requested from Coach'], reviews: [30] }); w.review({ number: 30 }); w.comment(30, request(300)); },
    wrap: (a) => ({ ...a, me: async () => 'ana' }),
  });
  asMachine(h, { id: 'me-id', name: 'ana-pc' });
  assert.equal(await run(['take', '3'], h.ctx), 0);
  assert.equal(claimsOn(h, 3).length, 1);
  assert.match(claimsOn(h, 3)[0].body, /huddle-machine: me-id/);
});

test('an Issue running on another machine with a request that came back is not resumed here, and still holds its files', async () => {
  const h = harness({
    setup: (w) => {
      w.issue({ number: 3, title: 'Came back', body: body(2, ['c.mjs']), assignees: ['ana'], labels: ['changes requested from Coach'], reviews: [30] });
      w.review({ number: 30 });
      w.comment(30, request(300));
      claim(3, 'other-id', 'mac-mini', '2026-11-22T09:00:00Z', 301)(w);
      w.issue({ number: 4, title: 'Shares', body: body(1, ['c.mjs']), assignees: ['ana'], labels: ['assigned'] });
    },
    wrap: (a) => ({ ...a, me: async () => 'ana' }),
  });
  asMachine(h);
  const r = await next(h);
  assert.deepEqual(r.resume, []);
  assert.equal(r.used, 0);
  assert.deepEqual(r.elsewhere.map((e) => e.issue), [3]);
  assert.match(r.wait.find((x) => x.issue === 4).why, /shares c\.mjs with #3, which runs on mac-mini/);
});

test('huddle status lists the work on other machines apart, from what the last huddle next saw (no network)', async () => {
  const h = mk({ claims: claim(5, 'other-id', 'mac-mini', '2026-11-22T10:00:00Z', 501) });
  await next(h);
  h.out.length = 0;
  assert.equal(await run(['status'], h.ctx), 0);
  assert.match(h.text(), /running on other machines: #5 \(mac-mini\)/);
  h.out.length = 0;
  assert.equal(await run(['status', '--json'], h.ctx), 0);
  assert.deepEqual(JSON.parse(h.text()).elsewhere.map((e) => [e.issue, e.machine]), [[5, 'mac-mini']]);
});
