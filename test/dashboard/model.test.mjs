// Issue #232: the numbers of the dashboard, from canned rows and canned Issues and PRs. Pure: no network, no files.
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildModel, costOf, median, paceOf, paidInPlans, perIssue } from '../../lib/dashboard/model.mjs';

const MODELS = {
  'anthropic/claude-sonnet-4.5': { input: 0.000003, output: 0.000015, cacheRead: 0.0000003, cacheWrite: 0.00000375 },
  'openai/gpt-5': { input: 0.00000125, output: 0.00001, cacheRead: 0.000000125, cacheWrite: null },
};
const row = (over) => ({ day: '2026-11-20', tool: 'Claude Code', model: 'claude-sonnet-4-5', issue: 10, input: 1000, output: 100, cacheRead: 0, cacheWrite: 0, reasoning: 0, ...over });

test('the API cost of a row is its tokens times the price of its model; an unknown model has no price and is named', () => {
  const { cost, unpriced } = costOf([row({}), row({ model: 'mystery-model', input: 5 })], MODELS);
  assert.equal(Number(cost.toFixed(6)), 0.0045); // 1000 × 3e-6 + 100 × 15e-6
  assert.deepEqual([...unpriced], ['mystery-model']);
});

test('Codex input already holds its cached tokens, so the cached ones are not charged twice; reasoning is part of the output', () => {
  const { cost } = costOf([row({ tool: 'Codex', model: 'gpt-5', input: 1000, cacheRead: 400, output: 10, reasoning: 8 })], MODELS);
  assert.equal(Number(cost.toFixed(9)), Number((600 * 0.00000125 + 400 * 0.000000125 + 10 * 0.00001).toFixed(9)));
});

test('cost per Issue and per effort point, sorted by cost; rows with no Issue are kept apart', () => {
  const rows = [row({ issue: 1, input: 1000000 }), row({ issue: 2, input: 3000000 }), row({ issue: 2, input: 1000000 }), row({ issue: 'no Issue', input: 500 }), row({ issue: 3, input: 10, model: 'mystery-model' })];
  const { issues, noIssue } = perIssue(rows, MODELS, { 1: 1, 2: 4 });
  assert.deepEqual(issues.map((i) => i.issue), [2, 1, 3]);
  assert.equal(issues[0].effort, 4);
  assert.equal(Number(issues[0].cost.toFixed(4)), 12.003);
  assert.equal(Number(issues[0].perPoint.toFixed(5)), Number((12.003 / 4).toFixed(5)));
  assert.equal(issues[1].perPoint, issues[1].cost, 'effort 1: the cost is the cost per point');
  assert.equal(issues[2].cost, null, 'an unknown model: no price');
  assert.equal(issues[2].perPoint, null);
  assert.equal(noIssue.tokens, 600);
});

test('an Issue with no known effort has no cost per point', () => {
  const { issues } = perIssue([row({ issue: 7 })], MODELS, {});
  assert.equal(issues[0].effort, null);
  assert.equal(issues[0].perPoint, null);
});

test('median of numbers: middle one, mean of the two middle ones, null for none', () => {
  assert.equal(median([5, 1, 3]), 3);
  assert.equal(median([4, 1, 2, 3]), 2.5);
  assert.equal(median([]), null);
});

const NOW = new Date('2026-11-21T12:00:00Z');
const MERGED = [
  { pr: 11, issues: [1], mergedAt: '2026-11-21T09:00:00Z', startedAt: '2026-11-21T03:00:00Z', rounds: 0 },
  { pr: 12, issues: [2, 3], mergedAt: '2026-11-20T18:00:00Z', startedAt: '2026-11-20T10:00:00Z', rounds: 2 },
  { pr: 13, issues: [4], mergedAt: '2026-11-20T08:00:00Z', startedAt: null, rounds: 1 },
  { pr: 14, issues: [5], mergedAt: '2026-10-01T08:00:00Z', startedAt: '2026-10-01T00:00:00Z', rounds: 4 },
];

