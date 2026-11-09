// Huddle: the smoke-test checklist covers what 0.2.0 and 0.3.0 added (Issues #40 and #48). It only reads files.
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

test('«Progress», «Team members» and «Areas» come before «Clean up», with checkboxes', () => {
  const order = ['## 9. Progress', '## 10. Team members', '## 11. Areas', '## 12. Clean up'].map((h) => smoke.indexOf(h));
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

test('a «Results 0.2.0» table stays next to the Results, and the CHANGELOG keeps the smoke test under 0.3.0', () => {
  assert.ok(smoke.includes('### Results 0.2.0'));
  const c = readFileSync(path.join(root, 'CHANGELOG.md'), 'utf8');
  assert.match(c.slice(c.indexOf('## [0.3.0]'), c.indexOf('## [0.2.0]')), /smoke test/i);
});

test('«Areas» covers list, the skill, set and its reuse, dry run, assign (open, closed, closed area, none), check and progress', () => {
  const t = section('11\. Areas').replace(/\s+/g, ' ');
  for (const needle of [
    'huddle areas list', 'No areas yet', '/huddle-areas', 'huddle areas set', 'huddle areas assign', 'huddle areas check',
    '--dry-run', 'Dry run: nothing was changed.', 'none', 'huddle progress', 'GitHub', 'GitLab',
  ]) assert.ok(t.includes(needle), `missing «${needle}»`);
  assert.match(t, /waits? for (the|your) OK/i);
  assert.match(t, /another case of the title/i);
  assert.match(t, /no second milestone/i);
  assert.match(t, /rest of (its|the) description/i);
  assert.match(t, /\*\*closed\*\* (Issue|area)/);
  assert.match(t, /closed area/i);
  assert.match(t, /no area/i);
  assert.match(t, /missing|no .Huddle remaining/i);
  assert.ok(smoke.includes('0.3.0'), 'the version under test must say 0.3.0');
});

test('«Areas» has a doctor check for `gh` / `glab` off the PATH', () => {
  const t = section('11\. Areas').replace(/\s+/g, ' ');
  assert.match(t, /huddle doctor/);
  assert.match(t, /not installed or not on the PATH/);
  assert.match(t, /install command/i);
});

test('a «Results 0.3.0» table with GitHub and GitLab columns covers the new parts, and «Clean up» is 12', () => {
  assert.ok(smoke.includes('### Results 0.3.0'));
  const t = smoke.slice(smoke.indexOf('### Results 0.3.0'));
  assert.match(t, /\| Section \| GitHub \| GitLab \| Notes \|/);
  for (const row of ['11. Areas', 'huddle doctor', '12. Clean up']) assert.ok(t.includes(row), `missing row «${row}»`);
  assert.ok(!smoke.includes('11. Clean up'), '«Clean up» moved to 12');
});

test('the versions are 0.3.0 and the CHANGELOG has an empty «Unreleased» above «0.3.0»', () => {
  for (const f of ['package.json', '.claude-plugin/plugin.json']) assert.equal(JSON.parse(readFileSync(path.join(root, f), 'utf8')).version, '0.3.0', f);
  const m = JSON.parse(readFileSync(path.join(root, '.claude-plugin/marketplace.json'), 'utf8'));
  assert.ok(m.plugins.every((p) => p.version === '0.3.0'));
  const c = readFileSync(path.join(root, 'CHANGELOG.md'), 'utf8');
  assert.match(c, /## \[Unreleased\]\r?\n\r?\n## \[0\.3\.0\] - \d{4}-\d{2}-\d{2}/);
  assert.ok(c.indexOf('## [0.3.0]') < c.indexOf('## [0.2.0]'));
  assert.match(c.slice(c.indexOf('## [0.3.0]'), c.indexOf('## [0.2.0]')), /huddle-areas/);
});

test('«Areas» says to delete Alpha and Beta, and why closing is not enough', () => {
  const t = section('11\\. Areas').replace(/\s+/g, ' ');
  assert.ok(!/delete or close/i.test(t), 'closing is not enough');
  assert.match(t, /\*\*delete\*\* the Alpha and Beta milestones/);
  assert.match(t, /Milestones → Delete/);
  assert.match(t, /Delete milestone/);
  assert.match(t, /closed less than 90 days ago is still listed/);
  assert.match(t, /Alpha \(closed\)/);
});

test('«Areas» step 7 sets Docs to a remaining different from step 5, so the closed-area line shows', () => {
  const steps = section('11\\. Areas').split(/^(?=\d+\. \[ \])/m).filter((s) => /^\d+\. \[ \]/.test(s)).map((s) => s.replace(/\s+/g, ' '));
  const remaining = (s) => [...s.matchAll(/set "Docs" --remaining (\d+)/g)].map((m) => m[1]);
  const step5 = remaining(steps[4]);
  const step7 = remaining(steps[6]);
  assert.ok(step5.length && step7.length, 'both steps must run set "Docs"');
  assert.ok(step7.every((n) => !step5.includes(n)), `step 7 uses ${step7}, the same as step 5 (${step5}): it would print «Nothing to change»`);
  assert.match(steps[6], /the milestone is closed and stays closed/);
});

test('the CHANGELOG release header is dated 2026-11-09', () => {
  assert.ok(readFileSync(path.join(root, 'CHANGELOG.md'), 'utf8').includes('## [0.3.0] - 2026-11-09'));
});
