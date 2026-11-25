// Issue #304: after the chat is closed or the computer turned off, a new session runs the watch and `$huddle-play` and goes on with no block:
// a dead owner's watch is taken over, the waits of dead sessions clear themselves, an interrupted Issue is offered to continue, and the first
// round of a new Coach watch does not repeat a review. Canned adapters for GitHub and GitLab, a fake clock, a fake process table, a fake
// shared folder; no real call.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { run, labelsFiles } from '../../lib/cli/run.mjs';
import { readWorkers, claimBody } from '../../lib/core/machine.mjs';
import { pauseBody } from '../../lib/core/pause.mjs';
import { harness, request } from './harness.mjs';

const MIN = 60 * 1000;
const T0 = Date.parse('2026-11-22T12:00:00Z');
const MANAGED = '## Depends on\n\n- None\n';
const issueBody = (extra = '') => `## Depends on\n\n- None\n\n## Effort\n\n2\n\n## Branch\n\n\`h21-work\`\n\n## Allowed files\n\n- \`a.mjs\`\n${extra}`;
const read = (name) => readFileSync(fileURLToPath(new URL(`../../${name}`, import.meta.url)), 'utf8');

/**
 * A session: its own id and pid, over one shared folder (`from`). `alive` is the process table (pids that run), `boot` when the machine started,
 * `git` the answers of local git by command line.
 */
function mk({ setup, from, me = 'SrProfessional', session = { tool: 'claude', id: 'S2' }, pid = 200, alive = () => true, boot = null, clock = { t: T0 }, git, gitlab = false, stop = true }) {
  let n = 0;
  const h = harness({ gitlab, setup, wrap: (a) => ({ ...a, me: async () => me }), sleep: async () => { n += 1; if (stop && n >= 1) throw new Error('stop'); } });
  Object.assign(h.ctx, { updateCachePath: '/data/u.json', sharedDir: '/home/.huddle', session, pid, isAlive: (p) => alive(p), now: () => clock.t, bootTime: boot === null ? undefined : () => boot, git });
  if (from) { h.ctx.readFile = from.ctx.readFile; h.ctx.writeFile = from.ctx.writeFile; }
  h.clock = clock;
  return h;
}
const reviewWaits = (w) => { w.issue({ number: 214, body: MANAGED, assignees: ['ana'], reviews: [220] }); w.review({ number: 220, head: 'db42' }); };
const quiet = (w) => w.issue({ number: 5, body: MANAGED });

// --- 1. a watch whose owner is dead ---------------------------------------------------------------------------------------------------

test('Coach watch: a new session takes the watch at once when the owner process is gone, though its beat is still fresh', async () => {
  const first = mk({ setup: quiet, session: { tool: 'claude', id: 'S1' }, pid: 100 });
 assert.equal(await run(['role', 'coach'], first.ctx), 0);
  await run(['queue', '--wait', '300'], first.ctx).catch(() => {});
  const second = mk({ setup: reviewWaits, from: first, alive: (p) => p !== 100 });
  assert.equal(await run(['role', 'coach'], second.ctx), 0);
  assert.equal(await run(['queue', '--wait', '300'], second.ctx), 0);
  assert.doesNotMatch(second.text(), /already runs/);
  assert.match(second.text(), /"waits": "review"/);
  assert.equal(JSON.parse(first.ctx.readFile(labelsFiles(first.ctx).watchOwner)).session, 'S2', 'the new session owns the watch now');
});

test('Coach watch: a live owner process on this machine still keeps the one watch', async () => {
  const first = mk({ setup: quiet, session: { tool: 'claude', id: 'S1' }, pid: 100 });
 assert.equal(await run(['role', 'coach'], first.ctx), 0);
  await run(['queue', '--wait', '300'], first.ctx).catch(() => {});
  const second = mk({ setup: reviewWaits, from: first, alive: () => true });
  assert.equal(await run(['role', 'coach'], second.ctx), 0);
  assert.equal(await run(['queue', '--wait', '300'], second.ctx), 1);
  assert.match(second.text(), /The watch already runs in Claude Code \(another session\)/);
});

