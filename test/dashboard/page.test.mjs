// Issue #232: the page builder from canned data: every section, formatted numbers, nothing from the network, the style of the mockup.
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildModel } from '../../lib/dashboard/model.mjs';
import { renderPage, fmtMoney, fmtTokens, STYLE_TOKENS } from '../../lib/dashboard/page.mjs';

const NOW = new Date('2026-11-21T12:00:00Z');
const MODELS = { 'anthropic/claude-sonnet-4.5': { input: 0.000003, output: 0.000015, cacheRead: 0.0000003, cacheWrite: 0.00000375 } };
const row = (over) => ({ day: '2026-11-20', tool: 'Claude Code', model: 'claude-sonnet-4-5', issue: 10, input: 2500000, output: 100000, cacheRead: 0, cacheWrite: 0, reasoning: 0, ...over });
const data = (over = {}) => ({
  now: NOW, project: 'acme/app', me: 'ana',
  usage: { people: { ana: [row({}), row({ issue: 11, input: 40000 })], luis: [row({ tool: 'Codex', model: 'mystery', issue: 12 })] } },
  prices: { source: 'openrouter', date: '2026-11-21T00:00:00Z', models: MODELS },
  plans: { plans: [{ tool: 'claude', plan: 'max5', monthly_usd: 100 }], personal: { claude: 'max5' } }, efforts: { 10: 2, 11: 1 },
  merged: [{ pr: 30, issues: [10], mergedAt: '2026-11-20T10:00:00Z', startedAt: '2026-11-20T04:00:00Z', rounds: 1 }],
  progress: { areas: [{ title: 'Core', merged: 3, total: 5, remaining: 1, percent: 50 }], total: { merged: 3, total: 5, remaining: 1, percent: 50 }, noArea: 0 },
  openIssues: [
    { number: 40, title: 'In flight <b>', labels: ['in progress'], assignees: ['ana'] },
    { number: 41, title: 'Asked', labels: ['changes requested from Coach'], assignees: ['luis'] },
  ],
  queue: [{ issue: 42, title: 'Needs a look', waits: 'review', pr: 77 }, { issue: 43, title: 'A question', waits: 'decision' }],
  heartbeats: { watch: { state: 'on', ageSeconds: 30, always: false }, waits: [{ issue: 40, state: 'on', ageSeconds: 10 }], player: { state: 'off' } },
  staged: { staging: 'staging', base: 'main', issues: [{ issue: 10, pr: 30, tested: true, by: 'ana', at: '2026-11-21T00:00:00Z' }, { issue: 11, pr: 31, tested: false }], warnings: [] },
  lastRelease: { number: 194, mergedAt: '2026-11-20T00:00:00Z', tag: 'v0.9.4' },
  ...over,
});
const page = (over) => renderPage(buildModel(data(over)));

test('every section is on the page, with the filter of 7 days, 30 days and all', () => {
  const html = page();
  for (const id of ['summary', 'progress', 'now', 'tokens', 'per-issue', 'pace', 'releases']) assert.match(html, new RegExp(`<section[^>]*id="${id}"`), id);
  for (const text of ['Issues closed', 'Team tokens', 'Would cost by API', 'Paid in plans', 'Difference', 'Progress by area', 'Who does what now', 'Tokens and cost', 'Cost per Issue', 'Pace', 'Releases']) assert.ok(html.includes(text), text);
  for (const key of ['7', '30', 'all']) assert.match(html, new RegExp(`data-range="${key}"`));
  assert.match(html, />7 days</);
  assert.match(html, />30 days</);
  assert.match(html, />All time</);
});

test('numbers are formatted: tokens compact, money with cents and thousands', () => {
  assert.equal(fmtTokens(2640000), '2.64M');
  assert.equal(fmtTokens(950), '950');
  assert.equal(fmtTokens(12500), '12.5K');
  assert.equal(fmtMoney(1234.5), '$1,234.50');
  assert.equal(fmtMoney(null), 'no price');
  const html = page();
  assert.ok(html.includes('$10.62'), 'the API cost of ana, shown with cents');
  assert.ok(html.includes('5.34M'), 'team tokens in 30 days');
});

