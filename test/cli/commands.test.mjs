import test from 'node:test';
import assert from 'node:assert/strict';
import { run } from '../../lib/cli/run.mjs';
import { harness, request, CONFIG } from './harness.mjs';

const DEPS = (n) => `## Depends on\n\n- #${n}\n`;
const labelsWorld = (w) => {
  w.issue({ number: 1, title: 'done', state: 'merged' });
  w.issue({ number: 2, title: 'ready one', body: DEPS(1) });
  w.issue({ number: 3, title: 'blocked one', body: DEPS(9) });
  w.issue({ number: 9, title: 'open dep', body: '## Depends on\n\nNone.\n', assignees: ['ana'], labels: ['in progress'] });
};

test('labels --dry-run prints the changes and writes nothing', async () => {
  const h = harness({ setup: labelsWorld });
  const code = await run(['labels', '--dry-run'], h.ctx);
  assert.equal(code, 0);
  assert.match(h.text(), /#2 assigned to luis/, 'ana already has #9, so luis has the fewest');
  assert.match(h.text(), /#3 → blocked \(waits for #9\)/);
  assert.match(h.text(), /dry run: nothing was changed/);
  assert.deepEqual(h.world.labelsOf(2), []);
  assert.deepEqual(h.world.assigneesOf(2), []);
  assert.deepEqual(h.world.repoLabels(), {});
});

test('labels assigns, creates the labels and sets them', async () => {
  const h = harness({ setup: labelsWorld });
  assert.equal(await run(['labels'], h.ctx), 0);
  assert.deepEqual(h.world.assigneesOf(2), ['luis']);
  assert.deepEqual(h.world.labelsOf(2), ['assigned']);
  assert.deepEqual(h.world.labelsOf(3), ['blocked']);
  assert.equal(Object.keys(h.world.repoLabels()).length, 7);
});

test('labels applies the renames from huddle.json', async () => {
  const h = harness({ config: { ...CONFIG, labels: { blocked: 'waiting', changes: 'needs-changes' } }, setup: labelsWorld });
  await run(['labels'], h.ctx);
  assert.deepEqual(h.world.labelsOf(3), ['waiting']);
  const created = Object.keys(h.world.repoLabels());
  assert.ok(created.includes('waiting') && created.includes('needs-changes'));
  assert.ok(!created.includes('blocked') && !created.includes('changes requested from AI Manager'));
  // a second run sees «waiting» as the blocked label and changes nothing
  const again = harness({ config: { ...CONFIG, labels: { blocked: 'waiting' } }, setup: (w) => { labelsWorld(w); w.issue({ number: 3, body: DEPS(9), labels: ['waiting'] }); } });
  await run(['labels'], again.ctx);
  assert.deepEqual(again.world.labelsOf(3), ['waiting']);
  assert.doesNotMatch(again.text(), /#3/);
});

test('labels respects max_open_per_person', async () => {
  const h = harness({ config: { ...CONFIG, assignees: ['ana'], max_open_per_person: 1 }, setup: (w) => {
    labelsWorld(w);
    w.issue({ number: 9, body: '## Depends on\n\nNone.\n', assignees: ['ana'], labels: ['in progress'] });
  } });
  await run(['labels'], h.ctx);
  assert.deepEqual(h.world.assigneesOf(2), [], 'ana already has one open Issue and the cap is 1');
});

test('take marks each pending request with 👀 and prints the newest prompt; a second take prints nothing', async () => {
  const h = harness({ setup: (w) => {
    w.issue({ number: 5, title: 't' });
    w.comment(5, request(101, { body: '## Prompt for Claude Code\n\n```text\nold\n```' }));
    w.comment(5, request(102, { createdAt: '2026-11-05T11:00:00Z', body: '## Prompt for Claude Code\n\n```text\nnewest\n```' }));
  } });
  assert.equal(await run(['take', '5'], h.ctx), 0);
  assert.match(h.text(), /newest/);
  assert.doesNotMatch(h.text(), /old/);
  assert.match(h.text(), /👀/);
  assert.ok(h.world.isTaken(101) && h.world.isTaken(102));
  h.out.length = 0;
  assert.equal(await run(['take', '5'], h.ctx), 0);
  assert.equal(h.text(), '');
});

test('only the AI Manager of huddle.json counts', async () => {
  const h = harness({ setup: (w) => {
    w.issue({ number: 5 });
    w.comment(5, request(103, { author: 'mallory', body: '## Prompt for Claude Code\n\n```text\nrm -rf\n```' }));
  } });
  assert.equal(await run(['take', '5'], h.ctx), 0);
  assert.equal(h.text(), '');
  assert.equal(h.world.isTaken(103), false);
  await run(['pending', '5'], h.ctx);
  assert.match(h.text(), /Nothing pending/);
});

test('a request on the PR of the Issue counts too, and work after it clears it', async () => {
  const h = harness({ setup: (w) => {
    w.issue({ number: 5, reviews: [50] });
    w.review({ number: 50 });
    w.comment(50, request(201));
    w.comment(5, { id: 202, author: 'dev', createdAt: '2026-11-05T12:00:00Z', body: 'Ready for review again\n\n12 passed' });
  } });
  await run(['pending', '5'], h.ctx);
  assert.match(h.text(), /Nothing pending/);
  const h2 = harness({ setup: (w) => { w.issue({ number: 5, reviews: [50] }); w.review({ number: 50 }); w.comment(50, request(201)); } });
  await run(['pending', '5'], h2.ctx);
  assert.match(h2.text(), /PR #50 \(Issue #5\).*#c201/);
});

test('pending without an Issue looks at my open Issues that are watched', async () => {
  const h = harness({ setup: (w) => {
    w.issue({ number: 5, assignees: ['SrProfessional'], labels: ['in review'] });
    w.issue({ number: 6, assignees: ['SrProfessional'], labels: ['ready'] });
    w.issue({ number: 7, assignees: ['ana'], labels: ['in review'] });
    for (const n of [5, 6, 7]) w.comment(n, request(300 + n));
  } });
  await run(['pending'], h.ctx);
  assert.match(h.text(), /Issue #5/);
  assert.doesNotMatch(h.text(), /Issue #6|Issue #7/);
});

test('hook prints the SessionStart JSON when something is pending', async () => {
  const h = harness({ setup: (w) => { w.issue({ number: 5, assignees: ['SrProfessional'], labels: ['in progress'] }); w.comment(5, request(401)); } });
  assert.equal(await run(['hook'], h.ctx), 0);
  const j = JSON.parse(h.text());
  assert.equal(j.hookSpecificOutput.hookEventName, 'SessionStart');
  assert.match(j.hookSpecificOutput.additionalContext, /Issue #5/);
  assert.match(j.hookSpecificOutput.additionalContext, /huddle take/);
  assert.equal(h.world.isTaken(401), false, 'the hook never takes');
});

test('hook is silent and exits 0 when nothing is pending, offline, not configured or invalid', async () => {
  const quiet = async (h) => { assert.equal(await run(['hook'], h.ctx), 0); assert.equal(h.text(), ''); assert.equal(h.errText(), ''); };
  await quiet(harness({ setup: (w) => w.issue({ number: 5, assignees: ['SrProfessional'], labels: ['in progress'] }) }));
  await quiet(harness({ wrap: (a) => ({ ...a, me: async () => { throw new Error('offline'); } }) }));
  await quiet(harness({ file: null }));
  await quiet(harness({ file: '{"platform":"github"}' }));
  await quiet(harness({ file: '{broken' }));
});

test('hook gives up quietly after its timeout', async () => {
  const h = harness({ wrap: (a) => ({ ...a, me: () => new Promise(() => {}) }) });
  h.ctx.hookTimeoutMs = 20;
  assert.equal(await run(['hook'], h.ctx), 0);
  assert.equal(h.text(), '');
});

test('wait prints the request as soon as there is one', async () => {
  const h = harness({ setup: (w) => { w.issue({ number: 5 }); w.comment(5, request(501)); } });
  assert.equal(await run(['wait', '5'], h.ctx), 0);
  assert.match(h.text(), /left a request on Issue #5.*huddle take 5/s);
});

test('wait keeps 120 s by default, at least 30 s, and survives being offline', async () => {
  const waits = [];
  let fail = true;
  const h = harness({
    setup: (w) => w.issue({ number: 5 }),
    wrap: (a) => ({ ...a, comments: async (n) => { if (fail) { fail = false; throw new Error('offline'); } return a.comments(n); } }),
    sleep: async (ms) => { waits.push(ms); if (waits.length === 2) h.world.comment(5, request(502)); },
  });
  assert.equal(await run(['wait', '5'], h.ctx), 0);
  assert.deepEqual(waits, [120000, 120000]);
  assert.match(h.text(), /request/);
  const w2 = [];
  const h2 = harness({ setup: (w) => w.issue({ number: 5 }), sleep: async (ms) => { w2.push(ms); h2.world.comment(5, request(503)); } });
  await run(['wait', '5', '5'], h2.ctx);
  assert.deepEqual(w2, [30000]);
});

test('wait ends when the Issue is finished', async () => {
  const h = harness({ setup: (w) => w.issue({ number: 5, state: 'merged' }) });
  assert.equal(await run(['wait', '5'], h.ctx), 0);
  assert.match(h.text(), /Issue #5 is finished/);
});

test('an invalid huddle.json is refused with the field named, by every command but hook', async () => {
  for (const argv of [['labels'], ['wait', '5'], ['take', '5'], ['pending']]) {
    const h = harness({ file: JSON.stringify({ ...CONFIG, max_open_per_person: 'two' }) });
    assert.equal(await run(argv, h.ctx), 1, argv.join(' '));
    assert.match(h.errText(), /"max_open_per_person"/);
  }
});

test('an unknown command prints usage and exits 2; take needs an Issue number', async () => {
  const h = harness();
  assert.equal(await run(['nope'], h.ctx), 2);
  assert.match(h.errText(), /Usage:/);
  const h2 = harness();
  assert.equal(await run(['take'], h2.ctx), 2);
});

test('doctor passes on a healthy setup', async () => {
  const h = harness({ wrap: (a) => ({ ...a, listLabels: async () => ['ready', 'assigned', 'in progress', 'in review', 'blocked', 'needs decision', 'changes requested from AI Manager'] }) });
  assert.equal(await run(['doctor'], h.ctx), 0);
  assert.doesNotMatch(h.text(), /✖/);
  assert.match(h.text(), /✔ huddle\.json/);
  assert.match(h.text(), /✔ login/);
});

test('doctor reports a bad huddle.json', async () => {
  const h = harness({ file: JSON.stringify({ ...CONFIG, platform: 'svn' }) });
  assert.equal(await run(['doctor'], h.ctx), 1);
  assert.match(h.text(), /✖ huddle\.json.*"platform"/);
  const none = harness({ file: null });
  assert.equal(await run(['doctor'], none.ctx), 1);
  assert.match(none.text(), /✖ huddle\.json.*not found/);
});

test('doctor reports a missing login', async () => {
  const h = harness({ wrap: (a) => ({ ...a, me: async () => { throw new Error('gh auth login required'); } }) });
  assert.equal(await run(['doctor'], h.ctx), 1);
  assert.match(h.text(), /✖ login: gh is not logged in.*gh auth login/); // Issue #41: an auth failure says so, with the step
});

test('doctor reports missing labels, honoring renames', async () => {
  const h = harness({ config: { ...CONFIG, labels: { blocked: 'waiting' } }, wrap: (a) => ({ ...a, listLabels: async () => ['ready', 'blocked'] }) });
  assert.equal(await run(['doctor'], h.ctx), 1);
  assert.match(h.text(), /✖ labels.*missing: .*waiting/);
  assert.doesNotMatch(h.text(), /missing:[^\n]*\bready\b/);
});

// --- H10: the operations the interface gained (Issue #16) ---

const closedWorld = (w) => {
  labelsWorld(w);
  w.issue({ number: 20, title: 'merged long ago', state: 'merged', labels: ['in review', 'changes requested from AI Manager', 'bug'] });
  w.issue({ number: 21, title: 'closed by hand', state: 'closed-by-hand', labels: ['needs decision'] });
  w.issue({ number: 22, title: 'clean', state: 'merged', labels: ['bug'] });
};

test('labels --dry-run lists the closed-Issue cleanup and changes nothing', async () => {
  const h = harness({ setup: closedWorld });
  assert.equal(await run(['labels', '--dry-run'], h.ctx), 0);
  assert.match(h.text(), /#20 \(closed\) loses in review, changes requested from AI Manager/);
  assert.match(h.text(), /#21 \(closed\) loses needs decision/);
  assert.doesNotMatch(h.text(), /#22/);
  assert.match(h.text(), /\d+ label change\(s\) \(dry run/);
  assert.deepEqual(h.world.labelsOf(20), ['in review', 'changes requested from AI Manager', 'bug']);
});

test('labels takes every Huddle label off closed Issues and keeps the others; the count includes them', async () => {
  const h = harness({ setup: closedWorld });
  assert.equal(await run(['labels'], h.ctx), 0);
  assert.deepEqual(h.world.labelsOf(20), ['bug']);
  assert.deepEqual(h.world.labelsOf(21), []);
  assert.deepEqual(h.world.labelsOf(22), ['bug']);
  const first = /(\d+) label change/.exec(h.text())[1];
  h.out.length = 0;
  await run(['labels'], h.ctx);
  assert.doesNotMatch(h.text(), /\(closed\)/, 'a second run has nothing left to clean');
  assert.ok(Number(first) >= 2);
});

test('labels cleans closed Issues under the names of huddle.json', async () => {
  const h = harness({ config: { ...CONFIG, labels: { review: 'under review' } }, setup: (w) => {
    w.issue({ number: 20, state: 'merged', labels: ['under review', 'in review'] }); // «in review» is no longer Huddle's name here
  } });
  await run(['labels'], h.ctx);
  assert.deepEqual(h.world.labelsOf(20), ['in review']);
});

test('doctor reports the labels the project lacks, using the adapter\'s own list', async () => {
  const h = harness();
  assert.equal(await run(['doctor'], h.ctx), 1);
  assert.match(h.text(), /✖ labels.*missing: ready, assigned/);
  assert.doesNotMatch(h.text(), /not checked/);
});

test('doctor checks the AI Manager on the platform', async () => {
  const labelsOk = async () => ['ready', 'assigned', 'in progress', 'in review', 'blocked', 'needs decision', 'changes requested from AI Manager'];
  const found = harness({ wrap: (a) => ({ ...a, listLabels: labelsOk }) });
  assert.equal(await run(['doctor'], found.ctx), 0);
  assert.match(found.text(), /✔ ai_manager.*SrProfessional/);
  const lost = harness({ config: { ...CONFIG, ai_manager: 'ghost-user' }, wrap: (a) => ({ ...a, listLabels: labelsOk }) });
  assert.equal(await run(['doctor'], lost.ctx), 1);
  assert.match(lost.text(), /✖ ai_manager.*ghost-user.*not found/);
  const flaky = harness({ wrap: (a) => ({ ...a, listLabels: labelsOk, findUser: async () => { throw new Error('network down'); } }) });
  assert.equal(await run(['doctor'], flaky.ctx), 0, 'a failed lookup is a warning, not a verdict');
  assert.match(flaky.text(), /⚠ ai_manager.*network down/);
});

test('take passes the number of the Issue or PR where the request lives to markTaken', async () => {
  const calls = [];
  const h = harness({ wrap: (a) => ({ ...a, markTaken: async (n, id) => { calls.push([n, id]); return a.markTaken(n, id); } }), setup: (w) => {
    w.issue({ number: 5, reviews: [50] });
    w.review({ number: 50 });
    w.comment(5, request(101));
    w.comment(50, request(102, { createdAt: '2026-11-05T11:00:00Z' }));
  } });
  assert.equal(await run(['take', '5'], h.ctx), 0);
  assert.deepEqual(calls.sort((a, b) => a[1] - b[1]), [[5, 101], [50, 102]]);
  assert.ok(h.world.isTaken(101) && h.world.isTaken(102));
});

test('a commit newer than the request clears it; an older one does not', async () => {
  const world = (commit) => (w) => {
    w.issue({ number: 5, reviews: [50] });
    w.review({ number: 50, commits: [commit] });
    w.comment(50, request(201)); // 10:00
  };
  const newer = harness({ setup: world('2026-11-05T12:00:00Z') });
  await run(['pending', '5'], newer.ctx);
  assert.match(newer.text(), /Nothing pending/);
  assert.equal(await run(['take', '5'], newer.ctx), 0);
  assert.equal(newer.world.isTaken(201), false, 'nothing to take: the work moved past it');
  const older = harness({ setup: world('2026-11-05T09:00:00Z') });
  await run(['pending', '5'], older.ctx);
  assert.match(older.text(), /PR #50 \(Issue #5\)/);
});

const branchWorld = (w) => {
  w.issue({ number: 5, assignees: ['SrProfessional'], labels: ['in review'], reviews: [50] });
  w.issue({ number: 6, assignees: ['SrProfessional'], labels: ['in review'] });
  w.review({ number: 50, branch: 'h5-thing' });
  w.comment(5, request(301));
  w.comment(6, request(302));
};

test('pending inside an Issue\'s branch looks only at that Issue; an argument wins over the branch', async () => {
  const h = harness({ setup: branchWorld });
  h.ctx.currentBranch = async () => 'h5-thing';
  await run(['pending'], h.ctx);
  assert.match(h.text(), /Issue #5/);
  assert.doesNotMatch(h.text(), /Issue #6/);
  h.out.length = 0;
  await run(['pending', '6'], h.ctx);
  assert.match(h.text(), /Issue #6/);
});

test('pending falls back to my Issues on a branch that resolves no Issue, on no branch, or without currentBranch', async () => {
  for (const branch of ['main', 'scratch', null, undefined]) {
    const h = harness({ setup: branchWorld });
    if (branch !== undefined) h.ctx.currentBranch = async () => branch;
    await run(['pending'], h.ctx);
    assert.match(h.text(), /Issue #5/, String(branch));
    assert.match(h.text(), /Issue #6/, String(branch));
  }
});

// --- the request labels are automatic (SocialCortex PR #139) ---

const NONE = '## Depends on\n\nNone.\n';
const CHANGES = 'changes requested from AI Manager';
const requestWorld = (extra) => (w) => {
  w.issue({ number: 5, title: 'five', body: NONE, assignees: ['ana'], labels: ['in progress'] });
  extra(w);
};

test('labels puts «changes requested» on an Issue whose prompt waits, and --dry-run only says so', async () => {
  const setup = requestWorld((w) => w.comment(5, request(401)));
  const dry = harness({ setup });
  assert.equal(await run(['labels', '--dry-run'], dry.ctx), 0);
  assert.match(dry.text(), new RegExp(`#5 \\+ ${CHANGES}`));
  assert.deepEqual(dry.world.labelsOf(5), ['in progress']);
  const h = harness({ setup });
  await run(['labels'], h.ctx);
  assert.deepEqual(h.world.labelsOf(5), ['in progress', CHANGES]);
  h.out.length = 0;
  await run(['labels'], h.ctx);
  assert.doesNotMatch(h.text(), new RegExp(CHANGES), 'a second run changes nothing');
});

test('labels takes «changes requested» off once the session said «Ready for review again» or pushed a newer commit', async () => {
  const ready = harness({ setup: (w) => {
    w.issue({ number: 5, body: NONE, assignees: ['ana'], labels: ['in progress', CHANGES] });
    w.comment(5, request(401));
    w.comment(5, { id: 402, author: 'dev', createdAt: '2026-11-05T12:00:00Z', body: 'Ready for review again\n\n12 passed' });
  } });
  await run(['labels'], ready.ctx);
  assert.deepEqual(ready.world.labelsOf(5), ['in progress']);
  const pushed = harness({ setup: (w) => {
    w.issue({ number: 5, body: NONE, assignees: ['ana'], labels: ['in review', CHANGES], reviews: [50] });
    w.review({ number: 50, commits: ['2026-11-05T12:00:00Z'] });
    w.comment(50, request(401));
  } });
  await run(['labels'], pushed.ctx);
  assert.deepEqual(pushed.world.labelsOf(5), ['in review']);
});

test('a pending request on the PR takes «in review» off and puts «changes requested» on; no other status label', async () => {
  const h = harness({ setup: (w) => {
    w.issue({ number: 5, body: NONE, assignees: ['ana'], labels: ['in review'], reviews: [50] });
    w.review({ number: 50, commits: ['2026-11-05T09:00:00Z'] });
    w.comment(50, request(401));
  } });
  await run(['labels'], h.ctx);
  assert.deepEqual(h.world.labelsOf(5), [CHANGES]);
});

test('once the request is taken (👀) the Issue is «in progress» and loses «changes requested»; after the work, «in review» again', async () => {
  const h = harness({ setup: (w) => {
    w.issue({ number: 5, body: NONE, assignees: ['ana'], labels: [CHANGES], reviews: [50] });
    w.review({ number: 50, commits: ['2026-11-05T09:00:00Z'] });
    w.comment(50, request(401, { taken: true }));
  } });
  await run(['labels'], h.ctx);
  assert.deepEqual(h.world.labelsOf(5).sort(), ['in progress']);
  h.world.review({ number: 50, commits: ['2026-11-05T09:00:00Z', '2026-11-05T12:00:00Z'] });
  await run(['labels'], h.ctx);
  assert.deepEqual(h.world.labelsOf(5), ['in review']);
});

test('labels takes «needs decision» off when the AI Manager answered with a prompt', async () => {
  const h = harness({ setup: (w) => {
    w.issue({ number: 5, body: NONE, assignees: ['ana'], labels: ['in progress', 'needs decision'] });
    w.comment(5, { id: 410, author: 'SrProfessional', createdAt: '2026-11-05T09:00:00Z', body: '❓ Decision for the AI Manager: which one?' });
    w.comment(5, request(411, { createdAt: '2026-11-05T10:00:00Z' }));
  } });
  await run(['labels'], h.ctx);
  assert.deepEqual(h.world.labelsOf(5), ['in progress', CHANGES]);
  const waiting = harness({ setup: (w) => {
    w.issue({ number: 5, body: NONE, assignees: ['ana'], labels: ['in progress', 'needs decision'] });
    w.comment(5, request(411, { createdAt: '2026-11-05T08:00:00Z' }));
    w.comment(5, { id: 410, author: 'SrProfessional', createdAt: '2026-11-05T09:00:00Z', body: '❓ Decision for the AI Manager: which one?' });
  } });
  await run(['labels'], waiting.ctx);
  assert.deepEqual(waiting.world.labelsOf(5), ['in progress', 'needs decision'], 'the question is newer: it waits for the AI Manager');
});

test('labels leaves Issues without «Depends on» alone, and uses the renamed labels', async () => {
  const unmanaged = harness({ setup: (w) => { w.issue({ number: 5, body: 'no section', labels: [] }); w.comment(5, request(401)); } });
  await run(['labels'], unmanaged.ctx);
  assert.deepEqual(unmanaged.world.labelsOf(5), []);
  const renamed = harness({ config: { ...CONFIG, labels: { changes: 'needs-changes' } }, setup: requestWorld((w) => w.comment(5, request(401))) });
  await run(['labels'], renamed.ctx);
  assert.deepEqual(renamed.world.labelsOf(5), ['in progress', 'needs-changes']);
});

test('hook narrows to the Issue of the branch too', async () => {
  const h = harness({ setup: branchWorld });
  h.ctx.currentBranch = async () => 'h5-thing';
  assert.equal(await run(['hook'], h.ctx), 0);
  const context = JSON.parse(h.text()).hookSpecificOutput.additionalContext;
  assert.match(context, /Issue #5/);
  assert.doesNotMatch(context, /Issue #6/);
});
