// Issue #29: after setup, the AI Manager is told to send every developer the two install commands.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { setup } from '../../lib/setup/index.mjs';

const GH = { platform: 'github', project: 'acme/app', ai_manager: 'boss', assignees: ['ana'] };

test('the setup report tells the AI Manager to send every developer the two install commands', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'huddle-note-'));
  try {
    const { notes } = setup(root, GH);
    const note = notes.find((n) => /every developer/i.test(n));
    assert.ok(note, 'a note about every developer');
    assert.match(note, /claude plugin marketplace add SrProfessional\/Huddle/);
    assert.match(note, /claude plugin install huddle@huddle/);
    assert.match(note, /new session/i);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('huddle-setup SKILL.md says the same', () => {
  const t = readFileSync(fileURLToPath(new URL('../../skills/huddle-setup/SKILL.md', import.meta.url)), 'utf8');
  assert.match(t, /every developer/i);
  assert.match(t, /claude plugin marketplace add SrProfessional\/Huddle/);
  assert.match(t, /claude plugin install huddle@huddle/);
});