test('the people, the tools and the models are listed; a model with no price says so', () => {
  const html = page();
  for (const x of ['ana', 'luis', 'Claude Code', 'Codex', 'claude-sonnet-4-5', 'mystery']) assert.ok(html.includes(x), x);
  assert.match(html, /no price/);
});

test('who does what now: in progress, review, decision, changes, the watch and the waits', () => {
  const html = page();
  for (const x of ['#40', 'In flight &lt;b&gt;', '#41', '#42', 'PR #77', '#43', 'Watch', 'Waiting']) assert.ok(html.includes(x), x);
  assert.ok(!html.includes('In flight <b>'), 'a title is escaped, never HTML');
});

test('releases: tested and not tested in staging, and the last release', () => {
  const html = page();
  assert.match(html, /1 of 2 tested/);
  assert.ok(html.includes('v0.9.4'));
  assert.ok(html.includes('#194'));
});

test('cost per Issue shows effort and cost per point, and pace shows the median time and the rounds', () => {
  const html = page();
  assert.match(html, /#10/);
  assert.match(html, /per point/i);
  assert.match(html, /6 h/);
  assert.match(html, /Review rounds/);
});

test('nothing comes from the network: no URL, no remote font, no remote script', () => {
  const html = page();
  assert.doesNotMatch(html, /https?:\/\//i);
  assert.doesNotMatch(html, /@import|url\(\s*['"]?(https?:)?\/\//i);
  for (const src of [...html.matchAll(/<script[^>]*\ssrc="([^"]+)"/g)].map((m) => m[1])) assert.match(src, /^(gsap|ScrollTrigger|lenis)\.min\.js$/, src);
  assert.doesNotMatch(html, /<link[^>]*href/i);
});

test('an empty project still renders every section, with no NaN or undefined', () => {
  const html = page({ usage: { people: {} }, merged: [], openIssues: [], queue: [], staged: null, lastRelease: null, prices: null, progress: { areas: [], total: { merged: 0, total: 0, remaining: 0, percent: null }, noArea: 0 } });
  for (const id of ['summary', 'progress', 'now', 'tokens', 'per-issue', 'pace', 'releases']) assert.match(html, new RegExp(`id="${id}"`));
  assert.doesNotMatch(html.replace(/<script[\s\S]*?<\/script>/g, '').replace(/<style[\s\S]*?<\/style>/g, ''), /NaN|undefined|null/);
});

test('the style of the approved mockup: dark only, its palette, 24 px cards, the three status colours', () => {
  const html = page();
  for (const c of ['#0F1117', '#1A1D26', '#1D2130', '#F2F4F8', '#A3A8B6', '#2F6BFF', '#4C8DFF', '#F5A524', '#F0476B', '#5FD068']) assert.ok(html.toUpperCase().includes(c), c);
  assert.match(html, /border-radius:\s*24px/);
  assert.match(html, /color-scheme:\s*dark/);
  assert.doesNotMatch(html, /prefers-color-scheme:\s*light/);
  assert.match(html, /<meta name="viewport"/);
  assert.match(html, /<title>[^<]{3,40}<\/title>/);
});

const lum = (hex) => { const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };

test('contrast: every text colour reads at 4.5:1 on every card and on the background', () => {
  for (const bg of [STYLE_TOKENS.bg, STYLE_TOKENS.card, STYLE_TOKENS.card2]) {
    for (const fg of [STYLE_TOKENS.text, STYLE_TOKENS.muted, STYLE_TOKENS.blueText, STYLE_TOKENS.orange, STYLE_TOKENS.pinkText, STYLE_TOKENS.green]) {
      assert.ok(ratio(fg, bg) >= 4.5, `${fg} on ${bg}: ${ratio(fg, bg).toFixed(2)}`);
    }
  }
});

test('the filter is its own small script, and the reduced-motion rule is in the style', () => {
  const html = page();
  assert.match(html, /data-filter/);
  assert.match(html, /prefers-reduced-motion:\s*reduce/);
});
