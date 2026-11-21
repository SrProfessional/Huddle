// Huddle: the numbers of the dashboard (docs/design.md §26, Issue #232). Pure: rows, prices, Issues and PRs go in, numbers come out.
// No network, no files, no clock but the `now` it is given, so the same data always gives the same page.
import { resolveModel } from '../usage/prices.mjs';

const DAY = 24 * 60 * 60 * 1000;
const HOUR = 60 * 60 * 1000;
export const RANGES = [{ key: '7', label: '7 days', days: 7 }, { key: '30', label: '30 days', days: 30 }, { key: 'all', label: 'All time', days: null }];

const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const isoDay = (ms) => new Date(ms).toISOString().slice(0, 10);
const startOfDay = (ms) => Date.parse(`${isoDay(ms)}T00:00:00Z`);

/** The middle value of `values`, the mean of the two middle ones when there is an even number, null when there are none. */
export function median(values) {
  const v = values.filter((x) => Number.isFinite(x)).sort((a, b) => a - b);
  if (!v.length) return null;
  const mid = Math.floor(v.length / 2);
  return v.length % 2 ? v[mid] : (v[mid - 1] + v[mid]) / 2;
}

const toolKey = (tool) => (/codex/i.test(String(tool)) ? 'codex' : 'claude');

/**
 * The tokens of a row, each counted once. Claude's cache reads and writes are tokens of their own. Codex reports its cached tokens inside `input`
 * and its reasoning tokens inside `output`, so neither is added again.
 */
export const tokensOf = (r) => (toolKey(r.tool) === 'codex' ? num(r.input) + num(r.output) + num(r.cacheWrite) : num(r.input) + num(r.output) + num(r.cacheRead) + num(r.cacheWrite) + num(r.reasoning));

/**
 * What one row would cost at API prices, or null when its model has no price. Codex counts its cached tokens inside `input`, so they are taken
 * out of it (they are charged at the cache rate); its reasoning tokens are part of `output`. A cache price the source does not list charges nothing.
 */
export function rowCost(row, models) {
  const id = resolveModel(row.model, models);
  const p = id ? models[id] : null;
  if (!p) return null;
  const cached = num(row.cacheRead);
  const input = toolKey(row.tool) === 'codex' ? Math.max(0, num(row.input) - cached) : num(row.input);
  return input * p.input + num(row.output) * p.output + cached * (p.cacheRead ?? 0) + num(row.cacheWrite) * (p.cacheWrite ?? 0);
}

/** { cost, priced, unpriced }: the sum of the rows that have a price, how many had one, and the names of the models that had none. */
export function costOf(rows, models) {
  let cost = 0;
  let priced = 0;
  const unpriced = new Set();
  for (const row of rows) {
    const c = rowCost(row, models);
    if (c === null) unpriced.add(row.model);
    else { cost += c; priced += 1; }
  }
  return { cost, priced, unpriced };
}

const costOrNull = (rows, models) => { const r = costOf(rows, models); return r.priced ? r.cost : null; };

/** Tokens and API cost per Issue, and per effort point, sorted by cost (an Issue with no price last). `efforts`: Issue number -> points. */
export function perIssue(rows, models, efforts = {}) {
  const groups = new Map();
  for (const row of rows) {
    const key = row.issue;
    groups.set(key, [...(groups.get(key) ?? []), row]);
  }
  const issues = [];
  let noIssue = { tokens: 0, cost: null, partial: false };
  for (const [issue, list] of groups) {
    const tokens = list.reduce((n, r) => n + tokensOf(r), 0);
    const costed = costOf(list, models);
    const cost = costed.priced ? costed.cost : null;
    // A model with no price counts nothing: the cost and the cost per point then cover the priced tokens only.
    const partial = costed.unpriced.size > 0;
    if (typeof issue !== 'number') { noIssue = { tokens, cost, partial }; continue; }
    const effort = Number(efforts[issue]) > 0 ? Number(efforts[issue]) : null;
    issues.push({ issue, tokens, cost, partial, unpriced: [...costed.unpriced], effort, perPoint: cost !== null && effort ? cost / effort : null });
  }
  issues.sort((a, b) => (b.cost ?? -1) - (a.cost ?? -1) || a.issue - b.issue);
  return { issues, noIssue };
}

const weekStart = (ms) => { const d = startOfDay(ms); const dow = (new Date(d).getUTCDay() + 6) % 7; return d - dow * DAY; };

/**
 * The pace of the team from the merged PRs/MRs: `merged` is [{ pr, issues, mergedAt, startedAt, rounds }] (startedAt: when the work began, null when
 * unknown). A range keeps the merges of its days. Issues closed per day (per week for all time), the median hours from start to merge, and the
 * review rounds (requests for changes before the merge) per PR/MR.
 */