test('pace: Issues closed per day, median hours from start to merge, review rounds per PR, from canned PRs', () => {
  const pace = paceOf({ merged: MERGED, now: NOW, days: 7 });
  assert.equal(pace.closed, 4, 'Issues 1, 2, 3 and 4; the PR of October is out of the range');
  assert.equal(pace.prs, 3);
  assert.equal(pace.series.length, 7);
  assert.deepEqual(pace.series.slice(-2).map((d) => [d.label, d.count]), [['2026-11-20', 3], ['2026-11-21', 1]]);
  assert.equal(pace.medianHours, 7, 'the PR of #1 took 6 h and the one of #2 and #3 8 h: the median is 7');
  assert.equal(pace.medianRounds, 1, 'rounds 0, 2 and 1');
  assert.equal(pace.rounds, 3);
  assert.equal(pace.perWeek, 4);
});

test('pace over all time is by week', () => {
  const pace = paceOf({ merged: MERGED, now: NOW, days: null });
  assert.equal(pace.closed, 5);
  assert.ok(pace.series.every((p) => /^\d{4}-\d{2}-\d{2}$/.test(p.label)));
  assert.equal(pace.series.reduce((n, p) => n + p.count, 0), 5);
  assert.ok(pace.series.length > 7 && pace.series.length < 20);
});

test('pace with nothing merged is empty, never NaN', () => {
  const pace = paceOf({ merged: [], now: NOW, days: 30 });
  assert.equal(pace.closed, 0);
  assert.equal(pace.medianHours, null);
  assert.equal(pace.medianRounds, null);
  assert.equal(pace.series.length, 30);
});

const PLANS = { plans: [
  { tool: 'claude', plan: 'max5', monthly_usd: 100 },
  { tool: 'claude', plan: 'team_standard', monthly_usd: 25, per_seat: true, seats: 3, monthly_total_usd: 75 },
  { tool: 'codex', plan: 'plus', monthly_usd: 20 },
  { tool: 'codex', plan: 'shared', monthly_usd: 60, seats: 3, monthly_total_usd: 180 },
], personal: { claude: 'max5', codex: 'plus' } };

test('paid in plans: my own plan, the shared Team plan for the others, split per seat, prorated to the days', () => {
  const people = { ana: [row({ tool: 'Claude Code' })], me: [row({ tool: 'Claude Code' }), row({ tool: 'Codex' })] };
  const plans = { ...PLANS, plans: PLANS.plans.filter((p) => p.plan !== 'shared') };
  const paid = paidInPlans({ people, plans, me: 'me', days: 30 });
  // me: max5 100 + plus 20; ana: no personal plan, the only Team plan with seats for Claude: 25 per seat
  assert.equal(paid.total, 145);
  assert.deepEqual(paid.unknown, []);
  assert.equal(paidInPlans({ people, plans, me: 'me', days: 15 }).total, 72.5);
});

test('a plan shared by several people costs each one its share; no plan known is named, not guessed', () => {
  const people = { ana: [row({ tool: 'Codex' })], luis: [row({ tool: 'Codex' })], me: [row({ tool: 'Claude Code' })] };
  const paid = paidInPlans({ people, plans: { plans: [{ tool: 'codex', plan: 'shared', monthly_usd: 60, seats: 3 }], personal: {} }, me: 'me', days: 30 });
  assert.equal(paid.total, 40, 'ana and luis: 60 ÷ 3 each');
  assert.deepEqual(paid.unknown, ['me: claude']);
});

test('the model has one block per range, and each range keeps only its days', () => {
  const m = buildModel({
    now: NOW, project: 'acme/app', me: 'me',
    usage: { people: { me: [row({ day: '2026-11-20', input: 1000000 }), row({ day: '2026-09-01', input: 2000000 })] } },
    prices: { source: 'openrouter', date: '2026-11-21T00:00:00Z', models: MODELS }, plans: PLANS, efforts: {},
    merged: MERGED, progress: { areas: [], total: { merged: 0, total: 0, remaining: 0, percent: null }, noArea: 0 },
    openIssues: [], queue: [], heartbeats: { watch: { state: 'off' }, waits: [], player: { state: 'off' } }, staged: null, lastRelease: null,
  });
  assert.deepEqual(Object.keys(m.ranges), ['7', '30', 'all']);
  assert.equal(m.ranges['7'].summary.tokens, 1000100);
  assert.equal(m.ranges['30'].summary.tokens, 1000100);
  assert.equal(m.ranges.all.summary.tokens, 3000200);
  assert.equal(Number(m.ranges['7'].summary.apiCost.toFixed(4)), 3.0015);
  assert.equal(m.ranges['7'].summary.closed, 4);
  assert.equal(m.ranges.all.summary.closed, 5);
});
