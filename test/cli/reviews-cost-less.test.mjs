// Issue #195: reviews cost less. The merge state of a PR/MR is read with no tokens (reviewMerge); the watch answers a conflicting PR/MR by
// itself; the Player brings the base in before asking for review; a later review round reads only what changed. Canned adapters only.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { run } from '../../lib/cli/run.mjs';
import { harness, CONFIG, GITLAB_CONFIG } from './harness.mjs';

const MANAGED = '## Depends on\n\n- None\n';
const world = (mergeable) => (w) => {
  w.issue({ number: 42, title: 'Add login form', body: MANAGED, assignees: ['ana'], reviews: [51] });
  w.review({ number: 51, head: 'aaa111', base: 'main', mergeable });
};

for (const gitlab of [false, true]) {
  const kind = gitlab ? 'gitlab' : 'github';
  test(`[${kind}] reviewMerge reads clean, conflicting and unknown, and a failed read is unknown`, async () => {
    for (const [canned, want] of [['MERGEABLE', 'clean'], ['CONFLICTING', 'conflicting'], ['UNKNOWN', 'unknown'], ['FAIL', 'unknown']]) {
      const h = harness({ gitlab, setup: world(canned) });
      const adapter = await h.ctx.createPlatform(gitlab ? GITLAB_CONFIG : CONFIG);
      assert.equal(await adapter.reviewMerge(51), want, canned);
    }
  });

  test(`[${kind}] queue --json: a review item carries its merge state`, async () => {
    const h = harness({ gitlab, setup: world('CONFLICTING') });
    assert.equal(await run(['queue', '--json'], h.ctx), 0);
    assert.equal(JSON.parse(h.text()).waiting[0].merge, 'conflicting');
  });
}

/** A watch harness whose sleep ends the loop after `rounds` rounds. */
function watching(setup, rounds = 1) {
  let n = 0;
  const h = harness({ setup, sleep: async () => { n += 1; if (n >= rounds) throw new Error('stop'); } });
  h.ctx.updateCachePath = '/data/huddle-update.json';
  return h;
}

test('the watch answers a conflicting PR by itself: one request on the PR and its Issue, naming the base; the session is not woken', async () => {
  const h = watching(world('CONFLICTING'), 2);
  await run(['queue', '--wait', '300'], h.ctx).catch(() => {});
  assert.doesNotMatch(h.text(), /"waiting"/, 'the Coach\'s session is not woken for a conflict');
  const onPr = h.world.commentsOf(51).filter((c) => /🔁 Changes requested/.test(c.body));
  const onIssue = h.world.commentsOf(42).filter((c) => /🔁 Changes requested/.test(c.body));
  assert.equal(onPr.length, 1, 'one comment on the PR, even after two rounds');
  assert.equal(onIssue.length, 1);
  assert.match(onPr[0].body, /## Prompt for Claude Code/);
  assert.match(onPr[0].body, /git merge origin\/main/);
  assert.match(onPr[0].body, /Ready for review again/);
});

test('a restarted watch does not ask again for a head it already asked about (the marker on the PR)', async () => {
  const first = watching(world('CONFLICTING'), 2);
  await run(['queue', '--wait', '300'], first.ctx).catch(() => {});
  const asked = first.world.commentsOf(51).find((c) => /🔁 Changes requested/.test(c.body));
  assert.match(asked.body, /<!-- huddle: update requested for aaa111 -->/);
  const again = watching((w) => {
    world('CONFLICTING')(w);
    w.comment(51, { id: 900, author: 'coach', body: asked.body, createdAt: '2026-11-17T00:00:00Z' });
  }, 2);
  await run(['queue', '--wait', '300'], again.ctx).catch(() => {});
  assert.equal(again.world.commentsOf(51).filter((c) => /🔁 Changes requested/.test(c.body)).length, 1, 'no second request on the PR');
  assert.equal(again.world.commentsOf(42).filter((c) => /🔁 Changes requested/.test(c.body)).length, 0, 'none on the Issue either');
});

test('a clean PR wakes the session as before', async () => {
  const h = watching(world('MERGEABLE'));
  assert.equal(await run(['queue', '--wait', '300'], h.ctx), 0);
  assert.equal(JSON.parse(h.text()).waiting[0].merge, 'clean');
});

const read = (rel) => readFileSync(fileURLToPath(new URL(`../../${rel}`, import.meta.url)), 'utf8').replace(/\s+/g, ' ');

test('the play skill brings the base in before the PR and before «Ready for review again», and reports the counts after it', () => {
  const t = read('skills/huddle-play/SKILL.md');
  assert.match(t, /git merge origin\/<base>/);
  assert.match(t, /before opening the PR\/MR and before commenting «Ready for review again»/);
  assert.match(t, /counts after the merge/);
});

test('the review skill writes the reviewed head, reads only the delta on a later round, and keeps only the test summary', () => {
  const t = read('skills/huddle-review/SKILL.md');
  assert.match(t, /Reviewed head: <sha>/);
  assert.match(t, /git diff <old>\.\.<new>/);
  assert.match(t, /only the summary lines/);
});
