// Issue #147: setup and update say only what the person in front of them must do. Fakes only: files in temp folders.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { setup } from '../../lib/setup/index.mjs';
import { update } from '../../lib/setup/update.mjs';

const GH = { platform: 'github', project: 'acme/app', ai_manager: 'boss', assignees: ['ana'] };
const inTemp = (fn) => {
  const dir = mkdtempSync(path.join(tmpdir(), 'huddle-who-'));
  try { return fn(dir); } finally { rmSync(dir, { recursive: true, force: true }); }
};
const LABELS_NOTE = /Run `node "\$\{CLAUDE_PLUGIN_ROOT\}\/bin\/huddle" labels` once/;
const INSTALL_NOTE = /Send every Player both install routes/;
const has = (notes, re) => notes.some((n) => re.test(n));

test('a first install writes both first-install notes', () => inTemp((dir) => {
  const r = setup(dir, GH);
  assert.ok(has(r.notes, LABELS_NOTE), 'labels note');
  assert.ok(has(r.notes, INSTALL_NOTE), 'install note');
}));

test('a refresh and huddle update on a set-up repo leave them out', () => inTemp((dir) => {
  setup(dir, GH);
  const again = setup(dir, {});
  assert.ok(!has(again.notes, LABELS_NOTE) && !has(again.notes, INSTALL_NOTE), 'refresh');
  const c = JSON.parse(readFileSync(path.join(dir, 'huddle.json'), 'utf8'));
  writeFileSync(path.join(dir, 'huddle.json'), JSON.stringify({ ...c, staging_branch: '', language: '', setup_version: '0.5.1' }));
  const up = update(dir);
  assert.equal(up.status, 'updated');
  assert.ok(!has(up.notes, LABELS_NOTE) && !has(up.notes, INSTALL_NOTE), 'update');
}));

const skill = (name) => readFileSync(fileURLToPath(new URL(`../../skills/${name}/SKILL.md`, import.meta.url)), 'utf8');

test('the setup skill stops for a Player on a project already set up, and changes nothing', () => {
  const t = skill('huddle-setup');
  assert.match(t, /already uses Huddle; its Coach is <login>/);
  assert.match(t, /bin\/huddle" doctor/);
  assert.match(t, /\/huddle-play <n>/);
  assert.match(t, /change nothing/i);
});

test('the setup skill looks at the remote default branch before a first install, and says to update the copy', () => {
  const t = skill('huddle-setup');
  assert.match(t, /git show origin\/HEAD:huddle\.json/);
  assert.match(t, /Update your copy first/);
});

test('the update skill\'s last step says where the files apply and that the plugin is per machine', () => {
  const t = skill('huddle-update');
  const last = t.slice(t.indexOf('## 6.'), t.indexOf('## Look before'));
  assert.match(last, /every branch once (this|the) PR\/MR is merged/);
  assert.match(last, /per machine, not per branch/);
});
