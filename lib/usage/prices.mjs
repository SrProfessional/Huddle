// API and subscription prices used by `huddle prices` (docs/design.md §26).
// Prices are USD per token. They stay as supplied by the source: presentation can
// multiply them by a token count without rounding the underlying data first.

const DAY = 24 * 60 * 60 * 1000;
export const OPENROUTER_URL = 'https://openrouter.ai/api/v1/models';
export const LITELLM_URL = 'https://raw.githubusercontent.com/BerriAI/litellm/main/model_prices_and_context_window.json';

const aliases = {
  'claude-sonnet-4-5': 'anthropic/claude-sonnet-4.5',
  'claude-opus-4-5': 'anthropic/claude-opus-4.5',
  'claude-haiku-4-5': 'anthropic/claude-haiku-4.5',
  'claude-3-7-sonnet': 'anthropic/claude-3.7-sonnet',
  'gpt-5': 'openai/gpt-5',
  'gpt-5-codex': 'openai/gpt-5-codex',
};

const number = (value) => {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : null;
};

function row(pricing) {
  const input = number(pricing.prompt ?? pricing.input_cost_per_token);
  const output = number(pricing.completion ?? pricing.output_cost_per_token);
  if (input === null || output === null) return null;
  const cacheRead = number(pricing.input_cache_read ?? pricing.cache_read ?? pricing.cache_read_input_token_cost);
  const cacheWrite = number(pricing.input_cache_write ?? pricing.cache_write ?? pricing.cache_creation_input_token_cost);
  return { input, output, cacheRead: cacheRead ?? null, cacheWrite: cacheWrite ?? null };
}

export function openRouterModels(feed) {
  const models = {};
  for (const item of feed?.data ?? []) {
    const price = row(item?.pricing ?? {});
    if (item?.id && price) models[item.id] = price;
  }
  if (!Object.keys(models).length) throw new Error('OpenRouter returned no usable model prices');
  return models;
}

export function liteLlmModels(feed) {
  const models = {};
  for (const [id, pricing] of Object.entries(feed ?? {})) {
    const price = row(pricing ?? {});
    if (price) models[id] = price;
  }
  if (!Object.keys(models).length) throw new Error('LiteLLM returned no usable model prices');
  return models;
}

async function json(fetch, url) {
  const response = await fetch(url);
  if (!response?.ok) throw new Error(`request failed (${response?.status ?? 'no response'})`);
  return response.json();
}

function usableCache(value) {
  return value && typeof value === 'object' && typeof value.source === 'string' && typeof value.date === 'string' && value.models && typeof value.models === 'object';
}

/** Fetch fresh data once a day; an offline run always has the last valid copy. */
export async function loadPrices({ fetch, readFile, writeFile, cachePath, now = () => new Date() }) {
  let kept = null;
  try { kept = JSON.parse(readFile(cachePath) ?? 'null'); } catch { /* an invalid cache is never trusted */ }
  const current = now();
  const age = kept ? current.getTime() - new Date(kept.date).getTime() : Infinity;
  if (usableCache(kept) && Number.isFinite(age) && age >= 0 && age < DAY) return kept;

  const sources = [
    ['openrouter', OPENROUTER_URL, openRouterModels],
    ['litellm', LITELLM_URL, liteLlmModels],
  ];
  for (const [source, url, parser] of sources) {
    try {
      const models = parser(await json(fetch, url));
      const fresh = { source, date: current.toISOString(), models };
      writeFile(cachePath, JSON.stringify(fresh, null, 2));
      return fresh;
    } catch { /* the next source, then the retained copy, is deliberate */ }
  }
  if (usableCache(kept)) return kept;
  throw new Error('could not get API prices from OpenRouter or LiteLLM, and no kept copy is available');
}

/** Return the source ID for a tool name without ever guessing a price. */
export function resolveModel(name, models) {
  if (!name || !models) return null;
  if (Object.hasOwn(models, name)) return name;
  const wanted = String(name).toLowerCase();
  const ids = Object.keys(models);
  const exact = ids.filter((id) => id.toLowerCase() === wanted);
  if (exact.length === 1) return exact[0];
  const mapped = aliases[wanted];
  if (mapped && Object.hasOwn(models, mapped)) return mapped;
  const short = ids.filter((id) => id.split('/').at(-1).toLowerCase() === wanted);
  return short.length === 1 ? short[0] : null;
}

export const noPrice = (name, models) => resolveModel(name, models) === null;

function overridesFor(overrides) {
  const out = new Map();
  const walk = (value, path = []) => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return;
    if (Object.hasOwn(value, 'monthly_usd') || Object.hasOwn(value, 'price') || Object.hasOwn(value, 'seats')) {
      const [tool, ...rest] = path;
      if (tool && rest.length) out.set(`${tool}:${rest.join('_')}`, value);
      return;
    }
    for (const [key, child] of Object.entries(value)) walk(child, [...path, key]);
  };
  walk(overrides);
  return out;
}

/** Apply repository-negotiated plan prices and render the person's selected plans. */
export function planTable(base, overrides = {}, personal = {}) {
  const changed = overridesFor(overrides);
  const plans = (base?.plans ?? []).map((original) => {
    const override = changed.get(`${original.tool}:${original.plan}`) ?? {};
    const monthly_usd = number(override.monthly_usd ?? override.price) ?? original.monthly_usd;
    const seats = number(override.seats) ?? original.seats;
    const plan = { ...original, monthly_usd };
    if (seats !== undefined) {
      plan.seats = seats;
      plan.monthly_total_usd = monthly_usd * seats;
    }
    return plan;
  });
  return { dated: base?.dated ?? null, currency: base?.currency ?? 'USD', plans, personal: { ...personal } };
}
