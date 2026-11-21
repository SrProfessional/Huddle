// Issue #232, changes requested by the Coach: mirrored review rounds, Codex tokens counted once, a comparison that says when it is partial,
// bars that keep their value after the tween, a Windows opener that never goes through cmd.exe, and a last release read from one record.
import test from 'node:test';
import assert from 'node:assert/strict';
import { run } from '../../lib/cli/run.mjs';
import { openFile } from '../../lib/cli/main.mjs';
import { readMerged, roundsOf } from '../../lib/dashboard/gather.mjs';
import { buildModel } from '../../lib/dashboard/model.mjs';
import { renderPage } from '../../lib/dashboard/page.mjs';
import { CONFIG, GITLAB_CONFIG, fakeNow, harness } from '../cli/harness.mjs';

const prompt = (text) => `## Prompt for Claude Code\n\n\`\`\`text\n${text}\n\`\`\``;
const coach = (id, text, createdAt) => ({ id, author: 'SrProfessional', body: prompt(text), createdAt });

// 1. Review rounds ---------------------------------------------------------------------------------------------------------------------

test('a request mirrored on the PR and on the Issue is one round; distinct rounds and a repeat on one target still count', () => {
  const mk = (id, text, at, author = 'SrProfessional') => ({ id, author, body: prompt(text), createdAt: at });
  const pr = [mk(1, 'Fix A', '2026-11-01T10:00:00Z'), mk(2, 'Fix B', '2026-11-02T10:00:00Z')];
  const issue = [mk(3, 'Fix A', '2026-11-01T10:00:01Z'), mk(4, 'Fix B', '2026-11-02T10:00:01Z')];
  assert.equal(roundsOf([pr, issue], 'SrProfessional', '2026-11-05T00:00:00Z'), 2, 'two rounds, each posted twice');
  assert.equal(roundsOf([[mk(5, 'Fix A', '2026-11-01T10:00:00Z'), mk(6, 'Fix A', '2026-11-03T10:00:00Z')], [mk(7, 'Fix A', '2026-11-01T10:00:01Z')]], 'SrProfessional', '2026-11-05T00:00:00Z'), 2, 'the same text asked again later is another round');
  assert.equal(roundsOf([pr], 'SrProfessional', '2026-11-01T12:00:00Z'), 1, 'a request after the merge is not a round before it');
  assert.equal(roundsOf([[mk(8, 'Fix A', '2026-11-01T10:00:00Z', 'ana')]], 'SrProfessional', '2026-11-05T00:00:00Z'), 0, 'only the Coach asks for changes');
  assert.equal(roundsOf([pr, issue], 'srprofessional', '2026-11-05T00:00:00Z'), 2, 'logins ignore case');
});

for (const gitlab of [false, true]) {
  test(`[${gitlab ? 'gitlab' : 'github'}] rounds read from the platform: the mirrored request is counted once, the distinct ones each count`, async () => {
    const config = { ...(gitlab ? GITLAB_CONFIG : CONFIG), staging_branch: 'staging' };
    const h = harness({
      gitlab, config,
      setup: (w) => {
        w.issue({ number: 10, body: '## Effort\n\n2\n', state: 'merged' });
        w.review({ number: 30, base: 'staging', body: 'Closes #10', merged: true, mergedAt: '2026-11-20T10:00:00Z', commits: ['2026-11-20T04:00:00Z'] });
        const onPr = (note) => (gitlab ? w.reviewComment(30, note) : w.comment(30, note));
        w.comment(10, coach(1, 'Round one', '2026-11-20T06:00:01Z'));
        onPr(coach(2, 'Round one', '2026-11-20T06:00:00Z'));
        w.comment(10, coach(3, 'Round two', '2026-11-20T08:00:01Z'));
        onPr(coach(4, 'Round two', '2026-11-20T08:00:00Z'));
      },
    });
    const adapter = await h.ctx.createPlatform(config);
    const [merged] = await readMerged({ adapter, config, base: 'staging' });
    assert.equal(merged.rounds, 2);
  });
}

// 2. Tokens ----------------------------------------------------------------------------------------------------------------------------

