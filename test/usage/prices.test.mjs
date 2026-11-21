import test from 'node:test';
import assert from 'node:assert/strict';
import { loadPrices, noPrice, planTable, resolveModel } from '../../lib/usage/prices.mjs';

const NOW = new Date('2026-11-20T12:00:00.000Z');
const openRouter = { data: [{ id: 'anthropic/claude-sonnet-4.5', pricing: { prompt: '0.000003', completion: '0.000015', cache_read: '0.0000003', cache_write: '0.00000375' } }] };
const liteLlm = { 'gpt-5': { input_cost_per_token: 0.00000125, output_cost_per_token: 0.00001, cache_read_input_token_cost: 0.000000125, cache_creation_input_token_cost: 0.00000125 } };

function memory({ answers = [] } = {}) {
  const files = new Map();
  let at = 0;
  return {
    files,
    fetch: async () => {
      const answer = answers[at++];
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
  assert.equal(live.models['anthropic/claude-sonnet-4.5'].input, 0.000003);

  const fallback = memory({ answers: [new Error('offline'), liteLlm] });
  const fromLiteLlm = await loadPrices({ ...fallback, cachePath: 'prices.json', now: () => NOW });
  assert.equal(fromLiteLlm.source, 'litellm');
  assert.equal(fromLiteLlm.models['gpt-5'].cacheWrite, 0.00000125);

  const kept = memory({ answers: [new Error('offline'), new Error('offline')] });
  kept.files.set('prices.json', JSON.stringify(fromLiteLlm));
  const fromCache = await loadPrices({ ...kept, cachePath: 'prices.json', now: () => NOW });
  assert.equal(fromCache.source, 'litellm');
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
