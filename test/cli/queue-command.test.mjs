// Issue #88, docs/design.md §19: `huddle queue [--json]` lists what waits for the AI Manager, and never writes.
import test from 'node:test';
import assert from 'node:assert/strict';
import { run } from '../../lib/cli/run.mjs';
import { harness, request, CONFIG, GITLAB_CONFIG } from './harness.mjs';

const MANAGED = '## Depends on\n\nNone.\n';
const WRITES = new Set(['setLabels', 'ensureLabels', 'assign', 'merge', 'postComment', 'editComment', 'markTaken', 'createIssue', 'updateIssue', 'closeIssue', 'pinIssue', 'createMilestone', 'updateMilestone', 'setIssueMilestone']);
const HEADS = { 51: 'a1b2c3d' };

/** The adapter with a fake `reviewHead`, and every write recorded and refused. */
function mk(setup, opts = {}) {
  const writes = [];
  const wrap = (adapter) => new Proxy(adapter, {
    get: (a, op) => {
      if (op === 'reviewHead') return async (n) => HEADS[n] ?? `head-of-${n}`;
      return WRITES.has(op) ? async (...args) => { writes.push(op); throw new Error(`queue called ${String(op)}`); } : a[op];
    },
  });
  const h = harness({ setup, wrap, ...opts });
  h.writes = writes;
  return h;
}

const world = (w) => {
  w.issue({ number: 42, title: 'Add login form', body: MANAGED, assignees: ['ana'], reviews: [51] });
  w.review({ number: 51 });
  w.issue({ number: 47, title: 'Which payment provider?', body: MANAGED, labels: ['needs decision'] });
  w.comment(47, { id: 1, author: 'ana', body: '❓ Decision for the AI Manager: which one?', createdAt: '2026-11-10T10:00:00Z' });
  w.issue({ number: 53, title: 'Login page crashes on Safari', body: 'A raw report', labels: ['bug', 'needs triage'] });
  w.issue({ number: 60, title: 'Being changed', body: MANAGED, assignees: ['luis'], reviews: [61] });
  w.review({ number: 61 });
  w.comment(61, { id: 2, author: 'SrProfessional', body: '## Prompt for Claude Code\n\n```text\nFix it\n```', createdAt: '2026-11-10T11:00:00Z' });
  w.issue({ number: 70, title: 'Old', body: MANAGED, state: 'merged' });
};

test('queue prints what waits, with the PR, sorted by Issue number', async () => {
  const h = mk(world);
  assert.equal(await run(['queue'], h.ctx), 0);
  assert.equal(h.text(), [
    'Waiting for the AI Manager:',
    '  #42  review    PR #51   Add login form',
    '  #47  decision           Which payment provider?',
    '  #53  triage             Login page crashes on Safari',
  ].join('\n'));
  assert.deepEqual(h.writes, []);
});

test('a pending request is the developer\'s turn: its Issue is not listed, and a closed Issue never is', async () => {
  const h = mk(world);
  await run(['queue'], h.ctx);
  assert.doesNotMatch(h.text(), /#60|#70/);
});

test('an answered decision is not listed', async () => {
  const h = mk((w) => {
    world(w);
    w.comment(47, { id: 3, author: 'SrProfessional', body: '## Prompt for Claude Code\n\n```text\nUse Stripe\n```', createdAt: '2026-11-10T12:00:00Z', taken: false });
  });
  await run(['queue'], h.ctx);
  assert.doesNotMatch(h.text(), /#47/);
});

test('nothing waiting says so, and exits 0', async () => {
  const h = mk((w) => w.issue({ number: 1, title: 'Working', body: MANAGED, assignees: ['ana'], labels: ['in progress'] }));
  assert.equal(await run(['queue'], h.ctx), 0);
  assert.equal(h.text(), 'Nothing is waiting for the AI Manager.');
});

test('--json prints the items; pr and head only for review', async () => {
  const h = mk(world);
  assert.equal(await run(['queue', '--json'], h.ctx), 0);
  assert.deepEqual(JSON.parse(h.text()), {
    waiting: [
      { issue: 42, title: 'Add login form', waits: 'review', pr: 51, head: 'a1b2c3d' },
      { issue: 47, title: 'Which payment provider?', waits: 'decision' },
      { issue: 53, title: 'Login page crashes on Safari', waits: 'triage' },
    ],
  });
});

test('--json with nothing waiting is an empty list', async () => {
  const h = mk(() => {});
  assert.equal(await run(['queue', '--json'], h.ctx), 0);
  assert.deepEqual(JSON.parse(h.text()), { waiting: [] });
});

test('the renamed labels of huddle.json are understood', async () => {
  const h = mk((w) => w.issue({ number: 5, title: 'Q', body: MANAGED, labels: ['question'] }), { config: { ...CONFIG, labels: { decision: 'question' } } });
  await run(['queue', '--json'], h.ctx);
  assert.deepEqual(JSON.parse(h.text()).waiting.map((x) => x.waits), ['decision']);
});

test('on GitLab the reference reads MR !n', async () => {
  const h = mk((w) => {
    w.issue({ number: 42, title: 'Add login form', body: MANAGED, assignees: ['ana'], reviews: [51] });
    w.review({ number: 51 });
  }, { gitlab: true, config: GITLAB_CONFIG });
  assert.equal(await run(['queue'], h.ctx), 0);
  assert.match(h.text(), /#42  review    MR !51   Add login form/);
});

test('a platform error is one clear line and exit 1', async () => {
  const h = harness({ wrap: (a) => ({ ...a, listOpenIssues: async () => { throw new Error('offline'); } }) });
  assert.equal(await run(['queue'], h.ctx), 1);
  assert.equal(h.errText(), 'huddle queue: offline');
  assert.equal(h.text(), '');
});

test('a bad flag or an extra argument is the usage line and exit 2, and nothing is read', async () => {
  for (const args of [['queue', '--bogus'], ['queue', '5'], ['queue', '--json', '--x']]) {
    const h = mk(world);
    assert.equal(await run(args, h.ctx), 2, args.join(' '));
    assert.match(h.errText(), /Usage: huddle .*queue/);
    assert.equal(h.text(), '');
  }
});

test('without huddle.json it fails with the same «not found» error as the other commands', async () => {
  const h = harness({ file: null });
  assert.equal(await run(['queue'], h.ctx), 1);
  assert.match(h.errText(), /huddle\.json not found/);
});

test('it makes no write call at all: the fake gh got only reads', async () => {
  const h = mk(world);
  await run(['queue', '--json'], h.ctx);
  assert.deepEqual(h.writes, []);
  const mutating = h.calls().filter((c) => /\b(edit|create|merge|comment|close|reopen|delete)\b/.test(c.args.join(' ')) || c.args.includes('-X'));
  assert.deepEqual(mutating, []);
});
