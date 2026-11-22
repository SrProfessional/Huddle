// Issue #276: each kind of token is priced at its own list price; the totals are worked out by hand and written as literal numbers.
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildModel, costOf, rowCost } from '../../lib/dashboard/model.mjs';

// USD per token. Claude: 1 / 5 / 0.1 / 1.25 per million tokens. Codex (gpt-x): 2 / 8 / 0.5 per million, no cache-write price.
const models = {
  'anthropic/claude-opus-5.5': { input: 0.000001, output: 0.000005, cacheRead: 0.0000001, cacheWrite: 0.00000125 },
  'openai/gpt-x': { input: 0.000002, output: 0.000008, cacheRead: 0.0000005, cacheWrite: null },
};
const M = 1_000_000;
const claude = (extra) => ({ day: '2026-11-20', tool: 'Claude Code', model: 'claude-opus-5-5', issue: 1, input: 0, output: 0, cacheRead: 0, cacheWrite: 0, reasoning: 0, ...extra });
const codex = (extra) => ({ day: '2026-11-20', tool: 'Codex', model: 'gpt-x', issue: 1, input: 0, output: 0, cacheRead: 0, cacheWrite: 0, reasoning: 0, ...extra });
const close = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-9, `${actual} is not ${expected}`);

test('Claude: every kind of token is charged at its own price (1M tokens each)', () => {
  close(rowCost(claude({ input: M }), models), 1);
  close(rowCost(claude({ output: M }), models), 5);
  close(rowCost(claude({ cacheRead: M }), models), 0.1);
  close(rowCost(claude({ cacheWrite: M }), models), 1.25);
  close(rowCost(claude({ input: M, output: M, cacheRead: M, cacheWrite: M }), models), 7.35);
});

test('Claude: reasoning tokens are not charged again', () => {
  close(rowCost(claude({ output: M, reasoning: M }), models), 5);
});

test('Codex: cached tokens inside input are charged once, at the cache price', () => {
  close(rowCost(codex({ input: M }), models), 2);
  close(rowCost(codex({ output: M }), models), 8);
  // 1M input of which 400k cached: 600k * 2/M + 400k * 0.5/M = 1.2 + 0.2
  close(rowCost(codex({ input: M, cacheRead: 400_000 }), models), 1.4);
  // everything cached: nothing is left at the input price
  close(rowCost(codex({ input: M, cacheRead: M }), models), 0.5);
  // 1M output of which 300k are reasoning: still 1M at the output price
  close(rowCost(codex({ output: M, reasoning: 300_000 }), models), 8);
  // no cache-write price in the source: charges nothing
  close(rowCost(codex({ cacheWrite: M }), models), 0);
});

test('Claude and Codex rows add up in costOf', () => {
  const r = costOf([claude({ input: M, cacheRead: 2 * M }), codex({ input: M, cacheRead: 400_000 })], models);
  close(r.cost, 1 + 0.2 + 1.4);
  assert.equal(r.priced, 2);
  assert.equal(r.unpriced.size, 0);
});

test('the total of a range equals the sum of its models, people, tools and Issues', () => {
  const people = {
    ana: [claude({ input: M, output: M, issue: 1 }), claude({ cacheRead: 3 * M, cacheWrite: M, issue: 2 }), codex({ input: M, cacheRead: 400_000, issue: 1 })],
    bo: [claude({ cacheWrite: 2 * M, issue: 2 }), codex({ output: M, issue: 3 }), claude({ input: M, issue: null })],
  };
  const range = buildModel({
    now: new Date('2026-11-21T12:00:00Z'), project: 'a/b', me: 'ana', progress: { areas: [] },
    usage: { people }, prices: { source: 'fixture', date: '2026-11-21', models }, efforts: {}, merged: [],
  }).ranges.all;
  // Worked by hand: ana 6 + (0.3 + 1.25) + 1.4 = 8.95; bo 2.5 + 8 + 1 = 11.5; all 20.45.
  close(range.summary.apiCost, 20.45);
  const total = (list) => list.reduce((n, x) => n + x.cost, 0);
  close(total(range.people), 20.45);
  close(range.people.find((p) => p.login === 'ana').cost, 8.95);
  close(range.people.find((p) => p.login === 'bo').cost, 11.5);
  close(total(range.models), 20.45);
  close(total(range.tools), 20.45);
  close(total(range.perIssue.issues) + range.perIssue.noIssue.cost, 20.45);
  close(range.perIssue.noIssue.cost, 1);
});
