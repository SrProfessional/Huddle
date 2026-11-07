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

test('the percentages written in «Progress» are the ones progressOf gives (steps 4, 8, 9 and 10)', async () => {
  const { progressOf } = await import('../../lib/core/progress.mjs');
  const issues = (merged, open) => [...Array(merged).fill({ open: false, merged: true }), ...Array(open).fill({ open: true, merged: false })];
  // Alpha: M merged, O open, H closed by hand and N not planned (both count in nothing). Beta: P open.
  const alpha = (extra = {}) => ({ title: 'Alpha', description: 'Huddle remaining: 2', issues: [...issues(1, 1), { open: false, merged: false }, { open: false, merged: false }], ...extra });
  const beta = (description) => ({ title: 'Beta', description, issues: issues(0, 1) });
  const run = (description) => progressOf({ milestones: [alpha(), beta(description)] });
  const step4 = run('Huddle remaining: 1');
  const step9 = run('Huddle remaining: 3');
  const step10 = run('Huddle remaining: four');

  const steps = section('9\\. Progress').split(/^(?=\d+\. \[ \])/m).filter((s) => /^\d+\. \[ \]/.test(s)).map((s) => s.replace(/\s+/g, ' '));
  const total = (text) => /\*\*Total (\d+)%\*\* \((\d+) ÷ (\d+)[:)]/.exec(text);
  const check = (text, result, what) => {
    const m = total(text);
    assert.ok(m, `${what}: no «**Total N%** (a ÷ b)»`);
    const t = result.total;
    assert.deepEqual([Number(m[1]), Number(m[2]), Number(m[3])], [t.percent, t.merged, t.total + t.remaining], what);
  };
  check(steps[3], step4, 'step 4');
  assert.deepEqual(step4.areas.map((a) => a.percent), [25, 0]);
  assert.ok(steps[3].includes('**25%** (1 ÷ 4)') && steps[3].includes('**0%**'), 'step 4: the area percentages');
  const line = (r) => `Progress: ${r.areas.map((a) => `${a.title} ${a.percent}%`).join(' · ')} · Total ${r.total.percent}%`;
  assert.ok(steps[7].includes(line(step4)), `step 8 must show «${line(step4)}»`);
  check(steps[8], step9, 'step 9');
  check(steps[9], step10, 'step 10');
});

test('«Progress» says «no area» counts X plus the Issues still open from earlier sections', () => {
  const t = section('9\\. Progress').replace(/\s+/g, ' ');
  assert.match(t, /X plus any Issue still open from the earlier sections/);
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
