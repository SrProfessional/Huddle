// Issue #339: `huddle next` and the tool slot (docs/design.md §24). An Issue that lists `- Editor: <tool>` under `## Needs` waits while another Issue of the login runs;
// while its test steps are open it holds the slot; closing them frees it. GitHub and GitLab, canned adapters; no git is run.
import test from 'node:test';
import assert from 'node:assert/strict';
import { run } from '../../lib/cli/run.mjs';
import { readSteps } from '../../lib/core/steps.mjs';
import { harness, CONFIG, GITLAB_CONFIG } from './harness.mjs';

const body = (files, needs = '') => `## Depends on\n\n- None\n\n## Effort\n\n1\n\n${needs}## Allowed files\n\n${files.map((f) => `- \`${f}\``).join('\n')}\n`;
const NEEDS = ['## Needs', '', '- Editor: Xcode', '', ''].join('\n');
const LIST = 'Reason: test it in the tool\nStep: Press Play on the scene.\nSee: The Denied counter shows 0.\nOtherwise: Send a screenshot to the Coach.\n';

const build = ({ gitlab, extra }) => {
  let who = 'ana';
  const h = harness({ gitlab, setup: extra, wrap: (a) => ({ ...a, me: async () => who }) });
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

  test(`${on}: it holds the slot from its start until its test steps are closed, then it is released`, async () => {
    const h = build({ gitlab, extra: (w) => {
      w.issue({ number: 7, title: 'Tool work', body: body(['e.mjs'], NEEDS), assignees: ['ana'], labels: ['in review'], reviews: [70] });
      w.review({ number: 70 });
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
    h.as('ana');
    r = await plan(h);
    assert.deepEqual(r.start.map((s) => s.issue), [11], 'the steps are closed: the slot is free');
  });

  test(`${on}: a failed or skipped last step also releases the slot`, async () => {
    for (const close of [['--failed', '--note', 'it crashed'], ['--skip', '--note', 'no time']]) {
      const h = build({ gitlab, extra: (w) => {
        w.issue({ number: 7, title: 'Tool work', body: body(['e.mjs'], NEEDS), assignees: ['ana'], labels: ['in review'], reviews: [70] });
        w.review({ number: 70 });
        w.issue({ number: 11, title: 'Plain', body: body(['p.mjs']), assignees: ['ana'], labels: ['assigned'] });
      } });
      h.ctx.writeFile('/tmp/steps.txt', LIST);
      await run(['steps', '7', '--post', '/tmp/steps.txt'], h.ctx);
      h.as('SrProfessional');
      assert.equal(await run(['steps', '7', ...close], h.ctx), 0);
      h.as('ana');
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
    assert.equal(await run(['steps', '7', '--post', '/tmp/steps.txt'], h.ctx), 0);
    h.as('SrProfessional');
    assert.equal(await run(['steps', '7', '--done', '--note', 'stash'], h.ctx), 0);
    assert.equal(readSteps(h.world.commentsOf(7)).steps[0].note, 'stash');
    assert.equal(await run(['steps', '7', '--done', '--bogus'], h.ctx), 2);
  });

  test(`${on}: an Issue that closed (its PR landed) while its test steps are open still holds the slot, its steps stay closable, and closing the last one releases it`, async () => {
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
    assert.match(h.text(), /main checkout/, 'it tells the session to return the checkout to the base branch');
    h.as('ana');
    r = await plan(h);
    assert.deepEqual(r.start.map((s) => s.issue), [11], 'the last step is closed: the slot is free');
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

  test(`${on}: any other error (a network failure) skips that record for this round, keeps it, and never breaks the command`, async () => {
    const h = closedHolder();
    await h.ready();
    h.breakWith(new Error('network down'));
    h.err.length = 0;
    const r = await plan(h);
    assert.equal(h.err.length, 1);
    assert.match(h.errText(), /#7.*network down/);
    assert.deepEqual(r.start.map((s) => s.issue), [11]);
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

  test(`${on}: skipping the last step of a closed Issue releases the slot, clears the record and prints the return line`, async () => {
    const h = closedHolder();
    await h.ready();
    h.as('SrProfessional');
    h.out.length = 0;
    assert.equal(await run(['steps', '7', '--skip', '--note', 'I will never test this'], h.ctx), 0);
    assert.match(h.text(), /#7 held the main checkout: return it to staging now/);
    assert.deepEqual(JSON.parse(h.ctx.readFile(h.slotPath)), {});
    h.as('ana');
    assert.deepEqual((await plan(h)).start.map((s) => s.issue), [11]);
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
        assert.match(h.errText(), new RegExp(`#${n}.*skipped this time, its record stays`));
        assert.ok(JSON.parse(h.ctx.readFile(h.slotPath))[n], `the record stays: ${text}`);
        assert.equal(whyOf(r)[11], undefined, 'this round does not hold, and nothing crashed');
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
