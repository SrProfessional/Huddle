import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadPrices, LITELLM_URL, noPrice, OPENROUTER_URL, planTable, resolveModel } from '../../lib/usage/prices.mjs';

const NOW = new Date('2026-11-20T12:00:00.000Z');
const openRouter = { data: [{ id: 'anthropic/claude-sonnet-4.5', pricing: { prompt: '0.000003', completion: '0.000015', input_cache_read: '0.0000003', input_cache_write: '0.00000375' } }] };
const liteLlm = { 'gpt-5': { input_cost_per_token: 0.00000125, output_cost_per_token: 0.00001, cache_read_input_token_cost: 0.000000125, cache_creation_input_token_cost: 0.00000125 } };

function memory({ answers = [] } = {}) {
  const files = new Map();
  const calls = [];
  return {
    files,
    calls,
    fetch: async (url) => {
      const answer = answers[calls.length];
      calls.push(url);
      if (answer instanceof Error) throw answer;
      return { ok: true, json: async () => answer };
    },
    readFile: (file) => files.get(file) ?? null,
    writeFile: (file, text) => files.set(file, text),
  };
}

test('the feed chain uses OpenRouter, then LiteLLM, then the kept copy', async () => {
  const first = memory({ answers: [openRouter] });
  const live = await loadPrices({ ...first, cachePath: 'prices.json', now: () => NOW });
  assert.equal(live.source, 'openrouter');
  assert.deepEqual(live.models['anthropic/claude-sonnet-4.5'], {
    input: 0.000003, output: 0.000015, cacheRead: 0.0000003, cacheWrite: 0.00000375,
  });
  assert.deepEqual(first.calls, [OPENROUTER_URL]);

  const fallback = memory({ answers: [new Error('offline'), liteLlm] });
  const fromLiteLlm = await loadPrices({ ...fallback, cachePath: 'prices.json', now: () => NOW });
  assert.equal(fromLiteLlm.source, 'litellm');
  assert.equal(fromLiteLlm.models['gpt-5'].cacheWrite, 0.00000125);

  const kept = memory({ answers: [new Error('offline'), new Error('offline')] });
  const expired = { ...fromLiteLlm, date: '2026-11-18T12:00:00.000Z' };
  kept.files.set('prices.json', JSON.stringify(expired));
  const fromCache = await loadPrices({ ...kept, cachePath: 'prices.json', now: () => NOW });
  assert.deepEqual(fromCache, expired);
  assert.deepEqual(kept.calls, [OPENROUTER_URL, LITELLM_URL]);
});

test('ambiguous bare model names have no price unless an explicit alias or exact ID resolves them', () => {
  const models = {
    'vendor-a/shared': {}, 'vendor-b/shared': {},
    'vendor-a/gpt-5': {}, 'openai/gpt-5': {},
  };
  assert.equal(noPrice('shared', models), true);
  assert.equal(resolveModel('vendor-b/shared', models), 'vendor-b/shared');
  assert.equal(resolveModel('gpt-5', models), 'openai/gpt-5');
  assert.equal(resolveModel('shared', { ...models, shared: {} }), 'shared');
  assert.equal(resolveModel('shared', { 'vendor-a/shared': {} }), 'vendor-a/shared');
});

test('bundled per-seat rates distinguish monthly billing from annual equivalents', () => {
  const bundled = JSON.parse(readFileSync(new URL('../../lib/usage/plans.json', import.meta.url), 'utf8'));
  const team = planTable(bundled).plans.filter((plan) => plan.per_seat);
  assert.deepEqual(team.map((plan) => [plan.plan, plan.monthly_usd, plan.annual_monthly_equivalent_usd]), [
    ['team_standard', 25, 20],
    ['team_premium', 125, 100],
    ['business', 25, 20],
  ]);
});

test('model names map to feed names and an unknown model has no price', () => {
  const models = { 'anthropic/claude-sonnet-4.5': { input: 1 } };
  assert.equal(resolveModel('claude-sonnet-4-5', models), 'anthropic/claude-sonnet-4.5');
  assert.equal(noPrice('not-a-model', models), true);
});

test('plan overrides and a personal plan are reflected in the plan table', () => {
  const base = { dated: '2026-11-20', currency: 'USD', plans: [
    { tool: 'claude', plan: 'max5', monthly_usd: 100 },
    { tool: 'codex', plan: 'plus', monthly_usd: 20 },
    { tool: 'claude', plan: 'team_standard', monthly_usd: 30, per_seat: true },
  ] };
  const table = planTable(base, { claude: { team_standard: { monthly_usd: 24, seats: 6 } } }, { claude: 'max5', codex: 'plus' });
  assert.deepEqual(table.personal, { claude: 'max5', codex: 'plus' });
  assert.deepEqual(table.plans.find((p) => p.plan === 'team_standard'), { tool: 'claude', plan: 'team_standard', monthly_usd: 24, per_seat: true, seats: 6, monthly_total_usd: 144 });
});
