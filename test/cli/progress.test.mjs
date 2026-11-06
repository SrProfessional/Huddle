// Huddle: progress by area, in the CLI (docs/design.md §12): `huddle progress`, the «Huddle progress» Issue the labels job keeps, and the hook line.
// Every test runs on the in-memory fake `gh`; none can reach a real GitHub or GitLab.
import test from 'node:test';
import assert from 'node:assert/strict';
import { run } from '../../lib/cli/run.mjs';
import { MARKER } from '../../lib/core/progress.mjs';
import { OPERATIONS } from '../../lib/platform/index.mjs';
import { harness, request, CONFIG } from './harness.mjs';

const DEPS = (n) => `## Depends on\n\n- #${n}\n`;

// Content: 2 merged + 1 open, remaining 2  -> 2/3 +2 = 40%.   Ads: 1 open, no estimate -> 0/1 +0 = 0%.   Total 2/(4+2) = 33%.   #5 has no area.
const areas = (w) => {
  w.milestone({ title: 'Content', description: 'Posts and stories.\n\nHuddle remaining: 2' });
  w.milestone({ title: 'Ads', description: '' });
  w.issue({ number: 1, title: 'one', state: 'merged', milestone: 'Content' });
  w.issue({ number: 2, title: 'two', state: 'merged', milestone: 'Content' });
  w.issue({ number: 3, title: 'three', milestone: 'Content' });
  w.issue({ number: 4, title: 'four', milestone: 'Ads' });
  w.issue({ number: 5, title: 'five' });
};
const SUMMARY = 'Progress: Content 40% · Ads 0% · Total 33%';

// --- huddle progress ----------------------------------------------------------------------------------------------------------------