const NOW = new Date('2026-11-21T12:00:00Z');
const MODELS = { 'anthropic/claude-sonnet-4.5': { input: 0.000003, output: 0.000015, cacheRead: 0.0000003, cacheWrite: 0.00000375 }, 'openai/gpt-5': { input: 0.00000125, output: 0.00001, cacheRead: 0.000000125, cacheWrite: null } };
const row = (over) => ({ day: '2026-11-20', tool: 'Claude Code', model: 'claude-sonnet-4-5', issue: 10, input: 1000, output: 100, cacheRead: 0, cacheWrite: 0, reasoning: 0, ...over });
const model = (over = {}) => buildModel({
  now: NOW, project: 'acme/app', me: 'me', usage: { people: { me: [row({})] } }, prices: { source: 'openrouter', date: '2026-11-21T00:00:00Z', models: MODELS },
  plans: { plans: [{ tool: 'claude', plan: 'max5', monthly_usd: 100 }, { tool: 'codex', plan: 'plus', monthly_usd: 20 }], personal: { claude: 'max5', codex: 'plus' } }, efforts: {}, merged: [],
  progress: { areas: [], total: { merged: 0, total: 0, remaining: 0, percent: null }, noArea: 0 }, openIssues: [], queue: [], heartbeats: { watch: { state: 'off' }, waits: [], player: { state: 'off' } }, staged: null, lastRelease: null,
  ...over,
});

test('Codex input and output are counted once: 1,000 input with 400 cached and 10 output with 8 reasoning is 1,010 tokens', () => {
  const m = model({ usage: { people: { me: [row({ tool: 'Codex', model: 'gpt-5', input: 1000, cacheRead: 400, output: 10, reasoning: 8 })] } } });
  assert.equal(m.ranges['30'].summary.tokens, 1010);
  assert.equal(m.ranges['30'].people[0].tokens, 1010);
  assert.equal(m.ranges['30'].tools[0].tokens, 1010);
  assert.equal(m.ranges['30'].models[0].tokens, 1010);
  assert.equal(m.ranges['30'].perIssue.issues[0].tokens, 1010);
});

test('Claude keeps its cache reads and writes as tokens of their own', () => {
  const m = model({ usage: { people: { me: [row({ input: 10, output: 5, cacheRead: 100, cacheWrite: 20 })] } } });
  assert.equal(m.ranges['30'].summary.tokens, 135);
});

// 3. A partial comparison ---------------------------------------------------------------------------------------------------------------

const text = (html) => html.replace(/<script[\s\S]*?<\/script>/g, '').replace(/<style[\s\S]*?<\/style>/g, '');

test('priced usage with no plan set: $0 is not shown as paid and no verdict is given', () => {
  const m = model({ plans: { plans: [], personal: {} } });
  const s = m.ranges['30'].summary;
  assert.equal(s.paidPartial, true);
  assert.equal(s.difference, null);
  const html = text(renderPage(m));
  assert.doesNotMatch(html, /the plans cost less than the API|the plans cost more than the API/);
  assert.match(html, /plan not set/);
  assert.match(html, /not shown until every plan and every API price is known/);
});

test('a known subtotal is shown as partial when another person has no plan or a model has no price', () => {
  const m = model({ usage: { people: { me: [row({})], ana: [row({})] } } });
  assert.equal(m.ranges['30'].summary.paidPartial, true);
  assert.equal(m.ranges['30'].summary.difference, null);
  assert.match(text(renderPage(m)), /\$100\.00 partial/);
  const noPrice = model({ usage: { people: { me: [row({}), row({ model: 'mystery' })] } } });
  assert.equal(noPrice.ranges['30'].summary.apiPartial, true);
  assert.equal(noPrice.ranges['30'].summary.difference, null);
  assert.match(text(renderPage(noPrice)), /\$0\.0045 partial|\$0\.00 partial/);
});

test('with every price and every plan known the verdict is given', () => {
  const s = model().ranges['30'].summary;
  assert.equal(s.paidPartial, false);
  assert.equal(s.apiPartial, false);
  assert.equal(typeof s.difference, 'number');
  assert.match(text(renderPage(model())), /the plans cost more than the API/);
});

// 4. Bars keep their value --------------------------------------------------------------------------------------------------------------