export function paceOf({ merged, now, days }) {
  const end = now.getTime();
  const from = days ? startOfDay(end) - (days - 1) * DAY : -Infinity;
  const inRange = merged.filter((m) => Date.parse(m.mergedAt) >= from && Date.parse(m.mergedAt) <= end + DAY);
  const issues = new Set(inRange.flatMap((m) => m.issues));
  const closed = issues.size;
  const series = [];
  if (days) {
    const counts = new Map();
    for (const m of inRange) counts.set(isoDay(Date.parse(m.mergedAt)), (counts.get(isoDay(Date.parse(m.mergedAt))) ?? 0) + m.issues.length);
    for (let i = days - 1; i >= 0; i--) { const label = isoDay(startOfDay(end) - i * DAY); series.push({ label, count: counts.get(label) ?? 0 }); }
  } else if (inRange.length) {
    const first = weekStart(Math.min(...inRange.map((m) => Date.parse(m.mergedAt))));
    const counts = new Map();
    for (const m of inRange) counts.set(weekStart(Date.parse(m.mergedAt)), (counts.get(weekStart(Date.parse(m.mergedAt))) ?? 0) + m.issues.length);
    for (let w = first; w <= weekStart(end); w += 7 * DAY) series.push({ label: isoDay(w), count: counts.get(w) ?? 0 });
  }
  const hours = inRange.filter((m) => m.startedAt).map((m) => (Date.parse(m.mergedAt) - Date.parse(m.startedAt)) / HOUR).filter((h) => h >= 0);
  const rounds = inRange.map((m) => num(m.rounds));
  const span = days ?? Math.max(1, Math.round((end - Math.min(...inRange.map((m) => Date.parse(m.mergedAt)), end)) / DAY) + 1);
  return {
    closed, prs: inRange.length, series, medianHours: median(hours), medianRounds: median(rounds), rounds: rounds.reduce((a, b) => a + b, 0),
    perWeek: inRange.length ? Math.round(((closed * 7) / span) * 10) / 10 : 0,
  };
}

const sum = (list, f) => list.reduce((n, x) => n + f(x), 0);

function groupBy(rows, key) {
  const out = new Map();
  for (const row of rows) out.set(key(row), [...(out.get(key(row)) ?? []), row]);
  return out;
}

function rangeBlock(range, { now, usage, prices, efforts, merged }) {
  const since = range.days ? isoDay(startOfDay(now.getTime()) - (range.days - 1) * DAY) : '0000-00-00';
  const people = Object.fromEntries(Object.entries(usage.people ?? {}).map(([login, rows]) => [login, rows.filter((r) => r.day >= since)]).filter(([, rows]) => rows.length));
  const rows = Object.values(people).flat();
  const models = prices?.models ?? null;
  const priced = costOf(rows, models);
  const earliest = rows.length ? rows.map((r) => r.day).sort()[0] : null;
  const days = range.days ?? (earliest ? Math.max(1, Math.round((startOfDay(now.getTime()) - Date.parse(`${earliest}T00:00:00Z`)) / DAY) + 1) : 1);
  const apiCost = priced.priced ? priced.cost : null;
  const pace = paceOf({ merged, now, days: range.days });
  const byPerson = Object.entries(people).map(([login, list]) => ({ login, tokens: sum(list, tokensOf), cost: costOrNull(list, models) })).sort((a, b) => b.tokens - a.tokens || a.login.localeCompare(b.login));
  const byTool = [...groupBy(rows, (r) => r.tool)].map(([name, list]) => ({ name, tokens: sum(list, tokensOf), cost: costOrNull(list, models) })).sort((a, b) => b.tokens - a.tokens);
  const byModel = [...groupBy(rows, (r) => `${r.tool}\0${r.model}`)].map(([, list]) => ({ name: list[0].model, tool: list[0].tool, tokens: sum(list, tokensOf), cost: costOrNull(list, models) })).sort((a, b) => b.tokens - a.tokens);
  return {
    key: range.key, label: range.label, days,
    summary: {
      closed: pace.closed, tokens: sum(rows, tokensOf), apiCost, unpriced: [...priced.unpriced],
      // With a model that has no price, only the priced tokens are costed and the figure says «partial».
      apiPartial: priced.unpriced.size > 0,
    },
    people: byPerson, tools: byTool, models: byModel,
    perIssue: perIssue(rows, models, efforts), pace,
  };
}

/**
 * Everything the page shows. `usage.people`: login -> rows of `huddle usage`; `prices`: { source, date, models } or null; (the page shows the API cost only, never plans);
 * `merged`: the merged PRs/MRs with their start and rounds; `openIssues` carry core label names; `queue`: `huddle queue`; `heartbeats`: `huddle status`.
 */
export function buildModel(input) {
  const { now, project, me, progress, openIssues = [], queue = [], heartbeats, staged, lastRelease, prices } = input;
  const withLabel = (label) => openIssues.filter((i) => i.labels.includes(label)).map((i) => ({ number: i.number, title: i.title, assignees: i.assignees ?? [] }));
  const waits = (kind) => queue.filter((q) => q.waits === kind).map((q) => ({ number: q.issue, title: q.title, pr: q.pr ?? null }));
  const decisionNumbers = new Set(waits('decision').map((q) => q.number));
  const decision = [...waits('decision'), ...withLabel('needs decision').filter((i) => !decisionNumbers.has(i.number))].sort((a, b) => a.number - b.number);
  const releases = staged
    ? { staging: staged.staging, base: staged.base, issues: staged.issues, tested: staged.issues.filter((i) => i.tested).length, total: staged.issues.length, warnings: staged.warnings ?? [], last: lastRelease ?? null }
    : { staging: null, base: null, issues: [], tested: 0, total: 0, warnings: [], last: lastRelease ?? null };
  return {
    project, me, generatedAt: now.toISOString(), prices: prices ? { source: prices.source, date: prices.date } : null,
    ranges: Object.fromEntries(RANGES.map((r) => [r.key, rangeBlock(r, input)])),
    progress,
    now: {
      working: withLabel('in progress'), changes: withLabel('changes requested from Coach'), review: waits('review'), decision, triage: waits('triage'),
      watch: heartbeats?.watch ?? { state: 'off' }, waits: heartbeats?.waits ?? [], player: heartbeats?.player ?? { state: 'off' },
    },
    releases,
  };
}
