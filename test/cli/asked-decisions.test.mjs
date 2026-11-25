// Issue #335, docs/design.md §19: a decision that waits is recorded when asked (`huddle asked <n>`), `queue` says «asked <n> times, last at <time>»,
// and it holds only the Issue that waits for it and what depends on it (by «Depends on» or a shared file): independent reviews go on. Canned adapters only.
import test from 'node:test';
import assert from 'node:assert/strict';
import { run } from '../../lib/cli/run.mjs';
import { harness, fakeNow } from './harness.mjs';

const body = (deps, files) => `## Depends on\n\n${deps}\n\n## Allowed files\n\n${files.map((f) => `- \`${f}\``).join('\n')}\n`;
const world = (w) => {
  w.issue({ number: 47, title: 'Which payment provider?', body: body('- None', ['lib/pay.mjs', 'CHANGELOG.md']), labels: ['needs decision'] });
  w.comment(47, { id: 1, author: 'ana', body: '❓ Decision for the Coach: which one?', createdAt: '2026-11-10T10:00:00Z' });
  w.issue({ number: 48, title: 'Depends on the answer', body: body('- #47', ['lib/b.mjs', 'CHANGELOG.md']), assignees: ['ana'], labels: ['blocked'] });
  w.issue({ number: 49, title: 'Depends on the dependent', body: body('- #48', ['lib/c.mjs']), assignees: ['ana'], labels: ['blocked'] });
  w.issue({ number: 50, title: 'Shares a file, in review', body: body('- None', ['lib/pay.mjs']), assignees: ['ana'], labels: ['in review'], reviews: [500] });
  w.review({ number: 500, head: 'aaa1111' });
  w.issue({ number: 51, title: 'Independent, in review', body: body('- None', ['lib/free.mjs', 'CHANGELOG.md']), assignees: ['ana'], labels: ['in review'], reviews: [510] });
  w.review({ number: 510, head: 'bbb2222' });
};
const T1 = Date.parse('2026-11-24T10:00:00Z');
const mk = (extra = {}) => {
  const h = harness({ setup: world, ...extra });
  h.ctx.sharedDir = '/shared';
  h.ctx.now = fakeNow(T1);
  return h;
};
const json = async (h) => { h.out.length = 0; assert.equal(await run(['queue', '--json'], h.ctx), 0); return JSON.parse(h.text()); };

for (const gitlab of [false, true]) {
  const name = gitlab ? 'GitLab' : 'GitHub';

  test(`${name}: an asked decision is recorded; queue says how many times and when`, async () => {
    const h = mk({ gitlab });
    let q = await json(h);
    assert.equal(q.waiting.find((w) => w.issue === 47).asked, undefined, 'never asked: nothing to say');
    h.out.length = 0;
    assert.equal(await run(['asked', '47'], h.ctx), 0);
    assert.match(h.text(), /#47 asked 1 time, last at 2026-11-24 10:00Z/);
    h.ctx.now = fakeNow(T1 + 3600_000);
    h.out.length = 0;
    assert.equal(await run(['asked', '47'], h.ctx), 0);
    assert.match(h.text(), /#47 asked 2 times, last at 2026-11-24 11:00Z/);
    q = await json(h);
    assert.deepEqual(q.waiting.find((w) => w.issue === 47).asked, { count: 2, at: '2026-11-24T11:00:00.000Z' });
    h.out.length = 0;
    await run(['queue'], h.ctx);
    assert.match(h.text(), /#47  decision .*Which payment provider\? \(asked 2 times, last at 2026-11-24 11:00Z\)/);
  });

  test(`${name}: the record is kept in the shared folder, one per Issue`, async () => {
    const h = mk({ gitlab });
    await run(['asked', '47'], h.ctx);
    assert.ok(h.writes.some((t) => /"47":\{"count":1,"at":"2026-11-24T10:00:00.000Z"\}/.test(t)), 'one record for #47 was written');
  });

  test(`${name}: a decision holds what depends on it and what shares a file, never independent work`, async () => {
    const h = mk({ gitlab });
    const q = await json(h);
    const d = q.waiting.find((w) => w.issue === 47);
    assert.deepEqual(d.holds, [48, 49, 50], 'the dependent, its dependent, and the Issue that shares lib/pay.mjs (CHANGELOG.md alone is no share)');
    const rev = Object.fromEntries(q.waiting.filter((w) => w.waits === 'review').map((w) => [w.issue, w]));
    assert.equal(rev[50].heldBy, 47);
    assert.equal(rev[51].heldBy, undefined, 'independent review goes on');
    h.out.length = 0;
    await run(['queue'], h.ctx);
    assert.match(h.text(), /#47  decision .*holds #48, #49, #50/);
    assert.match(h.text(), /#50  review .*held: waits for the answer on #47/);
    assert.doesNotMatch(h.text(), /#51 .*held/);
  });

  test(`${name}: an answered decision is not recorded and holds nothing`, async () => {
    const h = mk({ gitlab });
    await run(['asked', '47'], h.ctx);
    h.world.comment(47, { id: 3, author: 'SrProfessional', body: '## Prompt for Claude Code\n\n```text\nUse Stripe\n```', createdAt: '2026-11-10T12:00:00Z', taken: false });
    h.out.length = 0;
    h.err.length = 0;
    assert.equal(await run(['asked', '47'], h.ctx), 1, 'no longer waits: nothing recorded');
    assert.match(h.text() + h.errText(), /#47 does not wait for a decision/);
    const q = await json(h);
    assert.ok(!q.waiting.some((w) => w.issue === 47));
    assert.ok(q.waiting.every((w) => w.heldBy === undefined));
  });
}

test('asked needs an Issue number', async () => {
  const h = mk();
  assert.equal(await run(['asked'], h.ctx), 2);
});