test('a bar declares its value in a custom property that no tween touches, so clearing the tween styles keeps it', () => {
  const html = renderPage(model({ merged: [{ pr: 1, issues: [1, 2, 3], mergedAt: '2026-11-20T10:00:00Z', startedAt: null, rounds: 0 }, { pr: 2, issues: [4], mergedAt: '2026-11-19T10:00:00Z', startedAt: null, rounds: 0 }] }));
  assert.match(html, /\.fill\{[^}]*width:var\(--w/);
  assert.match(html, /\.column\{[^}]*height:var\(--h/);
  assert.doesNotMatch(html, /class="fill[^"]*"[^>]*style="width:/);
  assert.doesNotMatch(html, /class="column"[^>]*style="height:/);
  const bars = [...html.matchAll(/class="fill[^"]*" data-m="bar" data-w="(\d+)" style="--w:(\d+)%"/g)];
  assert.ok(bars.length >= 2);
  for (const [, w, v] of bars) assert.equal(w, v, 'the data value and the declared value agree');
  const columns = [...html.matchAll(/class="column" data-m="bar" data-h="(\d+)" style="--h:(\d+)%"/g)];
  assert.deepEqual([...new Set(columns.map((c) => c[2]))].sort((a, b) => a - b).filter((v) => v === '100' || v === '33'), ['33', '100'], 'two distinct chart values');
});

// 5. Opening the page --------------------------------------------------------------------------------------------------------------------

test('on Windows the path is one argument of explorer.exe, never text for cmd.exe: spaces and an ampersand stay as they are', () => {
  for (const file of ['C:\\Users\\Ana\\My Repos\\app\\.huddle\\dashboard\\index.html', 'C:\\work\\a & b\\app\\.huddle\\dashboard\\index.html', 'C:\\work\\a&calc\\.huddle\\dashboard\\index.html']) {
    const calls = [];
    openFile(file, 'win32', (command, args, options) => { calls.push({ command, args, options }); return { on() {}, unref() {} }; });
    assert.equal(calls.length, 1);
    assert.equal(calls[0].command, 'explorer.exe');
    assert.deepEqual(calls[0].args, [file]);
    assert.notEqual(calls[0].options.shell, true);
  }
});

test('macOS and Linux open the path with open and xdg-open, as one argument; a failing start never throws', () => {
  const seen = [];
  const start = (command, args) => { seen.push([command, args]); return { on() {}, unref() {} }; };
  openFile('/home/a b/&x/index.html', 'darwin', start);
  openFile('/home/a b/&x/index.html', 'linux', start);
  assert.deepEqual(seen, [['open', ['/home/a b/&x/index.html']], ['xdg-open', ['/home/a b/&x/index.html']]]);
  assert.doesNotThrow(() => openFile('/x', 'linux', () => { throw new Error('no program'); }));
});

// 6. The last release ---------------------------------------------------------------------------------------------------------------------

function release({ tagged }) {
  const config = { ...CONFIG, staging_branch: 'staging' };
  const h = harness({
    config,
    setup: (w) => {
      w.review({ number: 90, base: 'main', body: 'Release', merged: true, mergedAt: '2026-11-10T00:00:00Z' });
      w.review({ number: 91, base: 'main', body: 'A hotfix', merged: true, mergedAt: '2026-11-20T00:00:00Z' });
    },
  });
  const written = new Map();
  const original = h.ctx.writeFile;
  h.ctx.writeFile = (p, t) => { written.set(String(p).replaceAll('\\', '/'), t); original(p, t); };
  h.ctx.copyFile = () => {};
  h.ctx.pluginRoot = '/plugin';
  h.ctx.sharedDir = '/home/.huddle';
  h.ctx.now = fakeNow('2026-11-21T12:00:00Z');
  h.ctx.collectUsage = async () => [];
  h.ctx.readTeamUsage = async () => ({ team: [], people: {} });
  h.ctx.git = (args) => {
    const key = args.join(' ');
    if (tagged && key.startsWith('describe --tags')) return 'v0.9.4\n';
    if (tagged && key === 'rev-list -n 1 v0.9.4') return 'merge90\n';
    if (tagged && key === 'log -1 --format=%cI merge90') return '2026-11-09T12:00:00Z\n';
    throw new Error(`no git answer for ${key}`);
  };
  return { h, html: async () => { assert.equal(await run(['dashboard', '--no-open'], h.ctx), 0, h.errText()); return text(written.get('/repo/.huddle/dashboard/index.html')); } };
}

test('a tagged release followed by an ordinary merge: the release is the tag, its PR and its date; the later merge is not shown', async () => {
  const html = await release({ tagged: true }).html();
  const card = /Last release<\/h3>([\s\S]*?)<\/div>/.exec(html)[1];
  assert.match(card, /v0\.9\.4/);
  assert.match(card, /PR #90/);
  assert.match(card, /2026-11-09/);
  assert.doesNotMatch(card, /#91|2026-11-20/);
});

test('a repo without a release says so, and an ordinary merge is not called a release', async () => {
  const html = await release({ tagged: false }).html();
  const card = /Last release<\/h3>([\s\S]*?)<\/div>/.exec(html)[1];
  assert.match(card, /No release found/);
  assert.doesNotMatch(card, /#9\d/);
});