test('Coach watch: an owner that only held the watch to review, from before the machine started, is taken over with no question', async () => {
  const first = mk({ setup: reviewWaits, session: { tool: 'claude', id: 'S1' }, pid: 100 });
  assert.equal(await run(['role', 'coach'], first.ctx), 0);
  assert.equal(await run(['queue', '--wait', '300'], first.ctx), 0, 'its loop returned the PR to review');
  const clock = { t: T0 + 30 * MIN };
  const still = mk({ setup: reviewWaits, from: first, clock, alive: () => true });
  assert.equal(await run(['role', 'coach'], still.ctx), 0);
  assert.equal(await run(['queue', '--wait', '300'], still.ctx), 1, 'with the machine still on, its session may be reviewing: it asks for --take-over');
  assert.match(still.text(), /take over with --take-over/);
  const rebooted = mk({ setup: reviewWaits, from: first, clock, alive: () => true, boot: T0 + 10 * MIN });
  assert.equal(await run(['role', 'coach'], rebooted.ctx), 0);
  assert.equal(await run(['queue', '--wait', '300'], rebooted.ctx), 0);
  assert.doesNotMatch(rebooted.text(), /take over with --take-over|already runs/);
});

test('Player watch: a dead owner, a pid reused after a restart and a beat gone stale are all taken over with no question; a live fresh owner keeps it', async () => {
  const startNow = (w) => w.issue({ number: 30, title: 'New', body: issueBody(), assignees: ['ana'], labels: ['assigned'] });
  const seeded = (owner, beat) => {
    const h = mk({ setup: startNow, me: 'ana', session: { tool: 'claude', id: 'P2' }, pid: 300, alive: (p) => p === 555 || p === 300 });
    const files = labelsFiles(h.ctx);
    h.ctx.writeFile(files.playerOwner, JSON.stringify({ run: 'r1', pid: 555, tool: 'claude', session: 'P1', ...owner }));
    if (beat) h.ctx.writeFile(files.playerBeat, JSON.stringify(beat));
    return h;
  };
  const fresh = { at: T0 - MIN, every: 120 };
  const live = seeded({ at: T0 - 20 * MIN }, fresh);
  assert.equal(await run(['role', 'player'], live.ctx), 0);
  assert.equal(await run(['next', '--wait'], live.ctx), 1, 'a live owner with a fresh beat keeps its watch');
  assert.match(live.text(), /already runs/);
  const dead = seeded({ pid: 556, at: T0 - 20 * MIN }, fresh);
  assert.equal(await run(['role', 'player'], dead.ctx), 0);
  assert.equal(await run(['next', '--wait'], dead.ctx), 0, 'the owner process is gone');
  assert.match(dead.text(), /actionable/);
  const reused = seeded({ at: T0 - 5 * 60 * MIN }, { at: T0 - 5 * 60 * MIN, every: 120 });
  reused.ctx.bootTime = () => T0 - 60 * MIN;
  assert.equal(await run(['role', 'player'], reused.ctx), 0);
  assert.equal(await run(['next', '--wait'], reused.ctx), 0, 'the pid is alive but it belongs to a process started after the claim: another program');
  assert.match(reused.text(), /actionable/);
  const hung = seeded({ at: T0 - 5 * 60 * MIN }, { at: T0 - 5 * 60 * MIN, every: 120 });
  assert.equal(await run(['role', 'player'], hung.ctx), 0);
  assert.equal(await run(['next', '--wait'], hung.ctx), 0, 'the owner pid runs but the beat is hours old');
  assert.match(hung.text(), /actionable/);
});

// --- 2. stale waits ----------------------------------------------------------------------------------------------------------------------

