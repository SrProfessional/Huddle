// Issue #264: the dashboard shows the API cost only: no plan column, no plan figure, no verdict about plans.
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildModel } from '../../lib/dashboard/model.mjs';
import { renderPage } from '../../lib/dashboard/page.mjs';

const tokenRow = (tool, model, issue) => ({ day: '2026-11-20', tool, model, issue, input: 1000000, output: 0 });
const PLANS = { plans: [{ tool: 'codex', plan: 'plus', monthly_usd: 20 }, { tool: 'claude', plan: 'max5', monthly_usd: 100 }], personal: { codex: 'plus', claude: 'max5' } };
const page = ({ plans = PLANS, complete = true } = {}) => renderPage(buildModel({
  now: new Date('2026-11-21T12:00:00Z'), project: 'acme/app', me: 'ana', progress: { areas: [] },
  usage: { people: { ana: [tokenRow('Claude Code', 'claude-x', 10), tokenRow('Codex', 'gpt-5', 11)] } },
  prices: { source: 'fixture', date: '2026-11-21', models: { 'openai/gpt-5': { input: 0.00001812, output: 0 }, ...(complete ? { 'claude-x': { input: 0.000001, output: 0 } } : {}) } },
  plans, efforts: {}, merged: [],
}));
const text = (html) => html.replace(/<script[\s\S]*?<\/script>/g, '').replace(/<style[\s\S]*?<\/style>/g, '');

for (const [name, plans] of [['with plans set', PLANS], ['with no plans set', { plans: [], personal: {} }]]) {
  test(`the page has no plan text, figure or verdict ${name}`, () => {
    for (const complete of [true, false]) {
      const t = text(page({ plans, complete }));
      assert.doesNotMatch(t, /Paid in plans|plan not set|Plan not set|the plans cost|the plans and the API|Difference|savings|A shared plan|cost comparison/i);
      assert.doesNotMatch(t, /\$120\.00|\$20\.00/);
    }
  });
}

test('the model carries no plan figures', () => {
  const m = buildModel({ now: new Date('2026-11-21T12:00:00Z'), project: 'a/b', me: 'ana', progress: { areas: [] }, usage: { people: { ana: [tokenRow('Codex', 'gpt-5', 1)] } }, prices: null, plans: PLANS, efforts: {}, merged: [] });
  const r = m.ranges['30'];
  for (const key of ['paid', 'paidUnknown', 'paidPartial', 'difference']) assert.ok(!(key in r.summary), key);
  assert.ok(!('paid' in r.people[0]));
});

test('Would cost by API stays per person, tool, model and Issue, with partial when a price is missing', () => {
  const full = text(page());
  const tokens = full.match(/<section id="tokens"[^>]*>([\s\S]*?)<\/section>/)[1];
  for (const h of ['Each person', 'Each tool', 'Each model']) assert.ok(tokens.includes(h), h);
  assert.match(tokens, /Each person<\/h3><div class="table" style="--cols:3">/);
  assert.equal(tokens.match(/Would cost by API<\/span>/g).length, 9, "three tables in each of the three ranges");
  assert.match(full, /Cost per Issue/);
  const part = text(page({ complete: false }));
  assert.match(part, /partial/);
  assert.match(part, /No price for Claude Code: claude-x/);
  assert.match(part, /what these tokens would cost at API list prices/i);
});

test('Cost per Issue marks the cost and the cost per point as partial when the Issue has unpriced usage', () => {
  const html = renderPage(buildModel({
    now: new Date('2026-11-21T12:00:00Z'), project: 'acme/app', me: 'ana', progress: { areas: [] },
    usage: { people: { ana: [tokenRow('Claude Code', 'priced-model', 10), tokenRow('Codex', 'unpriced-model', 10), tokenRow('Codex', 'priced-model', 11)] } },
    prices: { source: 'fixture', date: '2026-11-21', models: { 'priced-model': { input: 0.00001, output: 0 } } },
    efforts: { 10: 2, 11: 1 }, merged: [],
  }));
  const perIssue = html.match(/<section id="per-issue"[^>]*>([\s\S]*?)<\/section>/)[1];
  const rows = (range) => [...range.matchAll(/<div class="trow"[^>]*>([\s\S]*?)<\/div>/g)].map((m) => m[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim());
  const row10 = rows(perIssue).find((r) => r.startsWith('#10'));
  const row11 = rows(perIssue).find((r) => r.startsWith('#11'));
  assert.match(row10, /\$10\.00 partial/);
  assert.match(row10, /\$5\.00 partial/);
  assert.doesNotMatch(row11, /partial/);
  assert.match(perIssue, /Would cost by API/);
  assert.doesNotMatch(perIssue, />API cost</);
  assert.match(perIssue, /Partial means some tokens have no API price/);
});
