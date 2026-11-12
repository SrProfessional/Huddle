// Issue #96: a VS Code-only person installs and updates Huddle with /plugins; no text may leave them at a dead end.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { updateSteps, noticeText } from '../../lib/core/update.mjs';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { setup } from '../../lib/setup/index.mjs';
import { run } from '../../lib/cli/run.mjs';
import { harness } from '../cli/harness.mjs';

const LABELS = ['ready', 'assigned', 'in progress', 'in review', 'blocked', 'needs decision', 'changes requested from AI Manager'];

const read = (rel) => readFileSync(fileURLToPath(new URL(`../../${rel}`, import.meta.url)), 'utf8');
const DEAD_END = /has no `?\/plugin`?|no `?\/plugin`? command/i;

test('README, first-day, team guide and the setup skill name /plugins', () => {
  for (const file of ['README.md', 'docs/first-day.md', 'docs/team-guide.md', 'skills/huddle-setup/SKILL.md']) {
    assert.match(read(file), /\/plugins\b/, file);
  }
});

test('no guide says the VS Code extension «has no /plugin» as a dead end', () => {
  for (const file of ['README.md', 'docs/first-day.md', 'docs/team-guide.md', 'docs/smoke-test.md', 'skills/huddle-setup/SKILL.md']) {
    assert.doesNotMatch(read(file).replace(/\s+/g, ' '), DEAD_END, file);
  }
});

test('the install and update sections still keep the terminal commands, with the «Install for this project» advice', () => {
  for (const file of ['README.md', 'docs/first-day.md', 'docs/team-guide.md']) {
    const t = read(file).replace(/\s+/g, ' ');
    assert.match(t, /claude plugin install huddle@huddle/, file);
    assert.match(t, /Install for this project/, file);
  }
});

test('the update steps and the notice name /plugins for the VS Code extension, and keep the terminal commands', () => {
  const steps = updateSteps(false);
  assert.match(steps, /\/plugins/);
  assert.match(steps, /claude plugin update huddle@huddle --scope project/);
  const notice = noticeText({ latest: '9.9.9', installed: '0.1.0', clone: false });
  assert.match(notice, /\/plugins/);
  assert.match(notice, /claude plugin update huddle@huddle --scope project/);
});

test('the huddle setup install note names /plugins and keeps the terminal commands', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'huddle-vsc-'));
  try {
    const { notes } = setup(root, { platform: 'github', project: 'acme/app', ai_manager: 'boss', assignees: ['ana'] });
    const note = notes.find((n) => /every developer/i.test(n));
    assert.ok(note, 'the install note exists');
    assert.match(note, /\/plugins/);
    assert.match(note, /claude plugin marketplace add SrProfessional\/Huddle/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('the huddle doctor plugin line names /plugins and keeps the terminal commands', async () => {
  const h = harness({ wrap: (a) => ({ ...a, listLabels: async () => LABELS }) });
  h.ctx.pluginInstalled = false;
  await run(['doctor'], h.ctx);
  assert.match(h.text(), /⚠ plugin: .*\/plugins/);
  assert.match(h.text(), /claude plugin install huddle@huddle/);
});