test('the session start clears the waits of dead sessions, keeps the live ones, and says nothing about «run /huddle-play n» for them', async () => {
  const setup = (w) => {
    w.issue({ number: 7, body: MANAGED, assignees: ['ana'], labels: ['in review'], reviews: [70] });
    w.review({ number: 70 });
    w.issue({ number: 8, body: MANAGED, assignees: ['ana'], labels: ['in review'], reviews: [80] });
    w.review({ number: 80 });
  };
  const h = mk({ setup, me: 'ana', alive: (p) => p === 222, boot: T0 - 60 * MIN });
  const stale = { at: T0 - 3 * 60 * MIN, every: 120 };
  h.ctx.writeFile(labelsFiles(h.ctx).waitBeats, JSON.stringify({
    7: { ...stale, pid: 111 }, // its process is gone
    8: { at: T0 - 30 * 1000, every: 120, pid: 222 }, // alive and fresh
    9: stale, // an old wait with no pid, stale
    10: { at: T0 - 3 * 60 * MIN, every: 120, pid: 222 }, // its pid runs, but no round since long before the boot: another program
  }));
  assert.equal(await run(['hook'], h.ctx), 0);
  h.out.length = 0;
  assert.equal(await run(['status'], h.ctx), 0);
  assert.match(h.text(), /waiting: #8, last check 30 seconds ago/);
  assert.doesNotMatch(h.text(), /#7|#9|#10|run \/huddle-play/);
  assert.deepEqual(Object.keys(JSON.parse(h.ctx.readFile(labelsFiles(h.ctx).waitBeats))), ['8']);
});

test('a dead wait whose Issue has a Coach request waiting is still offered by the session start: the request is the resume, not the marker', async () => {
  const PROMPT = '## Prompt for Claude Code\n\n```text\ndo it\n```';
  const h = mk({ me: 'ana', alive: () => false, setup: (w) => { w.issue({ number: 5, body: MANAGED, assignees: ['ana'], labels: ['changes requested from Coach'] }); w.comment(5, request(202, { body: PROMPT })); } });
  h.ctx.writeFile(labelsFiles(h.ctx).waitBeats, JSON.stringify({ 5: { at: T0 - 3 * 60 * MIN, every: 120, pid: 111 } }));
  assert.equal(await run(['hook'], h.ctx), 0);
  assert.match(h.text(), /huddle pending <issue>/);
  assert.deepEqual(JSON.parse(h.ctx.readFile(labelsFiles(h.ctx).waitBeats) || '{}'), {});
});

// --- 3. interrupted Issues --------------------------------------------------------------------------------------------------------------

/** Local git as this machine has it: commits of the branch ahead of the base, and the time of the last one (seconds). */
const gitOf = ({ ahead = 3, lastCommit = T0 - 2 * 60 * MIN } = {}) => (args) => {
  const line = args.join(' ');
  if (/^rev-list --count /.test(line)) return `${ahead}\n`;
  if (/^log -1 --format=%ct /.test(line)) return `${Math.floor(lastCommit / 1000)}\n`;
  return '';
};
const active = (extra = {}) => (w) => w.issue({ number: 21, title: 'Work', body: issueBody(), assignees: ['ana'], labels: ['in progress'], ...extra });
const nextOf = async (h) => { h.out.length = 0; assert.equal(await run(['next', '--json'], h.ctx), 0); return JSON.parse(h.text()); };

for (const gitlab of [false, true]) {
  const on = gitlab ? 'GitLab' : 'GitHub';
  const play = (o = {}) => mk({ me: 'ana', gitlab, setup: active(), git: gitOf(), ...o });

  test(`${on}: an active Issue with commits, no worker for a while and no request is offered under resume as interrupted`, async () => {
    const r = await nextOf(play());
    assert.deepEqual(r.resume.map((x) => [x.issue, x.kind]), [[21, 'interrupted']]);
    assert.equal(r.resume[0].branch, 'h21-work');
    assert.match(r.resume[0].key, /^resume:#21:interrupted:[0-9a-f]{8}$/, 'the key carries what changes between interruptions (Issue #308)');
  });

  test(`${on}: it is not offered while it shows recent activity, in the marked session, or with no commits at all`, async () => {
    assert.deepEqual((await nextOf(play({ git: gitOf({ lastCommit: T0 - 2 * MIN }) }))).resume, [], 'a commit two minutes ago');
    assert.deepEqual((await nextOf(play({ git: gitOf({ ahead: 0 }) }))).resume, [], 'a branch with no commits is a start, not a resume');
    const marked = play();
    marked.ctx.writeFile(labelsFiles(marked.ctx).workers, JSON.stringify({ 21: { session: 'S2', tool: 'claude', at: T0 - 3 * 60 * MIN } }));
    assert.deepEqual((await nextOf(marked)).resume, [], 'this session is the marked worker');
  });

  test(`${on}: a restart makes it interrupted at once, even with activity inside the idle window`, async () => {
    const h = play({ git: gitOf({ lastCommit: T0 - 10 * MIN }), boot: T0 - 5 * MIN });
    assert.deepEqual((await nextOf(h)).resume.map((x) => x.kind), ['interrupted']);
  });

  test(`${on}: one claimed by another machine, paused, parked, in review or waiting for the Coach is never offered`, async () => {
    const other = play({ setup: (w) => { active()(w); w.comment(21, { id: 1, author: 'ana', createdAt: '2026-11-22T10:00:00Z', body: claimBody({ id: 'other-machine', name: 'Laptop' }) }); } });
    const r = await nextOf(other);
    assert.deepEqual(r.resume, []);
    assert.deepEqual(r.elsewhere.map((e) => e.issue), [21]);
    const parked = await nextOf(play({ setup: active({ labels: ['needs decision'] }) }));
    assert.deepEqual(parked.resume, []);
    const review = await nextOf(play({ setup: (w) => { active({ labels: ['in review'], reviews: [210] })(w); w.review({ number: 210 }); } }));
    assert.deepEqual(review.resume, []);
    const paused = await nextOf(play({ setup: (w) => { active()(w); w.comment(21, { id: 2, author: 'SrProfessional', createdAt: '2026-11-22T10:00:00Z', body: pauseBody('hold') }); } }));
    assert.deepEqual(paused.resume, []);
  });

  test(`${on}: labels --started leaves the worker mark, so a second session does not offer the Issue it just started`, async () => {
    const first = mk({ me: 'ana', gitlab, setup: (w) => w.issue({ number: 21, body: issueBody(), assignees: ['ana'], labels: ['assigned'] }), session: { tool: 'claude', id: 'S1' }, git: gitOf({ lastCommit: T0 - 3 * 60 * MIN }) });
    assert.equal(await run(['labels', '--issue', '21', '--started'], first.ctx), 0);
    const mark = readWorkers(first.ctx, labelsFiles(first.ctx).workers)[21];
    assert.equal(mark.session, 'S1');
    assert.equal(mark.at, T0);
    const second = mk({ me: 'ana', gitlab, from: first, setup: (w) => w.issue({ number: 21, body: issueBody(), assignees: ['ana'], labels: ['in progress'] }), git: gitOf({ lastCommit: T0 - 3 * 60 * MIN }) });
    assert.deepEqual((await nextOf(second)).resume, [], 'its mark is fresh');
    second.clock.t = T0 + 30 * MIN;
    assert.deepEqual((await nextOf(second)).resume.map((x) => x.kind), ['interrupted'], 'half an hour later nothing moved: the worker is gone');
  });

  test(`${on}: take on an interrupted Issue claims it for this session and says how to go on; the next check no longer offers it`, async () => {
    const h = play();
    assert.equal(await run(['take', '21'], h.ctx), 0);
    assert.match(h.text(), /Issue #21 was interrupted/);
    assert.match(h.text(), /h21-work/);
    assert.match(h.text(), /run the tests, finish what the Issue asks and open the PR/);
    assert.equal(readWorkers(h.ctx, labelsFiles(h.ctx).workers)[21].session, 'S2');
    assert.deepEqual((await nextOf(h)).resume, []);
  });

  test(`${on}: the Player's watch wakes for an interrupted Issue once, and not again when its key was seen`, async () => {
    const h = play();
    assert.equal(await run(['role', 'player'], h.ctx), 0);
    assert.equal(await run(['next', '--wait'], h.ctx), 0);
    const woke = JSON.parse(h.text());
    assert.deepEqual(woke.actionable.resume.map((x) => x.kind), ['interrupted']);
    const again = play();
   assert.equal(await run(['role', 'player'], again.ctx), 0);
    await run(['next', '--wait', '--seen', woke.actionable.keys[0]], again.ctx).catch(() => {});
    assert.doesNotMatch(again.text(), /actionable/);
  });
}

// Issue #308: uncommitted edits count as activity, and a later interruption of the same Issue is a new key.
/** Local git with a worktree for the branch and its `git status` paths; the file times are fake and come through ctx.mtimeOf. */
const gitWithTree = ({ status = [], head = 'aaaa1111', ...o } = {}) => (args, opts) => {
  const line = args.join(' ');
  if (/^worktree list/.test(line)) return `worktree /wt/h21-work\nHEAD ${head}\nbranch refs/heads/h21-work\n\n`;
  if (/^status --porcelain/.test(line)) { assert.equal(opts.cwd, '/wt/h21-work'); return status.join('\n') + (status.length ? '\n' : ''); }
  if (/^rev-parse /.test(line)) return `${head}\n`;
  return gitOf(o)(args);
};

for (const gitlab of [false, true]) {
  const on = gitlab ? 'GitLab' : 'GitHub';
  const withTimes = (times, g) => { const h = mk({ me: 'ana', gitlab, setup: active(), git: g }); h.ctx.mtimeOf = (p) => times[p] ?? null; return h; };
  const old = T0 - 3 * 60 * MIN;

  test(`${on}: changed files newer than the idle window keep the Issue from being offered as interrupted, though the last commit is old`, async () => {
    const times = { '/wt/h21-work/a.mjs': T0 - 3 * MIN, '/wt/h21-work/new.txt': old };
    const h = withTimes(times, gitWithTree({ status: [' M a.mjs', '?? new.txt'], lastCommit: old }));
    assert.deepEqual((await nextOf(h)).resume, []);
  });

  test(`${on}: only old commits and old changes (or no changes, or node_modules paths) still read as interrupted`, async () => {
    const times = { '/wt/h21-work/a.mjs': old, '/wt/h21-work/node_modules/x/i.js': T0 - MIN };
    const h = withTimes(times, gitWithTree({ status: [' M a.mjs', '?? node_modules/x/i.js'], lastCommit: old }));
    assert.deepEqual((await nextOf(h)).resume.map((x) => x.kind), ['interrupted']);
    const clean = withTimes({}, gitWithTree({ lastCommit: old }));
    assert.deepEqual((await nextOf(clean)).resume.map((x) => x.kind), ['interrupted']);
  });

  test(`${on}: a renamed file counts by its new path, and a path that cannot be read is skipped`, async () => {
    const times = { '/wt/h21-work/b.mjs': T0 - MIN };
    const h = withTimes(times, gitWithTree({ status: ['R  a.mjs -> b.mjs', ' D gone.mjs'], lastCommit: old }));
    assert.deepEqual((await nextOf(h)).resume, []);
  });

  test(`${on}: a later interruption of the same Issue has a new key; the same one keeps its key and is told once`, async () => {
    const keyOf = async (head, mark) => {
      const h = withTimes({}, gitWithTree({ lastCommit: old, head }));
      if (mark) h.ctx.writeFile(labelsFiles(h.ctx).workers, JSON.stringify({ 21: mark }));
      return (await nextOf(h)).resume[0].key;
    };
    const first = await keyOf('aaaa1111');
    assert.equal(await keyOf('aaaa1111'), first, 'nothing changed: the same interruption');
    assert.notEqual(await keyOf('bbbb2222'), first, 'a new commit, a new interruption');
    assert.notEqual(await keyOf('aaaa1111', { session: 'S1', tool: 'claude', at: T0 - 60 * MIN }), first, 'another worker mark is another interruption');
    const seen = withTimes({}, gitWithTree({ lastCommit: old }));
   assert.equal(await run(['role', 'player'], seen.ctx), 0);
    await run(['next', '--wait', '--seen', first], seen.ctx).catch(() => {});
    assert.doesNotMatch(seen.text(), /actionable/, 'a key already told is not repeated');
    const woken = withTimes({}, gitWithTree({ lastCommit: old, head: 'bbbb2222' }));
    assert.equal(await run(['role', 'player'], woken.ctx), 0);
    assert.equal(await run(['next', '--wait', '--seen', first], woken.ctx), 0);
    assert.match(woken.text(), /actionable/, 'the later interruption wakes the same long watch');
  });
}

// --- 4. the first Coach round after a restart ------------------------------------------------------------------------------------------

for (const gitlab of [false, true]) {
  const on = gitlab ? 'GitLab' : 'GitHub';
  const reviewed = (author, sha = 'db42') => (w) => { reviewWaits(w); w.reviewComment(220, { id: 900, author, createdAt: '2026-11-22T09:00:00Z', body: `## Review\n\nAll fine except one thing.\n\nReviewed head: ${sha}` }); };

  test(`${on}: a new watch skips a PR/MR the Coach already reviewed at the same head, from the marker in its comments (the lost --seen keys)`, async () => {
    const h = mk({ gitlab, setup: reviewed('SrProfessional') });
   assert.equal(await run(['role', 'coach'], h.ctx), 0);
    await run(['queue', '--wait', '300'], h.ctx).catch(() => {});
    assert.doesNotMatch(h.text(), /"waits"/);
    const next = mk({ gitlab, setup: reviewed('SrProfessional', 'aaaa') });
    assert.equal(await run(['role', 'coach'], next.ctx), 0);
    assert.equal(await run(['queue', '--wait', '300'], next.ctx), 0, 'another head is a new push: it is told');
    assert.match(next.text(), /"waits": "review"/);
  });

  test(`${on}: a marker written by anyone but the Coach does not count, and a plain queue read still lists the PR/MR`, async () => {
    const h = mk({ gitlab, setup: reviewed('ana') });
    assert.equal(await run(['role', 'coach'], h.ctx), 0);
    assert.equal(await run(['queue', '--wait', '300'], h.ctx), 0);
    assert.match(h.text(), /"waits": "review"/);
    const plain = mk({ gitlab, setup: reviewed('SrProfessional') });
    assert.equal(await run(['queue', '--json'], plain.ctx), 0);
    assert.match(plain.text(), /"waits": "review"/);
  });
}

// --- 5. the skills say it -------------------------------------------------------------------------------------------------------------

test('the Player and Coach skills say what a new session does about dead owners, stale waits and interrupted Issues', () => {
  const parallel = read('skills/huddle-play/parallel.md');
  const watch = read('skills/huddle-watch/SKILL.md');
  const play = read('skills/huddle-play/SKILL.md');
  for (const text of [parallel, watch]) {
    assert.match(text, /closed the chat or turned off the computer/);
    assert.match(text, /simply runs/);
  }
  assert.match(parallel, /interrupted/);
  assert.match(parallel, /stale wait/i);
  assert.match(watch, /takes the watch over|takes it over/);
  assert.match(watch, /Reviewed head:/);
  assert.match(play, /interrupted/);
  assert.ok(play.split('\n').length <= 100, 'huddle-play/SKILL.md stays within its 100 lines');
});
