// Issue #339: `huddle next` and the tool slot (docs/design.md §24). An Issue that lists `- Editor: <tool>` under `## Needs` waits while another Issue of the login runs;
// It holds the slot through testing and until the main checkout is verified back on the base. GitHub, GitLab and checkout data are faked.
import test from 'node:test';
import assert from 'node:assert/strict';
import { run } from '../../lib/cli/run.mjs';
import { readSteps, stepCloseBody } from '../../lib/core/steps.mjs';
import { harness, CONFIG, GITLAB_CONFIG } from './harness.mjs';

const body = (files, needs = '') => `## Depends on\n\n- None\n\n## Effort\n\n1\n\n${needs}## Allowed files\n\n${files.map((f) => `- \`${f}\``).join('\n')}\n`;
const NEEDS = ['## Needs', '', '- Editor: Xcode', '', ''].join('\n');
const LIST = 'Reason: test it in the tool\nStep: Press Play on the scene.\nSee: The Denied counter shows 0.\nOtherwise: Send a screenshot to the Coach.\n';

function checkout(h) {
  const state = { status: '', branch: 'staging', behind: '0\n', fetchError: null };
  const reads = [];
  h.ctx.git = (args, { cwd }) => {
    const command = args.join(' ');
    if (command === 'worktree list --porcelain') {
      return 'worktree /repo\nHEAD abc123\nbranch refs/heads/staging\n\nworktree /repo/.claude/worktrees/linked\nHEAD def456\nbranch refs/heads/linked\n';
    }
    assert.equal(cwd, '/repo');
    reads.push(command);
    switch (command) {
      case 'fetch origin --quiet': if (state.fetchError) throw state.fetchError; return '';
      case 'status --porcelain --untracked-files=all': return state.status;
      case 'branch --show-current': return state.branch;
      case 'rev-list --count HEAD..refs/remotes/origin/staging': return state.behind;
      default: if (state.extra) return state.extra(args); assert.fail(command);
    }
  };
  return { state, reads };
}

const build = ({ gitlab, extra }) => {
  let who = 'ana';
  const config = { ...(gitlab ? GITLAB_CONFIG : CONFIG), staging_branch: 'staging' };
  const h = harness({ gitlab, config, setup: extra, wrap: (a) => ({ ...a, me: async () => who }) });
  h.ctx.updateCachePath = '/data/u.json';
  h.as = (name) => { who = name; };
  return h;
};
const plan = async (h) => { h.out.length = 0; assert.equal(await run(['next', '--json'], h.ctx), 0); return JSON.parse(h.text()); };
const whyOf = (r) => Object.fromEntries(r.wait.map((w) => [w.issue, w.why]));

for (const gitlab of [false, true]) {
  const on = gitlab ? 'GitLab' : 'GitHub';

  test(`${on}: an tool Issue waits for the one that runs, and the plain Issues still start`, async () => {
    const h = build({ gitlab, extra: (w) => {
      w.issue({ number: 5, title: 'Running', body: body(['a.mjs']), assignees: ['ana'], labels: ['in progress'] });
      w.issue({ number: 10, title: 'Needs the tool', body: body(['e.mjs'], NEEDS), assignees: ['ana'], labels: ['assigned'] });
      w.issue({ number: 11, title: 'Plain', body: body(['p.mjs']), assignees: ['ana'], labels: ['assigned'] });
    } });
    const r = await plan(h);
    assert.deepEqual(r.start.map((s) => s.issue), [11]);
    assert.equal(whyOf(r)[10], 'waits for the tool: #5 is running');
    h.out.length = 0;
    await run(['next'], h.ctx);
    assert.match(h.text(), /#10 \(effort 1\): waits for the tool: #5 is running/);
  });

  test(`${on}: with nothing running it starts alone, and the others of its login wait for it`, async () => {
    const h = build({ gitlab, extra: (w) => {
      w.issue({ number: 10, title: 'Needs the tool', body: body(['e.mjs'], NEEDS), assignees: ['ana'], labels: ['assigned'] });
      w.issue({ number: 11, title: 'Plain', body: body(['p.mjs']), assignees: ['ana'], labels: ['assigned'] });
    } });
    const r = await plan(h);
    assert.deepEqual(r.start.map((s) => s.issue), [10]);
    assert.equal(whyOf(r)[11], 'waits for the tool: #10 uses it');
  });

  test(`${on}: closing the last test step keeps an open Issue's slot until the return is verified`, async () => {
    const h = build({ gitlab, extra: (w) => {
      w.issue({ number: 7, title: 'Tool work', body: body(['e.mjs'], NEEDS), assignees: ['ana'], labels: ['in review'], reviews: [70] });
      w.review({ number: 70, base: 'staging', body: 'Closes #7' });
      w.issue({ number: 11, title: 'Plain', body: body(['p.mjs']), assignees: ['ana'], labels: ['assigned'] });
      w.issue({ number: 12, title: 'Needs the tool too', body: body(['f.mjs'], NEEDS), assignees: ['ana'], labels: ['assigned'] });
    } });
    // in review with no steps: it ended, nothing is held
    assert.deepEqual((await plan(h)).start.map((s) => s.issue), [11]);
    h.ctx.writeFile('/tmp/steps.txt', LIST);
    assert.equal(await run(['steps', '7', '--post', '/tmp/steps.txt'], h.ctx), 0);
    let r = await plan(h);
    assert.deepEqual(r.start, []);
    assert.equal(whyOf(r)[11], 'waits for the tool: #7 uses it');
    assert.equal(whyOf(r)[12], 'waits for the tool: #7 uses it');
    assert.equal(r.used, 0, 'the holder counts only its effort, and an Issue in review has none');
    h.as('SrProfessional');
    h.out.length = 0;
    assert.equal(await run(['steps', '7', '--done'], h.ctx), 0);
    assert.match(h.text(), /steps 7 --return/);
    h.as('ana');
    r = await plan(h);
    assert.deepEqual(r.start, []);
    assert.equal(whyOf(r)[11], 'waits for the tool: #7 (return of the main checkout pending) uses it');
    assert.deepEqual(r.returns.map((entry) => entry.issue), [7]);
    checkout(h);
    assert.equal(await run(['steps', '7', '--return'], h.ctx), 0);
    assert.deepEqual((await plan(h)).start.map((s) => s.issue), [11]);
  });

  test(`${on}: a failed or skipped last step also leaves the return pending`, async () => {
    for (const close of [['--failed', '--note', 'it crashed'], ['--skip', '--note', 'no time']]) {
      const h = build({ gitlab, extra: (w) => {
        w.issue({ number: 7, title: 'Tool work', body: body(['e.mjs'], NEEDS), assignees: ['ana'], labels: ['in review'], reviews: [70] });
        w.review({ number: 70, base: 'staging', body: 'Closes #7' });
        w.issue({ number: 11, title: 'Plain', body: body(['p.mjs']), assignees: ['ana'], labels: ['assigned'] });
      } });
      h.ctx.writeFile('/tmp/steps.txt', LIST);
      await run(['steps', '7', '--post', '/tmp/steps.txt'], h.ctx);
      h.as('SrProfessional');
      assert.equal(await run(['steps', '7', ...close], h.ctx), 0);
      h.as('ana');
      assert.deepEqual((await plan(h)).start, []);
      checkout(h);
      assert.equal(await run(['steps', '7', '--return'], h.ctx), 0);
      assert.deepEqual((await plan(h)).start.map((s) => s.issue), [11]);
    }
  });

  test(`${on}: the slot is per login: another login's tool Issue neither holds nor waits for this one`, async () => {
    const h = build({ gitlab, extra: (w) => {
      w.issue({ number: 7, title: 'Luis runs the tool', body: body(['e.mjs'], NEEDS), assignees: ['luis'], labels: ['in progress'] });
      w.issue({ number: 10, title: 'Ana needs it too', body: body(['f.mjs'], NEEDS), assignees: ['ana'], labels: ['assigned'] });
    } });
    assert.deepEqual((await plan(h)).start.map((s) => s.issue), [10]);
  });

  test(`${on}: an Issue without «## Needs» behaves as before`, async () => {
    const h = build({ gitlab, extra: (w) => {
      w.issue({ number: 5, title: 'Running', body: body(['a.mjs']), assignees: ['ana'], labels: ['in progress'] });
      w.issue({ number: 10, title: 'Plain', body: body(['b.mjs']), assignees: ['ana'], labels: ['assigned'] });
    } });
    const r = await plan(h);
    assert.deepEqual(r.start.map((s) => s.issue), [10]);
    assert.deepEqual(r.wait, []);
  });

  test(`${on}: the person's answer to the checkout question travels as the note of «huddle steps <n> --done --note»`, async () => {
    const h = build({ gitlab, extra: (w) => {
      w.issue({ number: 7, title: 'Tool work', body: body(['e.mjs'], NEEDS), assignees: ['ana'], labels: ['in progress'] });
    } });
    h.ctx.writeFile('/tmp/steps.txt', 'Reason: the main checkout has changes that are not committed\nStep: Choose what happens to the changes in your main checkout: commit them, save them aside with a stash so I can give them back, or ask me to wait.\nSee: Your answer is saved on the Issue.\nOtherwise: Tell me what you saw.\n');
    assert.equal(await run(['steps', '7', '--post', '/tmp/steps.txt', '--preflight'], h.ctx), 0);
    h.as('SrProfessional');
    assert.equal(await run(['steps', '7', '--done', '--note', 'stash'], h.ctx), 0);
    assert.equal(readSteps(h.world.commentsOf(7)).steps[0].note, 'stash');
    assert.doesNotMatch(h.text(), /steps 7 --return/);
    assert.equal(await run(['steps', '7', '--done', '--bogus'], h.ctx), 2);
  });

  test(`${on}: a closed Issue still reserves the checkout while testing and while the return is pending or blocked`, async () => {
    const issue7 = { number: 7, title: 'Tool work', body: body(['e.mjs'], NEEDS), assignees: ['ana'], labels: ['in review'], reviews: [70] };
    const h = build({ gitlab, extra: (w) => {
      w.issue(issue7);
      w.review({ number: 70 });
      w.issue({ number: 11, title: 'Plain', body: body(['p.mjs']), assignees: ['ana'], labels: ['assigned'] });
      w.issue({ number: 12, title: 'Needs the tool too', body: body(['f.mjs'], NEEDS), assignees: ['ana'], labels: ['assigned'] });
    } });
    h.ctx.writeFile('/tmp/steps.txt', LIST);
    assert.equal(await run(['steps', '7', '--post', '/tmp/steps.txt'], h.ctx), 0);
    h.world.issue({ ...issue7, state: 'merged', labels: [] }); // the PR landed in staging: the Issue is closed
    let r = await plan(h);
    assert.deepEqual(r.start, []);
    assert.equal(whyOf(r)[11], 'waits for the tool: #7 (closed, its test steps are still open) uses it');
    assert.equal(whyOf(r)[12], 'waits for the tool: #7 (closed, its test steps are still open) uses it');
    h.out.length = 0;
    assert.equal(await run(['steps', '--json'], h.ctx), 0);
    const listed = JSON.parse(h.text()).steps;
    assert.deepEqual(listed.map((s) => [s.issue, s.step]), [[7, 1]], 'huddle steps still lists the closed Issue');
    h.as('SrProfessional');
    h.out.length = 0;
    assert.equal(await run(['steps', '7', '--done'], h.ctx), 0);
    assert.match(h.text(), /main checkout.*steps 7 --return/);
    h.as('ana');
    r = await plan(h);
    assert.deepEqual(r.start, []);
    assert.equal(whyOf(r)[12], 'waits for the tool: #7 (return of the main checkout pending) uses it');
    assert.deepEqual(r.returns.map((entry) => entry.issue), [7]);

    h.as('SrProfessional');
    h.out.length = 0;
    assert.equal(await run(['steps', '--json'], h.ctx), 0, 'a new Coach command can find the pending return');
    assert.deepEqual(JSON.parse(h.text()).returns.map((entry) => entry.issue), [7]);
    const { state, reads } = checkout(h);
    h.ctx.writeFile('/repo/.claude/worktrees/linked/huddle.json', h.ctx.readFile('/repo/huddle.json'));
    h.ctx.root = '/repo/.claude/worktrees/linked';
    h.ctx.cwd = '/repo/.claude/worktrees/linked';
    h.as('luis');
    assert.equal(await run(['steps', '7', '--return'], h.ctx), 1);
    assert.deepEqual(reads, [], 'another login cannot perform verification or release on this record');
    h.as('SrProfessional');
    state.status = ' M person.txt\n';
    assert.equal(await run(['steps', '7', '--return'], h.ctx), 1);
    assert.match(h.text(), /changes that are not committed/);
    h.as('ana');
    assert.deepEqual((await plan(h)).start, []);
    h.as('SrProfessional');
    state.status = '';
    state.branch = 'h140-editor-slot';
    assert.equal(await run(['steps', '7', '--return'], h.ctx), 1);
    state.branch = 'staging';
    state.behind = '1\n';
    assert.equal(await run(['steps', '7', '--return'], h.ctx), 1);
    state.behind = '\n';
    assert.equal(await run(['steps', '7', '--return'], h.ctx), 1);
    state.behind = '0\n';
    state.fetchError = new Error('offline');
    assert.equal(await run(['steps', '7', '--return'], h.ctx), 1);
    h.as('ana');
    assert.deepEqual((await plan(h)).start, []);
    h.as('SrProfessional');
    state.fetchError = null;
    assert.equal(await run(['steps', '7', '--return'], h.ctx), 0);
    assert.deepEqual(reads.slice(-4), ['fetch origin --quiet', 'branch --show-current', 'status --porcelain --untracked-files=all', 'rev-list --count HEAD..refs/remotes/origin/staging']);
    h.as('ana');
    assert.deepEqual((await plan(h)).start.map((s) => s.issue), [11]);
  });

  test(`${on}: an Issue that is closed and was never a tool Issue is still refused by huddle steps`, async () => {
    const h = build({ gitlab, extra: (w) => { w.issue({ number: 8, title: 'Plain', body: body(['p.mjs']), assignees: ['ana'], labels: [], state: 'merged' }); } });
    h.as('SrProfessional');
    assert.equal(await run(['steps', '8', '--done'], h.ctx), 1);
    assert.match(h.text(), /not an open Issue/);
  });

  // Review round 2: a record that cannot be read never breaks a command; the record belongs to one login; the skip path releases the slot.
  const closedHolder = ({ n: N = 7 } = {}) => {
    const issue7 = { number: N, title: 'Tool work', body: body(['e.mjs'], NEEDS), assignees: ['ana'], labels: ['in review'], reviews: [70] };
    let broken = null;
    let brokenLabels = null;
    let who = 'ana';
    const h = harness({ gitlab, config: { ...(gitlab ? GITLAB_CONFIG : CONFIG), staging_branch: 'staging' }, setup: (w) => {
      w.issue(issue7);
      w.review({ number: 70 });
      w.issue({ number: 11, title: 'Plain', body: body(['p.mjs']), assignees: ['ana'], labels: ['assigned'] });
      w.issue({ number: 21, title: 'Luis plain', body: body(['q.mjs']), assignees: ['luis'], labels: ['assigned'] });
    }, wrap: (a) => ({ ...a, me: async () => who, comments: async (n) => { if (broken && n === N) throw broken; return a.comments(n); }, issueLabels: async (n) => { if (broken && n === N) throw brokenLabels ?? broken; return a.issueLabels(n); } }) });
    h.ctx.updateCachePath = '/data/u.json';
    const paths = [];
    const write = h.ctx.writeFile;
    h.ctx.writeFile = (p, t) => { paths.push(p); write(p, t); };
    h.as = (name) => { who = name; };
    h.breakWith = (e, labelsError = null) => { broken = e; brokenLabels = labelsError; };
    h.ready = async () => {
      h.ctx.writeFile('/tmp/steps.txt', LIST);
      assert.equal(await run(['steps', String(N), '--post', '/tmp/steps.txt'], h.ctx), 0);
      h.world.issue({ ...issue7, state: 'merged', labels: [] });
      h.slotPath = paths.filter((x) => /toolslot/.test(x)).at(-1);
    };
    return h;
  };

  test(`${on}: a recorded Issue that cannot be found is dropped with ONE line, and never breaks next, steps or the start`, async () => {
    const h = closedHolder();
    await h.ready();
    h.breakWith(Object.assign(new Error('gh: Could not resolve to an Issue with the number of 7.'), { notFound: true }));
    h.err.length = 0;
    const r = await plan(h);
    assert.deepEqual(r.start.map((s) => s.issue), [11], 'the dropped record holds nothing');
    assert.equal(h.err.length, 1);
    assert.match(h.errText(), /#7/);
    assert.match(h.errText(), /not found|Could not resolve/i);
    assert.deepEqual(JSON.parse(h.ctx.readFile(h.slotPath)), {}, 'the record is removed from the file');
    h.err.length = 0;
    assert.equal(await run(['steps', '--json'], h.ctx), 0);
    assert.equal(h.err.length, 0, 'said once');
  });

  test(`${on}: a transient read error keeps the slot reserved and never breaks the command`, async () => {
    const h = closedHolder();
    await h.ready();
    h.breakWith(new Error('network down'));
    h.err.length = 0;
    const r = await plan(h);
    assert.equal(h.err.length, 1);
    assert.match(h.errText(), /#7.*network down/);
    assert.deepEqual(r.start, []);
    assert.equal(whyOf(r)[11], 'waits for the tool: #7 (test step state could not be confirmed) uses it');
    assert.ok(JSON.parse(h.ctx.readFile(h.slotPath))[7], 'the record stays');
    h.out.length = 0;
    assert.equal(await run(['steps', '--json'], h.ctx), 0, 'steps does not crash either');
    h.breakWith(null);
    assert.equal(whyOf(await plan(h))[11], 'waits for the tool: #7 (closed, its test steps are still open) uses it', 'the next round holds again');
  });

  test(`${on}: a corrupt or empty record file is ignored with one line, and never breaks a command`, async () => {
    const h = closedHolder();
    await h.ready();
    h.ctx.writeFile(h.slotPath, '{not json');
    h.err.length = 0;
    assert.deepEqual((await plan(h)).start.map((s) => s.issue), [11]);
    assert.equal(h.err.length, 1);
    assert.match(h.errText(), /record/i);
    h.ctx.writeFile(h.slotPath, '');
    h.err.length = 0;
    assert.deepEqual((await plan(h)).start.map((s) => s.issue), [11]);
    assert.equal(h.err.length, 0, 'an empty file is just no record');
  });

  test(`${on}: the record belongs to the login that wrote it; another login on the machine is not held; an old record without a login counts for everyone`, async () => {
    const h = closedHolder();
    await h.ready();
    assert.equal(JSON.parse(h.ctx.readFile(h.slotPath))[7].login, 'ana');
    assert.equal(whyOf(await plan(h))[11], 'waits for the tool: #7 (closed, its test steps are still open) uses it');
    h.as('luis');
    const r = await plan(h);
    assert.deepEqual(r.start.map((s) => s.issue), [21], 'luis is not held by the record of ana');
    h.out.length = 0;
    assert.equal(await run(['steps', '--json'], h.ctx), 0);
    assert.deepEqual(JSON.parse(h.text()).steps, [], 'and does not see her step');
    h.ctx.writeFile(h.slotPath, JSON.stringify({ 7: { title: 'Tool work' } }));
    assert.equal(whyOf(await plan(h))[21], 'waits for the tool: #7 (closed, its test steps are still open) uses it', 'an old record, written before logins were stored, holds for every login');
  });

  test(`${on}: skipping the last step of a closed Issue records a pending return and prints its pointer`, async () => {
    const h = closedHolder();
    await h.ready();
    h.as('SrProfessional');
    h.out.length = 0;
    assert.equal(await run(['steps', '7', '--skip', '--note', 'I will never test this'], h.ctx), 0);
    assert.match(h.text(), /#7 still holds the main checkout.*staging.*steps 7 --return/);
    assert.equal(JSON.parse(h.ctx.readFile(h.slotPath))[7].returnPending, true);
    checkout(h);
    assert.equal(await run(['steps', '7', '--return'], h.ctx), 0);
    assert.deepEqual(JSON.parse(h.ctx.readFile(h.slotPath)), {});
    h.as('ana');
    assert.deepEqual((await plan(h)).start.map((s) => s.issue), [11]);
  });

  test(`${on}: a new session recovers a return when the closer stopped after posting the last closure`, async () => {
    const h = closedHolder();
    await h.ready();
    const records = JSON.parse(h.ctx.readFile(h.slotPath));
    h.ctx.writeFile(h.slotPath, JSON.stringify({ ...records, 7: { ...records[7], closing: true } }));
    h.world.comment(7, { id: 800, author: 'SrProfessional', createdAt: '9999', body: stepCloseBody('done', { n: 1, total: 1, do: 'Press Play on the scene.' }) });
    assert.equal(JSON.parse(h.ctx.readFile(h.slotPath))[7].returnPending, undefined);
    h.breakWith(new Error('network down'));
    assert.deepEqual((await plan(h)).start, [], 'a read error cannot clear an interrupted return');
    h.breakWith(null);
    assert.deepEqual((await plan(h)).start, []);
    h.as('SrProfessional');
    h.out.length = 0;
    assert.equal(await run(['steps', '--json'], h.ctx), 0);
    assert.deepEqual(JSON.parse(h.text()).returns.map(({ issue }) => issue), [7]);
    checkout(h);
    assert.equal(await run(['steps', '7', '--return'], h.ctx), 0);
    h.as('ana');
    assert.deepEqual((await plan(h)).start.map(({ issue }) => issue), [11]);
  });

  for (const recovery of ['clean retry', 'conflict resolved with the person']) test(`${on}: an approved stash is recovered by identity and restored behind the reservation (${recovery})`, async () => {
    const h = build({ gitlab, extra: (w) => {
      w.issue({ number: 7, title: 'Tool issue', body: body(['e.mjs'], NEEDS), assignees: ['ana'], labels: ['in progress'] });
      w.issue({ number: 11, title: 'Plain', body: body(['p.mjs']), assignees: ['ana'], labels: ['assigned'] });
    } });
    const { state, reads } = checkout(h);
    const slotFile = () => Object.keys(h.slotWrites).at(-1);
    const slots = () => JSON.parse(h.ctx.readFile(slotFile()) ?? '{}');
    h.slotWrites = {};
    const write = h.ctx.writeFile;
    h.ctx.writeFile = (f, t) => { if (f.includes('huddle-toolslot-') && f.endsWith('.json')) h.slotWrites[f] = true; write(f, t); };
    h.ctx.createExclusive = (f, t) => {
      if (h.ctx.readFile(f)) return false;
      h.ctx.writeFile(f, t);
      return true;
    };
    h.ctx.removeFile = (f) => h.ctx.writeFile(f, '');
    const oid = 'a'.repeat(40);
    const unrelated = 'b'.repeat(40);
    let tag;
    let applyOutcome = 'interrupt';
    let unmerged = '';
    state.status = ' M person.txt\n';
    state.extra = (args) => {
      const [git, command, ...rest] = args;
      if (git === 'stash' && command === 'list') return `${unrelated}\tOn staging: user stash\n${tag ? `${oid}\tOn staging: ${tag}\n` : ''}`;
      if (git === 'stash' && command === 'push') {
        assert.deepEqual(rest.slice(0, 2), ['--include-untracked', '--message']);
        tag = rest[2];
        assert.ok(slots()[7].stash.tag, 'the unique tag exists before git changes the checkout');
        state.status = '';
        throw new Error('interrupted after Git saved the stash');
      }
      if (git === 'update-ref') {
        assert.match(command, /^refs\/huddle\/tool-stashes\//);
        assert.deepEqual(rest, [oid]);
        return '';
      }
      if (git === 'stash' && command === 'apply') {
        assert.deepEqual(rest, ['--index', oid]);
        assert.ok(slots()[7].stash.restoring, 'the slot is still held while Git restores the stash');
        if (applyOutcome === 'interrupt') throw new Error('interrupted');
        state.status = ' M person.txt\n';
        if (applyOutcome === 'conflict') { unmerged = 'person.txt\n'; throw new Error('conflict'); }
        return '';
      }
      if (git === 'diff' && command === '--name-only') return unmerged;
      assert.fail(args.join(' '));
    };
    assert.equal(await run(['steps', '7', '--stash'], h.ctx), 1);
    assert.equal(reads.length, 0, 'without approval, Git is not asked to save changes');
    h.ctx.writeFile('/tmp/preflight.txt', LIST);
    assert.equal(await run(['steps', '7', '--post', '/tmp/preflight.txt', '--preflight'], h.ctx), 0);
    h.as('SrProfessional');
    assert.equal(await run(['steps', '7', '--done', '--note', 'stash'], h.ctx), 0);
    h.as('ana');
    assert.equal(await run(['steps', '7', '--stash'], h.ctx), 1, 'the first attempt ends after git created the stash');
    assert.equal(await run(['steps', '7', '--stash'], h.ctx), 0, 'a later process recovers the already saved stash by its tag');
    assert.equal(slots()[7].stash.oid, oid);
    assert.equal(reads.filter((r) => r.startsWith('stash push')).length, 1);
    assert.equal((await plan(h)).returns, undefined, 'preflight has no pending return');
    h.ctx.writeFile('/tmp/test.txt', LIST);
    assert.equal(await run(['steps', '7', '--post', '/tmp/test.txt'], h.ctx), 0);
    h.world.issue({ number: 7, title: 'Tool issue', body: body(['e.mjs'], NEEDS), assignees: ['ana'], state: 'merged' });
    h.as('SrProfessional');
    assert.equal(await run(['steps', '7', '--done'], h.ctx), 0);
    const lockFile = `${slotFile()}.checkout.lock`;
    h.ctx.writeFile(lockFile, JSON.stringify({ pid: 99999, at: 1000 }));
    h.ctx.isAlive = (pid) => pid === 99999;
    const beforeLockCheck = reads.length;
    assert.equal(await run(['steps', '7', '--return'], h.ctx), 1);
    assert.equal(reads.length, beforeLockCheck, 'another live handoff prevents any Git write');
    h.ctx.isAlive = () => false;
    state.status = '?? new-work\n';
    assert.equal(await run(['steps', '7', '--return'], h.ctx), 1);
    assert.ok(!reads.some((r) => r.startsWith('stash apply')), 'verify the clean base before restoring the saved changes');
    state.status = '';
    assert.equal(await run(['steps', '7', '--return'], h.ctx), 1);
    h.as('ana');
    assert.deepEqual((await plan(h)).start, []);
    h.as('SrProfessional');
    if (recovery === 'clean retry') {
      applyOutcome = 'success';
      assert.equal(await run(['steps', '7', '--return'], h.ctx), 0, 'a clean retry can restore the exact stash');
    } else {
      applyOutcome = 'conflict';
      assert.equal(await run(['steps', '7', '--return'], h.ctx), 1);
      assert.equal(await run(['steps', '7', '--return'], h.ctx), 1, 'a dirty retry does not apply the stash a third time');
      assert.equal(await run(['steps', '7', '--return', '--confirm-restored'], h.ctx), 1, 'confirmation cannot skip unresolved conflicts');
      h.as('ana');
      assert.deepEqual((await plan(h)).start, []);
      h.as('SrProfessional');
      unmerged = '';
      assert.equal(await run(['steps', '7', '--return', '--confirm-restored'], h.ctx), 0);
    }
    assert.equal(reads.filter((r) => r.startsWith('stash apply')).length, 2);
    assert.deepEqual(slots(), {});
    h.as('ana');
    assert.deepEqual((await plan(h)).start.map(({ issue }) => issue), [11]);
  });

  // Review round 3: only a real «not found» drops a record. The adapters build «<command and arguments> failed: <stderr>»: the arguments hold the Issue number, so a
  // network error, a rate limit or a DNS error on Issue 404 or 1404 must keep the record. The adapters' own not-found logic is reused through `issueLabels`, which flags `notFound`.
  const cmd = (n) => (gitlab ? `glab api projects/acme%2Fapp/issues/${n}/notes --paginate failed: ` : `gh api repos/acme/app/issues/${n}/comments --paginate --slurp failed: `);
  const NOT_THERE = (n) => (gitlab ? [`404 Not Found`, `404 Not found`] : [`gh: Not Found (HTTP 404)`, `GraphQL: Could not resolve to an Issue with the number of ${n}. (repository.issue)`]).map((t) => `${cmd(n)}${t}`);
  const NOT_GONE = (n) => ['error connecting to api.github.com', gitlab ? 'API rate limit exceeded (429)' : `gh: API rate limit exceeded for user ID ${n} (HTTP 403)`, `Post "https://api.github.com/graphql": dial tcp: lookup api.github.com: Could not resolve host: api.github.com`, 'gh: command not found'].map((t) => `${cmd(n)}${t}`);
  for (const n of [404, 1404]) {
    test(`${on}: on Issue ${n} a network error, a rate limit, a DNS error or a missing CLI keep the record, with one line`, async () => {
      for (const text of NOT_GONE(n)) {
        const h = closedHolder({ n });
        await h.ready();
        h.breakWith(new Error(text)); // the probe fails the same way: not a «not found»
        h.err.length = 0;
        const r = await plan(h);
        assert.equal(h.err.length, 1, text);
        assert.match(h.errText(), new RegExp(`#${n}.*state unconfirmed, the slot stays held`));
        assert.ok(JSON.parse(h.ctx.readFile(h.slotPath))[n], `the record stays: ${text}`);
        assert.equal(whyOf(r)[11], `waits for the tool: #${n} (test step state could not be confirmed) uses it`);
        h.breakWith(null);
        assert.equal(whyOf(await plan(h))[11], `waits for the tool: #${n} (closed, its test steps are still open) uses it`, 'the next round holds again');
      }
    });

    test(`${on}: on Issue ${n} the real not-found answers drop the record, with one line`, async () => {
      for (const text of NOT_THERE(n)) {
        const h = closedHolder({ n });
        await h.ready();
        h.breakWith(new Error(text), Object.assign(new Error(text), { notFound: true })); // what the adapter itself flags
        h.err.length = 0;
        const r = await plan(h);
        assert.equal(h.err.length, 1, text);
        assert.match(h.errText(), new RegExp(`#${n}.*dropped`));
        assert.deepEqual(JSON.parse(h.ctx.readFile(h.slotPath)), {}, `dropped: ${text}`);
        assert.deepEqual(r.start.map((x) => x.issue), [11]);
      }
    });
  }
}
