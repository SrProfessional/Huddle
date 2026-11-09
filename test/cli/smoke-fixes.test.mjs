// Fixes from the first smoke test (Issue #25): what `huddle labels` says about created labels, and the visible line of the SessionStart hook.
import test from 'node:test';
import assert from 'node:assert/strict';
import { run } from '../../lib/cli/run.mjs';
import { harness, request, CONFIG } from './harness.mjs';

const NO_DEPS = '## Depends on\n\n- None\n';
const HUDDLE_LABELS = ['ready', 'blocked', 'assigned', 'in progress', 'in review', 'changes requested from AI Manager', 'needs decision', 'design'];
const repoLabelCount = (h) => Object.keys(h.world.repoLabels()).length;

// Finding 3: a new repo got its labels but the output said only «0 label change(s)».
test('labels says how many labels it created on a new repo, and none the second time', async () => {
  const h = harness({ setup: (w) => w.issue({ number: 1, body: NO_DEPS }) });
  assert.equal(repoLabelCount(h), 0);
  assert.equal(await run(['labels'], h.ctx), 0);
  assert.match(h.text(), /^8 labels created\.$/m);
  assert.equal(repoLabelCount(h), 8);
  h.out.length = 0;
  await run(['labels'], h.ctx);
  assert.match(h.text(), /^0 labels created\.$/m);
});

test('labels counts only the labels that are missing, under the names of huddle.json', async () => {
  const h = harness({ config: { ...CONFIG, labels: { review: 'under review' } }, setup: (w) => {
    w.issue({ number: 1, body: NO_DEPS });
    for (const n of ['ready', 'blocked', 'in review']) w.repoLabel(n); // «in review» is no longer Huddle's name here
  } });
  await run(['labels'], h.ctx);
  assert.match(h.text(), /^6 labels created\.$/m);
});

test('labels --dry-run says how many labels it would create and creates none', async () => {
  const h = harness({ setup: (w) => w.issue({ number: 1, body: NO_DEPS }) });
  assert.equal(await run(['labels', '--dry-run'], h.ctx), 0);
  assert.match(h.text(), /^8 labels would be created \(dry run\)\.$/m);
  assert.equal(repoLabelCount(h), 0);
});

test('labels says «1 label created.» in the singular', async () => {
  const h = harness({ setup: (w) => {
    w.issue({ number: 1, body: NO_DEPS });
    for (const n of HUDDLE_LABELS.slice(0, 7)) w.repoLabel(n);
  } });
  await run(['labels'], h.ctx);
  assert.match(h.text(), /^1 label created\.$/m);
});

// Finding 2: additionalContext reaches only Claude, who speaks after the developer types; the developer needs a line of their own.
test('hook also gives a visible systemMessage when something is pending', async () => {
  const h = harness({ setup: (w) => { w.issue({ number: 5, assignees: ['SrProfessional'], labels: ['in progress'] }); w.comment(5, request(401)); } });
  assert.equal(await run(['hook'], h.ctx), 0);
  const j = JSON.parse(h.text());
  assert.match(j.systemMessage, /^Huddle: .*AI Manager.*#5/);
  assert.ok(!j.systemMessage.includes('\n'), 'one visible line');
  assert.match(j.hookSpecificOutput.additionalContext, /Issue #5/, 'Claude still gets its context');
});

test('hook prints no systemMessage, nor anything, when nothing is pending', async () => {
  const h = harness({ setup: (w) => w.issue({ number: 5, assignees: ['SrProfessional'], labels: ['in progress'] }) });
  assert.equal(await run(['hook'], h.ctx), 0);
  assert.equal(h.text(), '');
});
