// Issue #272: a row with no tokens at all (Claude Code's `<synthetic>` model) is never unpriced and never makes a cost «partial».
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildModel, costOf } from '../../lib/dashboard/model.mjs';

const models = { 'claude-x': { input: 0.000001, output: 0 } };
const row = (model, input, extra = {}) => ({ day: '2026-11-20', tool: 'Claude Code', model, issue: 1, input, output: 0, ...extra });
const build = (rows) => buildModel({
  now: new Date('2026-11-21T12:00:00Z'), project: 'a/b', me: 'ana', progress: { areas: [] },
  usage: { people: { ana: rows } }, prices: { source: 'fixture', date: '2026-11-21', models }, plans: { plans: [], personal: {} }, efforts: {}, merged: [],
});

test('a zero-token row of any model is not unpriced', () => {
  for (const name of ['<synthetic>', 'some-unknown-model']) {
    const r = costOf([row(name, 0)], models);
    assert.equal(r.unpriced.size, 0, name);
  }
});

test('a zero-token <synthetic> row next to a priced model gives no partial and no unpriced name', () => {
  const s = build([row('claude-x', 1000), row('<synthetic>', 0, { cacheRead: 0, cacheWrite: 0 })]).ranges['30'].summary;
  assert.equal(s.apiPartial, false);
  assert.deepEqual(s.unpriced, []);
  const issue = build([row('claude-x', 1000), row('<synthetic>', 0)]).ranges['30'].perIssue.issues[0];
  assert.equal(issue.partial, false);
});

test('a model with tokens and no price is still partial and named', () => {
  const s = build([row('claude-x', 1000), row('mystery', 500)]).ranges['30'].summary;
  assert.equal(s.apiPartial, true);
  assert.deepEqual(s.unpriced, ['mystery']);
});

test('rendered page: the missing-price note names mystery alone and the zero-token model row costs $0.00', async () => {
  const { renderPage } = await import('../../lib/dashboard/page.mjs');
  const html = renderPage(build([row('claude-x', 1000), row('<synthetic>', 0), row('mystery', 500)]));
  const t = html.replace(/<script[\s\S]*?<\/script>/g, '').replace(/<style[\s\S]*?<\/style>/g, '');
  const note = t.match(/No price for ([^<]*?)\./)[1];
  assert.equal(note, 'Claude Code: mystery');
  const synthetic = t.match(/<div class="trow"[^>]*><span class="name">&lt;synthetic&gt; [\s\S]*?<\/div>/);
  assert.ok(synthetic, 'the <synthetic> model row is rendered');
  assert.match(synthetic[0], /\$0\.00/);
  assert.doesNotMatch(synthetic[0], /no price/);
});
