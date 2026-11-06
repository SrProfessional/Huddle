// Huddle: on GitLab, Issues and MRs are numbered separately, so a request left on an MR must be read, taken and cleared through
// merge_requests/:iid, and every message says «MR !N» (Issue #32, findings 4 and 5). Fake `glab` output only; GitHub stays as it was.
import test from 'node:test';
import assert from 'node:assert/strict';
import { run } from '../../lib/cli/run.mjs';
import { harness, request } from './harness.mjs';

const NONE = '## Depends on\n\nNone.\n';
const CHANGES = 'changes requested from AI Manager';

// Issue #5 is closed by MR !2. Issue #2 also exists and is unrelated: reading MR !2's notes as Issue #2's finds nothing (or the wrong thing).
const world = (extra = () => {}) => (w) => {
  w.issue({ number: 2, title: 'unrelated Issue with the same number as the MR' });
  w.issue({ number: 5, title: 'five', body: NONE, assignees: ['ana'], labels: ['in progress'], reviews: [2] });
  w.review({ number: 2 });
  extra(w);
};
// A `wait` that would sleep means it found nothing: fail at once instead of looping forever.
const noSleep = async () => { throw new Error('wait would sleep: nothing found'); };
const gl = (extra) => harness({ gitlab: true, sleep: noSleep, setup: world(extra) });

test('GitLab: a request on the MR is pending, and says «MR !2 (Issue #5)» with a link to the MR note', async () => {
  const h = gl((w) => w.reviewComment(2, request(4181)));
  assert.equal(await run(['pending', '5'], h.ctx), 0);
  assert.match(h.text(), /MR !2 \(Issue #5\): https:\/\/gitlab\.com\/acme\/app\/-\/merge_requests\/2#note_4181/);
  assert.doesNotMatch(h.text(), /PR #/);
});

test('GitLab: take marks the note of the MR (not a note of Issue #2) and says «MR !2»', async () => {
  const h = gl((w) => w.reviewComment(2, request(4181)));
  assert.equal(await run(['take', '5'], h.ctx), 0);
  assert.equal(h.world.isTaken(4181), true);
  assert.match(h.text(), /on MR !2 \(Issue #5\)/);
  assert.doesNotMatch(h.text(), /PR #/);
  h.out.length = 0;
  await run(['pending', '5'], h.ctx);
  assert.match(h.text(), /Nothing pending/);
});

test('GitLab: a push to the MR after the request clears it', async () => {
  const h = gl((w) => {
    w.reviewComment(2, request(4181, { createdAt: '2026-11-05T10:00:00Z' }));
    w.review({ number: 2, commits: ['2026-11-05T11:00:00Z'] });
  });
  await run(['pending', '5'], h.ctx);
  assert.match(h.text(), /Nothing pending/);
});

test('GitLab: a note on Issue #2 is not taken for a note on MR !2', async () => {
  const h = gl((w) => w.comment(2, request(4182)));
  await run(['pending', '5'], h.ctx);
  assert.match(h.text(), /Nothing pending/);
});

test('GitLab: labels puts «changes requested» for a request on the MR, and takes it off after a push', async () => {
  const h = gl((w) => w.reviewComment(2, request(4181)));
  await run(['labels'], h.ctx);
  assert.ok(h.world.labelsOf(5).includes(CHANGES), h.world.labelsOf(5).join(','));
  const pushed = gl((w) => {
    w.reviewComment(2, request(4181));
    w.review({ number: 2, commits: ['2026-11-05T11:00:00Z'] });
  });
  pushed.world.issue({ number: 5, title: 'five', body: NONE, assignees: ['ana'], labels: ['in progress', CHANGES], reviews: [2] });
  await run(['labels'], pushed.ctx);
  assert.ok(!pushed.world.labelsOf(5).includes(CHANGES), pushed.world.labelsOf(5).join(','));
});

test('GitLab: the hook says «MR !2», never «PR #2»', async () => {
  // The hook looks at my open Issues (watched labels, assigned to the token's login): put Issue #5 on it.
  const h2 = harness({ gitlab: true, setup: (w) => {
    w.issue({ number: 5, title: 'five', body: NONE, assignees: ['SrProfessional'], labels: ['in progress'], reviews: [2] });
    w.review({ number: 2 });
    w.reviewComment(2, request(4181));
  } });
  await run(['hook'], h2.ctx);
  const text = h2.text();
  assert.match(text, /MR !2 \(Issue #5\)/);
  assert.match(text, /on MR !N \(Issue #M\)/);
  assert.doesNotMatch(text, /PR #/);
});

test('GitLab: wait says «MR !2» when a request is there, and «its MR was merged» when the Issue is done', async () => {
  const h = gl((w) => w.reviewComment(2, request(4181)));
  await run(['wait', '5'], h.ctx);
  assert.match(h.text(), /request on MR !2 \(Issue #5\)/);
  const done = harness({ gitlab: true, setup: (w) => w.issue({ number: 5, state: 'merged' }) });
  await run(['wait', '5'], done.ctx);
  assert.match(done.text(), /its MR was merged/);
  assert.doesNotMatch(done.text(), /PR/);
});

test('GitHub keeps saying «PR #N»', async () => {
  const h = harness({ setup: (w) => { w.issue({ number: 5, reviews: [50] }); w.review({ number: 50 }); w.reviewComment(50, request(201)); } });
  await run(['pending', '5'], h.ctx);
  assert.match(h.text(), /PR #50 \(Issue #5\)/);
});
