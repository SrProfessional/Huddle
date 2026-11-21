// Issue #250: an assigned Issue whose start is held by an allowed-file overlap with an active Issue shows `blocked`, like a dependency wait
// (docs/design.md §22 and §24). A wait for capacity alone stays `assigned`. Canned adapters only; the fixtures are the #239 and #244 case of #230.
import test from 'node:test';
import assert from 'node:assert/strict';
import { run } from '../../lib/cli/run.mjs';
import { harness } from './harness.mjs';

const body = (effort, files, deps = '- None') => `## Depends on\n\n${deps}\n\n## Effort\n\n${effort}\n\n## Allowed files\n\n${files.map((f) => `- \`${f}\``).join('\n')}\n`;
const asAna = (setup, extra = {}) => {
  const h = harness({ setup, wrap: (a) => ({ ...a, me: async () => 'ana' }), ...extra });
  h.ctx.updateCachePath = '/data/u.json';
  return h;
};

for (const gitlab of [false, true]) {
  const kind = gitlab ? 'gitlab' : 'github';
  const world = (w) => {
    w.issue({ number: 5, title: 'Active', body: body(1, ['lib/cli/run.mjs', 'docs/design.md']), assignees: ['ana'], labels: ['in progress'] });
    w.issue({ number: 239, title: 'Waits on run.mjs', body: body(1, ['lib/cli/run.mjs']), assignees: ['ana'], labels: ['assigned'] });
    w.issue({ number: 244, title: 'Waits on design.md', body: body(1, ['docs/design.md']), assignees: ['ana'], labels: ['assigned'] });
    w.issue({ number: 245, title: 'Free', body: body(1, ['web/x.tsx']), assignees: ['ana'], labels: ['assigned'] });
  };

  test(`[${kind}] an assigned Issue that shares a file with an active one shows blocked, keeps its assignee, and the reason names the Issue and the file`, async () => {
    const h = harness({ gitlab, setup: world });
    assert.equal(await run(['labels'], h.ctx), 0, h.errText());
    assert.deepEqual(h.world.labelsOf(239), ['blocked']);
    assert.deepEqual(h.world.labelsOf(244), ['blocked']);
    assert.deepEqual(h.world.labelsOf(245), ['assigned']);
    assert.deepEqual(h.world.assigneesOf(239), ['ana']);
    assert.match(h.text(), /#239 → blocked − assigned \(waits for #5: shares lib\/cli\/run\.mjs with #5\)/);
    assert.match(h.text(), /#244 → blocked − assigned \(waits for #5: shares docs\/design\.md with #5\)/);
  });

  test(`[${kind}] the same Issue and path are in the huddle next reason`, async () => {
    const h = harness({ gitlab, setup: world, wrap: (a) => ({ ...a, me: async () => 'ana' }) });
    h.ctx.updateCachePath = '/data/u.json';
    assert.equal(await run(['next', '--json'], h.ctx), 0);
    const why = Object.fromEntries(JSON.parse(h.text()).wait.map((w) => [w.issue, w.why]));
    assert.match(why[239], /shares lib\/cli\/run\.mjs with #5/);
  });

  test(`[${kind}] when the conflict clears, blocked goes back to assigned (also when the blocking Issue closes)`, async () => {
    const h = harness({ gitlab, setup: world });
    await run(['labels'], h.ctx);
    h.world.issue({ number: 5, title: 'Active', body: body(1, ['lib/cli/run.mjs', 'docs/design.md']), assignees: ['ana'], labels: ['in review'], reviews: [50] });
    h.world.review({ number: 50 });
    h.out.length = 0;
    assert.equal(await run(['labels'], h.ctx), 0, h.errText());
    assert.deepEqual(h.world.labelsOf(239), ['assigned'], 'the blocking Issue is in review: it holds no files');
    assert.deepEqual(h.world.labelsOf(244), ['assigned']);
    assert.match(h.text(), /#239 → assigned − blocked/);
  });

  test(`[${kind}] a scoped run (--issue) sees the active Issue of the same person`, async () => {
    const h = harness({ gitlab, setup: world });
    assert.equal(await run(['labels', '--issue', '239'], h.ctx), 0);
    assert.deepEqual(h.world.labelsOf(239), ['blocked']);
  });

  test(`[${kind}] a wait for capacity alone stays assigned; a dependency wait is as before`, async () => {
    const h = harness({
      gitlab,
      config: { platform: gitlab ? 'gitlab' : 'github', project: 'acme/app', ai_manager: 'SrProfessional', assignees: ['ana'], capacity: 2 },
      setup: (w) => {
        w.issue({ number: 5, title: 'Active', body: body(3, ['a.mjs']), assignees: ['ana'], labels: ['in progress'] });
        w.issue({ number: 6, title: 'No room', body: body(1, ['b.mjs']), assignees: ['ana'], labels: ['assigned'] });
        w.issue({ number: 7, title: 'Both: capacity first', body: body(1, ['a.mjs']), assignees: ['ana'], labels: ['assigned'] });
        w.issue({ number: 8, title: 'Dependency', body: body(1, ['c.mjs'], '- #99'), assignees: ['ana'], labels: ['assigned'] });
        w.issue({ number: 99, title: 'Open dependency', body: body(1, ['d.mjs']), labels: ['ready'] });
      },
    });
    assert.equal(await run(['labels', '--no-assign'], h.ctx), 0);
    assert.deepEqual(h.world.labelsOf(6), ['assigned']);
    assert.deepEqual(h.world.labelsOf(7), ['assigned'], 'over capacity, the scheduler gives capacity first, as huddle next does');
    assert.deepEqual(h.world.labelsOf(8), ['blocked']);
    assert.match(h.text(), /#8 → blocked − assigned \(waits for #99\)/);
  });

  test(`[${kind}] two assigned Issues that share a file: the second is not blocked by a candidate that has not started`, async () => {
    const h = harness({
      gitlab,
      setup: (w) => {
        w.issue({ number: 10, title: 'First', body: body(1, ['a.mjs']), assignees: ['ana'], labels: ['assigned'] });
        w.issue({ number: 11, title: 'Second', body: body(1, ['a.mjs']), assignees: ['ana'], labels: ['assigned'] });
      },
    });
    assert.equal(await run(['labels'], h.ctx), 0, h.errText());
    assert.deepEqual(h.world.labelsOf(11), ['assigned']);
  });
}

// The Coach's review of PR #260: the board and `huddle next` classify active work the same way, and a scoped run on the blocker reconciles its file waiters.
const PROMPT = '## Prompt for Claude Code\n\n```text\nFix it\n```';
for (const gitlab of [false, true]) {
  const kind = gitlab ? 'gitlab' : 'github';
  const ana = (setup) => {
    const h = harness({ gitlab, setup, wrap: (a) => ({ ...a, me: async () => 'ana' }) });
    h.ctx.updateCachePath = '/data/u.json';
    return h;
  };
  const waiter = (w) => w.issue({ number: 239, title: 'Waits', body: body(1, ['lib/cli/run.mjs']), assignees: ['ana'], labels: ['assigned'] });
  const nextWhy = async (h, n) => {
    h.out.length = 0;
    await run(['next', '--json'], h.ctx);
    return JSON.parse(h.text()).wait.find((w) => w.issue === n)?.why;
  };

  for (const taken of [false, true]) {
    test(`[${kind}] ${taken ? 'a taken' : 'a pending'} Coach request on an Issue with an open PR holds its files, as huddle next says`, async () => {
      const h = ana((w) => {
        w.issue({ number: 5, title: 'Has a PR', body: body(1, ['lib/cli/run.mjs']), assignees: ['ana'], labels: ['in review'], reviews: [50] });
        w.review({ number: 50 });
        w.comment(5, { id: 900, author: 'SrProfessional', body: PROMPT, createdAt: '2026-11-05T10:00:00Z', taken });
        waiter(w);
      });
      assert.match(await nextWhy(h, 239), /shares lib\/cli\/run\.mjs with #5/);
      assert.equal(await run(['labels'], h.ctx), 0, h.errText());
      assert.deepEqual(h.world.labelsOf(239), ['blocked']);
    });
  }

  test(`[${kind}] a PR that is only awaiting review holds nothing, on the board and in huddle next`, async () => {
    const h = ana((w) => {
      w.issue({ number: 5, title: 'Awaiting review', body: body(1, ['lib/cli/run.mjs']), assignees: ['ana'], labels: ['in review'], reviews: [50] });
      w.review({ number: 50 });
      waiter(w);
    });
    assert.equal(await nextWhy(h, 239), undefined);
    assert.equal(await run(['labels'], h.ctx), 0, h.errText());
    assert.deepEqual(h.world.labelsOf(239), ['assigned']);
  });

  test(`[${kind}] in-progress work with an unmet dependency holds no files, as huddle next says`, async () => {
    const h = ana((w) => {
      w.issue({ number: 99, title: 'Open dependency', body: body(1, ['d.mjs']), labels: ['ready'] });
      w.issue({ number: 5, title: 'Started, waits again', body: body(1, ['lib/cli/run.mjs'], '- #99'), assignees: ['ana'], labels: ['in progress', 'blocked'] });
      waiter(w);
    });
    assert.equal(await nextWhy(h, 239), undefined, 'next can start #239');
    assert.equal(await run(['labels', '--no-assign'], h.ctx), 0, h.errText());
    assert.deepEqual(h.world.labelsOf(239), ['assigned']);
  });

  test(`[${kind}] labels --issue on the blocker moves its file waiter: start blocks it, closing frees it, the assignee stays`, async () => {
    const h = ana((w) => {
      w.issue({ number: 5, title: 'Blocker', body: body(1, ['lib/cli/run.mjs']), assignees: ['ana'], labels: ['assigned'] });
      waiter(w);
    });
    assert.equal(await run(['labels', '--issue', '5', '--started'], h.ctx), 0, h.errText());
    assert.deepEqual(h.world.labelsOf(5), ['in progress']);
    assert.deepEqual(h.world.labelsOf(239), ['blocked'], 'assigned → blocked');
    assert.deepEqual(h.world.assigneesOf(239), ['ana']);
    h.world.issue({ number: 5, title: 'Blocker', body: body(1, ['lib/cli/run.mjs']), assignees: ['ana'], labels: ['in progress'], state: 'merged' });
    h.out.length = 0;
    assert.equal(await run(['labels', '--issue', '5'], h.ctx), 0, h.errText());
    assert.deepEqual(h.world.labelsOf(239), ['assigned'], 'blocked → assigned');
    assert.deepEqual(h.world.assigneesOf(239), ['ana']);
    assert.match(h.text(), /#239 → assigned − blocked/);
  });
}
