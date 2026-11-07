// Huddle: the smoke-test checklist covers what 0.2.0 added (Issue #40). It only reads files.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));
const smoke = readFileSync(path.join(root, 'docs/smoke-test.md'), 'utf8');
const section = (heading) => {
  const m = smoke.match(new RegExp(`^## ${heading}\\r?\\n([\\s\\S]*?)(?=^## |(?![\\s\\S]))`, 'm'));
  assert.ok(m, `no section «${heading}»`);
  return m[1];
};

test('«Progress» and «Team members» come before «Clean up», with checkboxes', () => {
  const order = ['## 9. Progress', '## 10. Team members', '## 11. Clean up'].map((h) => smoke.indexOf(h));
  assert.ok(order.every((i) => i >= 0), 'a section is missing');
  assert.deepEqual([...order].sort((a, b) => a - b), order);
  assert.match(section('9\\. Progress'), /^\d+\. \[ \]/m);
  assert.match(section('10\\. Team members'), /^\d+\. \[ \]/m);
});

test('«Progress» covers the formula, the Issue, the hook line and the 90 days', () => {
  const t = section('9\\. Progress');
  for (const needle of ['Huddle remaining:', 'not planned', 'huddle progress --json', 'Huddle progress', 'pinned', 'Progress: ', '90 days'])
    assert.ok(t.includes(needle), `missing «${needle}»`);
});

test('«Team members» covers team, add through a PR, doctor and remove', () => {
  const t = section('10\\. Team members');
  for (const needle of ['huddle team', '/huddle-team add', 'did not merge', '`team`', '/huddle-team remove', '✔', '✖'])
    assert.ok(t.includes(needle) || smoke.includes(needle), `missing «${needle}»`);
  assert.match(t, /not a collaborator/);
});

test('step 5.5 is run with a second account and «not testable» only without one', () => {
  const t = section('5\\. A review request taken by a waiting session');
  assert.match(t, /second account/);
  assert.match(t, /huddle pending/);
  assert.match(t, /only\*\* if there is no second account/);
});

test('a «Results 0.2.0» table sits next to the Results, and the CHANGELOG has it under «Unreleased»', () => {
  assert.ok(smoke.includes('### Results 0.2.0'));
  const c = readFileSync(path.join(root, 'CHANGELOG.md'), 'utf8');
  const unreleased = c.slice(c.indexOf('## [Unreleased]'), c.indexOf('## [0.2.0]'));
  assert.match(unreleased, /smoke test/i);
});