test('huddle progress prints the table: area, merged/total +remaining, %, a bar, the total, no area and the missing estimates', async () => {
  const h = harness({ setup: areas });
  assert.equal(await run(['progress'], h.ctx), 0);
  assert.match(h.text(), /Content\s+2\/3 \+2\s+40%\s+\[####\.\.\.\.\.\.\]/);
  assert.match(h.text(), /Ads\s+0\/1 \+0\s+0%\s+\[\.\.\.\.\.\.\.\.\.\.\]/);
  assert.match(h.text(), /Total\s+2\/4 \+2\s+33%\s+\[###\.\.\.\.\.\.\.\]/);
  assert.match(h.text(), /No area: 1 open Issue without a milestone/);
  assert.match(h.text(), /Estimate missing for: Ads/);
});

test('huddle progress --json prints the data, with null (never NaN) where 0 ÷ 0', async () => {
  const h = harness({ setup: (w) => { areas(w); w.milestone({ title: 'Empty', description: 'Huddle remaining: 0' }); } });
  assert.equal(await run(['progress', '--json'], h.ctx), 0);
  const j = JSON.parse(h.text());
  assert.deepEqual(j.areas.find((a) => a.title === 'Content'), { title: 'Content', state: 'open', merged: 2, total: 3, remaining: 2, percent: 40, estimateMissing: false, malformed: false });
  assert.equal(j.areas.find((a) => a.title === 'Empty').percent, null);
  assert.deepEqual(j.total, { merged: 2, total: 4, remaining: 2, percent: 33 });
  assert.equal(j.noArea, 1);
  assert.ok(!h.text().includes('NaN'));
});

test('huddle progress with no milestones says so, and an unknown flag is a usage error', async () => {
  const h = harness({ setup: (w) => w.issue({ number: 1 }) });
  assert.equal(await run(['progress'], h.ctx), 0);
  assert.match(h.text(), /No milestones/);
  const bad = harness();
  assert.equal(await run(['progress', '--yaml'], bad.ctx), 2);
  assert.match(bad.errText(), /Usage:.*progress/);
});

test('huddle progress counts closed milestones only for 90 days', async () => {
  const h = harness({ setup: (w) => {
    w.milestone({ title: 'Launch', state: 'closed', closedAt: '2026-10-20T00:00:00Z' });
    w.milestone({ title: 'Old beta', state: 'closed', closedAt: '2026-05-01T00:00:00Z' });
    w.issue({ number: 1, state: 'merged', milestone: 'Launch' });
    w.issue({ number: 2, state: 'merged', milestone: 'Old beta' });
  } });
  h.ctx.now = () => new Date('2026-11-06T12:00:00Z');
  await run(['progress', '--json'], h.ctx);
  assert.deepEqual(JSON.parse(h.text()).areas.map((a) => a.title), ['Launch']);
});

// --- the progress Issue, kept by the labels job -------------------------------------------------------------------------------------

/** Wraps the adapter to count the writes of the progress Issue. */
const spy = () => {
  const seen = { create: 0, update: 0, pin: 0, milestones: 0 };
  const wrap = (a) => ({
    ...a,
    createIssue: async (x) => { seen.create += 1; return a.createIssue(x); },
    updateIssue: async (...x) => { seen.update += 1; return a.updateIssue(...x); },
    pinIssue: async (x) => { seen.pin += 1; return a.pinIssue(x); },
    listMilestones: async (x) => { seen.milestones += 1; return a.listMilestones(x); },
  });
  return { seen, wrap };
};

test('labels creates the progress Issue once, with its marker, pinned, and leaves it alone on the next run', async () => {
  const { seen, wrap } = spy();
  const h = harness({ setup: areas, wrap });
  assert.equal(await run(['labels'], h.ctx), 0);
  const [issue] = h.world.created();
  assert.equal(issue.title, 'Huddle progress');
  assert.ok(issue.body.startsWith(`${MARKER}\n`));
  assert.match(issue.body, /Content \| 2\/3 \+2 \| 40%/);
  assert.deepEqual(h.world.pinned(), [issue.number], 'pinned on GitHub');
  assert.match(h.text(), new RegExp(`Progress: created Issue #${issue.number}`));

  assert.equal(await run(['labels'], h.ctx), 0);
  assert.equal(h.world.created().length, 1, 'found by its marker, not created again');
  assert.deepEqual([seen.create, seen.update, seen.pin], [1, 0, 1], 'unchanged text: no write');
});

test('labels rewrites the progress Issue only when its text changes', async () => {
  const { seen, wrap } = spy();
  const h = harness({ setup: areas, wrap });
  await run(['labels'], h.ctx);
  const n = h.world.created()[0].number;
  h.world.issue({ number: 3, title: 'three', state: 'merged', milestone: 'Content' }); // #3 gets merged
  await run(['labels'], h.ctx);
  assert.equal(seen.update, 1);
  assert.match(h.world.bodyOf(n), /Content \| 3\/3 \+2 \| 60%/);
  assert.match(h.text(), new RegExp(`Progress: updated Issue #${n}`));
  await run(['labels'], h.ctx);
  assert.equal(seen.update, 1, 'the same numbers again: no write');
});

test('the progress Issue is found by its marker, never by its title', async () => {
  const { seen, wrap } = spy();
  const h = harness({ wrap, setup: (w) => {
    areas(w);
    w.issue({ number: 40, title: 'Huddle progress', body: 'a human wrote this one' });
    w.issue({ number: 41, title: 'Renamed by someone', body: `${MARKER}\nstale text` });
  } });
  await run(['labels'], h.ctx);
  assert.deepEqual([seen.create, seen.update], [0, 1]);
  assert.match(h.world.bodyOf(41), /Content \| 2\/3 \+2 \| 40%/);
  assert.equal(h.world.bodyOf(40), 'a human wrote this one');
});

test('the progress Issue has no «Depends on»: the labels logic gives it no label, and it is not an Issue with «no area»', async () => {
  const h = harness({ setup: areas });
  await run(['labels'], h.ctx);
  const n = h.world.created()[0].number;
  assert.deepEqual(h.world.labelsOf(n), []);
  assert.deepEqual(h.world.assigneesOf(n), []);
  await run(['progress', '--json'], h.ctx);
  assert.equal(JSON.parse(h.out.at(-1)).noArea, 1, 'only #5; the progress Issue does not count');
});

test('labels still updates the labels when progress fails, and says so in one line', async () => {
  const h = harness({
    wrap: (a) => ({ ...a, listMilestones: async () => { throw new Error('GraphQL: rate limit exceeded\nsecond line'); } }),
    setup: (w) => {
      w.issue({ number: 1, title: 'done', state: 'merged' });
      w.issue({ number: 2, title: 'ready one', body: DEPS(1) });
    },
  });
  assert.equal(await run(['labels'], h.ctx), 0, 'progress is best effort: the exit code stays 0');
  assert.deepEqual(h.world.labelsOf(2), ['assigned']);
  assert.match(h.text(), /^Progress not updated: GraphQL: rate limit exceeded$/m);
  assert.ok(!h.text().includes('second line'));
});

test('labels still updates the labels when creating or pinning the progress Issue fails', async () => {
  const labelsWorld = (w) => { areas(w); w.issue({ number: 6, title: 'ready one', body: DEPS(1) }); };
  const failCreate = harness({ setup: labelsWorld, wrap: (a) => ({ ...a, createIssue: async () => { throw new Error('HTTP 403'); } }) });
  assert.equal(await run(['labels'], failCreate.ctx), 0);
  assert.deepEqual(failCreate.world.labelsOf(6), ['assigned']);
  assert.match(failCreate.text(), /Progress not updated: HTTP 403/);

  const failPin = harness({ setup: areas, wrap: (a) => ({ ...a, pinIssue: async () => { throw new Error('too many pinned Issues'); } }) });
  assert.equal(await run(['labels'], failPin.ctx), 0);
  assert.equal(failPin.world.created().length, 1, 'the Issue exists');
  assert.match(failPin.text(), /created, but not pinned: too many pinned Issues/);
});

test('labels --dry-run writes no progress Issue', async () => {
  const { seen, wrap } = spy();
  const h = harness({ setup: areas, wrap });
  await run(['labels', '--dry-run'], h.ctx);
  assert.deepEqual([seen.create, seen.update], [0, 0]);
  assert.equal(h.world.created().length, 0);
  assert.match(h.text(), /Progress: would create/);
});

test('a project with no milestones gets no progress Issue; "progress_issue": false turns it off', async () => {
  const none = harness({ setup: (w) => w.issue({ number: 1 }) });
  await run(['labels'], none.ctx);
  assert.equal(none.world.created().length, 0);

  const { seen, wrap } = spy();
  const off = harness({ setup: areas, wrap, config: { ...CONFIG, progress_issue: false } });
  assert.equal(await run(['labels'], off.ctx), 0);
  assert.equal(off.world.created().length, 0);
  assert.equal(seen.milestones, 0, 'not even read');
});

test('"progress_issue" must be a boolean in huddle.json', async () => {
  const h = harness({ file: JSON.stringify({ ...CONFIG, progress_issue: 'no' }) });
  assert.equal(await run(['labels'], h.ctx), 1);
  assert.match(h.errText(), /progress_issue/);
});

// --- the hook line ------------------------------------------------------------------------------------------------------------------

test('hook: with milestones and nothing pending it prints the one progress line, visible', async () => {
  const h = harness({ setup: areas });
  assert.equal(await run(['hook'], h.ctx), 0);
  const j = JSON.parse(h.text());
  assert.equal(j.systemMessage, SUMMARY);
});

test('hook: the pending-request line stays, with the progress line after it', async () => {
  const h = harness({ setup: (w) => { areas(w); w.issue({ number: 7, assignees: ['SrProfessional'], labels: ['in progress'] }); w.comment(7, request(401)); } });
  assert.equal(await run(['hook'], h.ctx), 0);
  const j = JSON.parse(h.text());
  const [first, second, ...rest] = j.systemMessage.split('\n');
  assert.match(first, /^Huddle: .*AI Manager.*#7/);
  assert.equal(second, SUMMARY);
  assert.deepEqual(rest, []);
  assert.match(j.hookSpecificOutput.additionalContext, /Issue #7/, 'Claude still gets the request');
});

test('hook: without milestones it is silent, as before', async () => {
  const h = harness({ setup: (w) => w.issue({ number: 5, assignees: ['SrProfessional'], labels: ['in progress'] }) });
  assert.equal(await run(['hook'], h.ctx), 0);
  assert.equal(h.text(), '');
});

test('hook: offline it is silent even with milestones', async () => {
  const down = (a) => Object.fromEntries(OPERATIONS.map((op) => [op, async () => { throw new Error('offline'); }]).concat([['_', a]]));
  const h = harness({ setup: areas, wrap: down });
  assert.equal(await run(['hook'], h.ctx), 0);
  assert.equal(h.text(), '');
  assert.equal(h.errText(), '');
});

test('hook: a failing progress read does not hide a pending request', async () => {
  const h = harness({
    wrap: (a) => ({ ...a, listMilestones: async () => { throw new Error('boom'); } }),
    setup: (w) => { w.issue({ number: 7, assignees: ['SrProfessional'], labels: ['in progress'] }); w.comment(7, request(401)); },
  });
  assert.equal(await run(['hook'], h.ctx), 0);
  const message = JSON.parse(h.text()).systemMessage;
  assert.match(message, /^Huddle: .*#7/);
  assert.ok(!message.includes('\n'), 'only the pending line');
});

test('hook: a slow progress read is dropped after its own budget, so the pending line still comes inside the hook timeout', async () => {
  const h = harness({
    wrap: (a) => ({ ...a, listMilestones: () => new Promise(() => {}) }),
    setup: (w) => { w.issue({ number: 7, assignees: ['SrProfessional'], labels: ['in progress'] }); w.comment(7, request(401)); },
  });
  h.ctx.hookTimeoutMs = 2000;
  h.ctx.hookProgressMs = 30;
  const started = Date.now();
  assert.equal(await run(['hook'], h.ctx), 0);
  assert.ok(Date.now() - started < 1500, 'finished well before the hook timeout');
  const message = JSON.parse(h.text()).systemMessage;
  assert.match(message, /^Huddle: .*#7/);
  assert.ok(!message.includes('\n'), 'only the pending line');
});

test('hook: when everything hangs it still gives up at the hook timeout, silently', async () => {
  const h = harness({ setup: areas, wrap: (a) => ({ ...a, listMilestones: () => new Promise(() => {}), me: () => new Promise(() => {}) }) });
  h.ctx.hookTimeoutMs = 50;
  h.ctx.hookProgressMs = 10000;
  assert.equal(await run(['hook'], h.ctx), 0);
  assert.equal(h.text(), '');
});
