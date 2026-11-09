// Huddle: the findings of the 0.3.0 smoke test (Issue #52), on the fake gh and the fake glab. Both fakes answer like the real platforms:
// the fake gh search lags behind a new Issue, the fake glab answers 429 with a Retry-After and ignores a closed milestone on an Issue.
// Nothing here starts a process or waits.
import test from 'node:test';
import assert from 'node:assert/strict';
import { run } from '../../lib/cli/run.mjs';
import { MARKER } from '../../lib/core/progress.mjs';
import { harness } from './harness.mjs';

const progressBody = (text = 'stale text') => `${MARKER}\n# Huddle progress\n\n${text}\n`;
const DEPS = (n) => `## Depends on\n\n- #${n}\n`;

// Content: 2 merged + 1 open, remaining 2.
const areas = (w) => {
  w.milestone({ title: 'Content', description: 'Posts and stories.\n\nHuddle remaining: 2' });
  w.issue({ number: 1, title: 'one', state: 'merged', milestone: 'Content' });
  w.issue({ number: 2, title: 'two', state: 'merged', milestone: 'Content' });
  w.issue({ number: 3, title: 'three', milestone: 'Content' });
};

for (const [name, gitlab] of [['github', false], ['gitlab', true]]) {
  const t = (title, fn) => test(`[${name}] ${title}`, () => fn(gitlab));

  // --- 1. the progress Issue is found without search, and healed when duplicated --------------------------------------------------------

  t('two runs in a row (a job, then a local run) make one progress Issue, even while search has not indexed the first yet', async (gl) => {
    const h = harness({ gitlab: gl, setup: (w) => { w.searchLag?.(true); areas(w); } });
    assert.equal(await run(['labels'], h.ctx), 0);
    assert.equal(await run(['labels'], h.ctx), 0);
    assert.equal(h.world.created().length, 1, 'the second run found the first one');
    assert.match(h.text(), /Progress: created Issue #\d+/);
    assert.equal(h.text().match(/Progress: created/g).length, 1);
  });

  t('heal: with two progress Issues it keeps the oldest, closes the other with «Duplicate of #N», and creates nothing', async (gl) => {
    const h = harness({ gitlab: gl, setup: (w) => { areas(w); w.issue({ number: 40, title: 'Huddle progress', body: progressBody() }); w.issue({ number: 41, title: 'Huddle progress', body: progressBody() }); } });
    assert.equal(await run(['labels'], h.ctx), 0);
    assert.equal(h.world.stateOf(40), 'open');
    assert.equal(h.world.stateOf(41), 'closed');
    assert.deepEqual(h.world.commentsOn(41), ['Duplicate of #40']);
    assert.equal(h.world.closedReason?.(41) ?? 'not_planned', 'not_planned', 'closed as not planned where the platform has a reason');
    assert.equal(h.world.created().length, 0);
    assert.match(h.world.bodyOf(40), /Content \| 2\/3 \+2 \| 40%/, 'the Issue it keeps is rewritten as usual');
    assert.match(h.text(), /#41.*#40/);
  });

  t('heal: three duplicates, found in any order, all but the lowest number are closed; a second run has nothing left to do', async (gl) => {
    const h = harness({ gitlab: gl, setup: (w) => { areas(w); for (const n of [47, 12, 30]) w.issue({ number: n, title: 'Huddle progress', body: progressBody() }); } });
    await run(['labels'], h.ctx);
    assert.deepEqual([12, 30, 47].map((n) => h.world.stateOf(n)), ['open', 'closed', 'closed']);
    assert.deepEqual(h.world.commentsOn(47), ['Duplicate of #12']);
    h.out.length = 0;
    await run(['labels'], h.ctx);
    assert.ok(!/Duplicate|duplicate/.test(h.text()), 'healed once');
    assert.deepEqual(h.world.commentsOn(30), ['Duplicate of #12'], 'not commented again');
  });

  t('heal --dry-run says what it would close and closes nothing', async (gl) => {
    const h = harness({ gitlab: gl, setup: (w) => { areas(w); w.issue({ number: 40, title: 'Huddle progress', body: progressBody() }); w.issue({ number: 41, title: 'Huddle progress', body: progressBody() }); } });
    await run(['labels', '--dry-run'], h.ctx);
    assert.equal(h.world.stateOf(41), 'open');
    assert.deepEqual(h.world.commentsOn(41), []);
    assert.match(h.text(), /would close/i);
  });

  t('heal: a duplicate that cannot be closed is reported in one line and does not stop the progress update', async (gl) => {
    const h = harness({ gitlab: gl, setup: (w) => { areas(w); w.issue({ number: 40, title: 'Huddle progress', body: progressBody() }); w.issue({ number: 41, title: 'Huddle progress', body: progressBody() }); } });
    h.world.failWhen((args) => args.join(' ').includes('/issues/41') && !args.join(' ').includes('comments') && !args.join(' ').includes('notes') && args.some((a) => /^(PATCH|PUT)$/.test(a)), '403 Forbidden', Infinity);
    assert.equal(await run(['labels'], h.ctx), 0);
    assert.match(h.text(), /could not close #41: .*403 Forbidden/);
    assert.match(h.world.bodyOf(40), /Content \| 2\/3 \+2 \| 40%/);
  });

  // --- 5. the progress Issue is only the one whose body starts with the marker AND whose title is «Huddle progress» ----------------------

  t('an Issue that quotes the marker in its text keeps its body after `huddle labels`', async (gl) => {
    const quoted = `Fix the three findings.\n\nThe job took this Issue for the progress one because of the marker ${MARKER} in its text.\n`;
    const h = harness({ gitlab: gl, setup: (w) => { areas(w); w.issue({ number: 52, title: 'H23: fix the findings', body: quoted }); } });
    await run(['labels'], h.ctx);
    assert.equal(h.world.bodyOf(52), quoted);
    assert.equal(h.world.created().filter((i) => i.title === 'Huddle progress').length, 1, 'the real progress Issue is created next to it');
  });

  t('the marker on the first line is not enough: with another title the Issue is never touched', async (gl) => {
    const body = `${MARKER}\nsomeone copied the marker line`;
    const h = harness({ gitlab: gl, setup: (w) => { areas(w); w.issue({ number: 41, title: 'Renamed by someone', body }); } });
    await run(['labels'], h.ctx);
    assert.equal(h.world.bodyOf(41), body);
    assert.equal(h.world.stateOf(41), 'open');
  });

  t('the title is not enough either: «Huddle progress» with no marker on the first line is never touched', async (gl) => {
    const h = harness({ gitlab: gl, setup: (w) => { areas(w); w.issue({ number: 40, title: 'Huddle progress', body: `a human wrote this\n${MARKER}` }); } });
    await run(['labels'], h.ctx);
    assert.equal(h.world.bodyOf(40), `a human wrote this\n${MARKER}`);
    assert.equal(h.world.stateOf(40), 'open');
  });

  t('an Issue that merely quotes the marker is not a duplicate: it is not closed', async (gl) => {
    const h = harness({ gitlab: gl, setup: (w) => { areas(w); w.issue({ number: 40, title: 'Huddle progress', body: progressBody() }); w.issue({ number: 52, title: 'Huddle progress', body: `see ${MARKER}` }); } });
    await run(['labels'], h.ctx);
    assert.equal(h.world.stateOf(52), 'open');
    assert.equal(h.world.bodyOf(52), `see ${MARKER}`);
  });

  // --- 2. fewer repeated calls, and a clear message when still rate limited -------------------------------------------------------------

  t('a rate limit that goes away is retried and the labels run goes on', async (gl) => {
    const h = harness({ gitlab: gl, setup: (w) => w.issue({ number: 1, body: '## Depends on\n\n- None\n' }) });
    h.world.rateLimit(2, 1);
    assert.equal(await run(['labels'], h.ctx), 0);
    assert.deepEqual(h.slept, [1000, 1000]);
    assert.ok(h.world.labelsOf(1).length > 0, 'the labels were written');
  });

  t('still rate limited: «rate limited, try again in N s» on one line, no stack, exit 1', async (gl) => {
    const h = harness({ gitlab: gl, setup: (w) => w.issue({ number: 1, body: '## Depends on\n\n- None\n' }) });
    h.world.rateLimit(100, 45);
    assert.equal(await run(['labels'], h.ctx), 1);
    assert.equal(h.errText(), 'huddle labels: rate limited, try again in 45 s');
    assert.deepEqual(h.slept, [45000], 'a second wait of 45 s would pass the 60 s limit');
  });
}

// --- 2. GitLab reads closed_by once per Issue in a run ---------------------------------------------------------------------------------

test('[gitlab] one labels run reads closed_by of an Issue once, though both the labels and the progress need it', async () => {
  const h = harness({ gitlab: true, setup: (w) => {
    w.milestone({ title: 'Content', description: 'Huddle remaining: 1' });
    w.issue({ number: 40, title: 'done', state: 'merged', milestone: 'Content' }); // read for the progress of Content, and as the dependency of #1
    w.issue({ number: 1, title: 'next', body: DEPS(40), milestone: 'Content' });
  } });
  assert.equal(await run(['labels'], h.ctx), 0);
  const reads = (n) => h.calls().filter((c) => c.args.at(-1).includes(`/issues/${n}/closed_by`)).length;
  assert.equal(reads(40), 1, 'once, not once for the labels and once for the progress');
  assert.equal(reads(1), 1);
  assert.ok(h.world.labelsOf(1).length > 0, 'the answer is still used by the labels');
  assert.match(h.world.bodyOf(h.world.created()[0].number), /Content \| 1\/2 \+1 \| 33%/, 'and by the progress');
});

test('[gitlab] what is read in one run is not kept for the next: a new MR shows up the next time', async () => {
  const h = harness({ gitlab: true, setup: (w) => w.issue({ number: 1, body: '## Depends on\n\n- None\n' }) });
  await run(['labels'], h.ctx);
  const reads = () => h.calls().filter((c) => c.args.at(-1).includes('/issues/1/closed_by')).length;
  const before = reads();
  await run(['labels'], h.ctx);
  assert.equal(reads(), before + 1);
});

// --- 3. GitLab: a closed milestone is reopened, assigned, closed again ---------------------------------------------------------------

test('[gitlab] areas assign to a closed milestone reopens it, assigns, closes it again, and says so', async () => {
  const h = harness({ gitlab: true, setup: (w) => { w.milestone({ title: 'Docs', state: 'closed', closedAt: '2026-09-01T00:00:00Z' }); w.issue({ number: 8, title: 'CI tooling' }); } });
  assert.equal(await run(['areas', 'assign', '8', 'Docs'], h.ctx), 0);
  assert.equal(h.world.milestoneOf(8), 'Docs');
  assert.equal(h.world.milestoneState('Docs'), 'closed', 'closed again');
  assert.match(h.text(), /«Docs» was closed: reopened it, assigned the Issue and closed it again/);
  assert.match(h.text(), /Done\./);
});

test('[gitlab] an open milestone is assigned as before: no reopening, nothing extra said', async () => {
  const h = harness({ gitlab: true, setup: (w) => { w.milestone({ title: 'Docs' }); w.issue({ number: 8 }); } });
  await run(['areas', 'assign', '8', 'Docs'], h.ctx);
  assert.equal(h.world.milestoneOf(8), 'Docs');
  assert.ok(!/reopened/.test(h.text()));
  assert.ok(!h.calls().some((c) => c.input?.includes('state_event')), 'the milestone was not touched');
});

test('[github] a closed milestone is assigned straight away, as always', async () => {
  const h = harness({ setup: (w) => { w.milestone({ title: 'Docs', state: 'closed', closedAt: '2026-09-01T00:00:00Z' }); w.issue({ number: 8 }); } });
  assert.equal(await run(['areas', 'assign', '8', 'Docs'], h.ctx), 0);
  assert.equal(h.world.milestoneOf(8), 'Docs');
  assert.equal(h.world.milestoneState('Docs'), 'closed');
  assert.ok(!/reopened/.test(h.text()));
});

test('[gitlab] if the assign fails after the milestone was reopened, the milestone is closed again and the error is shown', async () => {
  const h = harness({ gitlab: true, setup: (w) => { w.milestone({ title: 'Docs', state: 'closed', closedAt: '2026-09-01T00:00:00Z' }); w.issue({ number: 8 }); } });
  let puts = 0;
  h.world.failWhen((args, opts) => args.includes('PUT') && args.at(-1).endsWith('/issues/8') && String(opts.input).includes('milestone_id') && ++puts === 2, '403 Forbidden', 1);
  assert.equal(await run(['areas', 'assign', '8', 'Docs'], h.ctx), 1);
  assert.match(h.errText(), /403 Forbidden/);
  assert.equal(h.world.milestoneState('Docs'), 'closed', 'restored even though the assign failed');
  assert.equal(h.world.milestoneOf(8), null);
});

test('[gitlab] if it still does not stick, it is a clear error, and the milestone is closed again', async () => {
  const h = harness({ gitlab: true, setup: (w) => { w.milestone({ title: 'Docs', state: 'closed', closedAt: '2026-09-01T00:00:00Z', stuck: true }); w.issue({ number: 8 }); } });
  assert.equal(await run(['areas', 'assign', '8', 'Docs'], h.ctx), 1);
  assert.match(h.errText(), /Issue #8 is not in «Docs»/);
  assert.match(h.errText(), /milestone/i);
  assert.ok(!/Done\./.test(h.text()));
  assert.equal(h.world.milestoneState('Docs'), 'closed');
});

// --- 4. the check lists a missing estimate once ----------------------------------------------------------------------------------------

for (const [name, gitlab] of [['github', false], ['gitlab', true]]) {
  test(`[${name}] areas check lists a milestone with no estimate and no Issue once, as a missing estimate`, async () => {
    const h = harness({ gitlab, setup: (w) => { w.milestone({ title: 'Ads', description: 'Paid reach.' }); } });
    assert.equal(await run(['areas', 'check'], h.ctx), 0);
    assert.match(h.text(), /No «Huddle remaining» line: Ads/);
    assert.ok(!/No Issue and remaining 0/.test(h.text()), h.text());
    assert.equal(h.text().match(/Ads/g).length, 1);
    h.out.length = 0;
    await run(['areas', 'check', '--json'], h.ctx);
    const check = JSON.parse(h.text());
    assert.deepEqual([check.missingEstimate, check.empty], [['Ads'], []]);
  });
}
