import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveModel, noPrice } from '../../lib/usage/prices.mjs';

const p = { input: 1, output: 2, cacheRead: null, cacheWrite: null };
const models = {
  'anthropic/claude-opus-5.5': p,
  'anthropic/claude-sonnet-5.5': p,
  'anthropic/claude-opus-4.5': p,
  'anthropic/claude-sonnet-4.5': p,
  'anthropic/claude-haiku-4.5': p,
  'anthropic/claude-3.7-sonnet': p,
};

test('Claude Code names with dashes find the dotted OpenRouter id', () => {
  assert.equal(resolveModel('claude-opus-5-5', models), 'anthropic/claude-opus-5.5');
  assert.equal(resolveModel('claude-sonnet-5-5', models), 'anthropic/claude-sonnet-5.5');
});

test('a dated Claude name (compact or dashed date) finds its price', () => {
  assert.equal(resolveModel('claude-opus-5-5-20260101', models), 'anthropic/claude-opus-5.5');
  assert.equal(resolveModel('claude-sonnet-4-5-2025-09-29', models), 'anthropic/claude-sonnet-4.5');
});

test('the older aliases still resolve', () => {
  assert.equal(resolveModel('claude-opus-4-5', models), 'anthropic/claude-opus-4.5');
  assert.equal(resolveModel('claude-haiku-4-5', models), 'anthropic/claude-haiku-4.5');
  assert.equal(resolveModel('claude-3-7-sonnet', models), 'anthropic/claude-3.7-sonnet');
});

test('an unknown family or version has no price', () => {
  assert.ok(noPrice('claude-opus-9-9', models));
  assert.ok(noPrice('claude-haiku-5-5', models));
  assert.ok(noPrice('claude-mystery-5-5', models));
  assert.ok(noPrice('claude-opus-5-5-latest', models));
});
