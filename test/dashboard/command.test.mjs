// Issue #232: `huddle dashboard` on both platforms, from the in-memory fakes and canned answers. No real GitHub, GitLab, OpenRouter or network.
import test from 'node:test';
import assert from 'node:assert/strict';
import { run } from '../../lib/cli/run.mjs';
import { CONFIG, GITLAB_CONFIG, fakeNow, harness } from '../cli/harness.mjs';

const REQUEST = '## Prompt for Claude Code\n\n```text\nDo it again\n```';
const FEED = { data: [{ id: 'anthropic/claude-sonnet-4.5', pricing: { prompt: '0.000003', completion: '0.000015' } }] };
const ROWS = [
  { day: '2026-11-20', tool: 'Claude Code', model: 'claude-sonnet-4-5', issue: 10, input: 1000000, output: 100000, cacheRead: 0, cacheWrite: 0, reasoning: 0 },
  { day: '2026-11-20', tool: 'Claude Code', model: 'claude-sonnet-4-5', issue: 'no Issue', input: 10, output: 0, cacheRead: 0, cacheWrite: 0, reasoning: 0 },
];
const posix = (p) => String(p).replaceAll('\\', '/');

function mk({ gitlab = false, fail = false } = {}) {
  const base = gitlab ? GITLAB_CONFIG : CONFIG;
  const config = { ...base, staging_branch: 'staging' };
  const h = harness({
    gitlab, config,
    setup: (w) => {
      w.issue({ number: 10, title: 'Ten', body: '## Effort\n\n3\n', state: 'merged' });
      w.issue({ number: 50, title: 'Open one', body: '## Depends on\n\n- None\n', labels: ['in progress'], assignees: ['ana'] });
      w.review({ number: 30, base: 'staging', body: 'Closes #10', merged: true, mergedAt: '2026-11-20T10:00:00Z', commits: ['2026-11-20T04:00:00Z', '2026-11-20T06:00:00Z'] });
      const note = { id: 801, author: 'SrProfessional', body: REQUEST, createdAt: '2026-11-20T07:00:00Z' };
      if (gitlab) w.reviewComment(30, note); else w.comment(30, note);
    },
  });
  const written = new Map();
  const copied = [];
  const opened = [];
  const fetched = [];
  const original = h.ctx.writeFile;
  h.ctx.writeFile = (p, text) => { written.set(posix(p), text); original(p, text); };
  h.ctx.copyFile = (from, to) => copied.push([posix(from), posix(to)]);
  h.ctx.openFile = (file) => opened.push(posix(file));
  h.ctx.pluginRoot = '/plugin';
  h.ctx.sharedDir = '/home/.huddle';
  h.ctx.now = fakeNow('2026-11-21T12:00:00Z');
  h.ctx.fetch = async (url) => { fetched.push(url); if (fail) throw new Error('offline'); return { ok: true, json: async () => FEED }; };
  h.ctx.collectUsage = async () => ROWS;
  h.ctx.readTeamUsage = async () => ({ team: [], people: {} });
  return { h, written, copied, opened, fetched, config };
}

for (const gitlab of [false, true]) {
  const name = gitlab ? 'gitlab' : 'github';

  test(`[${name}] dashboard writes the page and the three vendor scripts under .huddle/dashboard, then opens the page`, async () => {
    const { h, written, copied, opened } = mk({ gitlab });
    assert.equal(await run(['dashboard'], h.ctx), 0, h.errText());
    assert.ok(written.has('/repo/.huddle/dashboard/index.html'), [...written.keys()].join(', '));
    assert.deepEqual(copied, ['gsap.min.js', 'ScrollTrigger.min.js', 'lenis.min.js'].map((f) => [`/plugin/site/vendor/${f}`, `/repo/.huddle/dashboard/${f}`]));
    assert.deepEqual(opened, ['/repo/.huddle/dashboard/index.html']);
    assert.match(h.text(), /\.huddle[\\/]dashboard[\\/]index\.html/);
  });

  test(`[${name}] --no-open writes everything and opens nothing`, async () => {
    const { h, written, opened } = mk({ gitlab });
    assert.equal(await run(['dashboard', '--no-open'], h.ctx), 0, h.errText());
    assert.ok(written.has('/repo/.huddle/dashboard/index.html'));
    assert.deepEqual(opened, []);
  });

  test(`[${name}] the page has the cost per Issue and per effort point, and the pace from the canned Issues and PRs`, async () => {
    const { h, written } = mk({ gitlab });
    await run(['dashboard', '--no-open'], h.ctx);
    const html = written.get('/repo/.huddle/dashboard/index.html');
    assert.ok(html.includes('$4.50'), 'the API cost of the canned rows: 1M input and 100K output');
    assert.ok(html.includes('$1.50'), 'per effort point: Issue #10 has effort 3');
    assert.match(html, /#10/);
    assert.match(html, /6 h/, 'in progress to merge: the first commit at 04:00, the merge at 10:00');
    assert.match(html, /Review rounds/);
    assert.match(html, /#50/, 'an Issue in progress is in «Who does what now»');
    assert.doesNotMatch(html, /https?:\/\//);
  });

  test(`[${name}] with no way to get API prices the page is still written and says «no price»`, async () => {
    const { h, written } = mk({ gitlab, fail: true });
    assert.equal(await run(['dashboard', '--no-open'], h.ctx), 0, h.errText());
    assert.match(written.get('/repo/.huddle/dashboard/index.html'), /no price/);
  });
}

test('prices are the only thing fetched, and only through ctx.fetch', async () => {
  const { h, fetched } = mk();
  await run(['dashboard', '--no-open'], h.ctx);
  assert.ok(fetched.length >= 1 && fetched.every((u) => /openrouter\.ai|githubusercontent/.test(u)), fetched.join(', '));
});

test('the team rows of the huddle-usage branch are in the page, and mine replace the days I have locally', async () => {
  const { h, written } = mk();
  h.ctx.readTeamUsage = async () => ({ team: [], people: { luis: [{ day: '2026-11-19', tool: 'Codex', model: 'gpt-5', issue: 10, input: 7, output: 0, cacheRead: 0, cacheWrite: 0, reasoning: 0 }], SrProfessional: [{ day: '2026-11-20', tool: 'Claude Code', model: 'claude-sonnet-4-5', issue: 10, input: 999999999, output: 0, cacheRead: 0, cacheWrite: 0, reasoning: 0 }] } });
  await run(['dashboard', '--no-open'], h.ctx);
  const html = written.get('/repo/.huddle/dashboard/index.html');
  assert.ok(html.includes('luis'));
  assert.ok(!html.includes('999.99M') && !html.includes('1000M'), 'the pushed row of a day I have locally is replaced, not added');
});

test('an unknown argument prints the usage and writes nothing', async () => {
  const { h, written } = mk();
  assert.equal(await run(['dashboard', '--bogus'], h.ctx), 2);
  assert.match(h.errText(), /dashboard \[--no-open\]/);
  assert.equal(written.size, 0);
});

test('the usage line of the CLI names the command', async () => {
  const { h } = mk();
  await run(['nope'], h.ctx);
  assert.match(h.errText(), /dashboard \[--no-open\]/);
});
