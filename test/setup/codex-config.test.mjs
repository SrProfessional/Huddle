// Issue #215: a set-up repo comes nearly ready in OpenAI Codex. Setup and update write `.codex/config.toml`, which declares the Huddle
// marketplace and enables the plugin in that repo (proven on codex-cli 0.171: a trusted project then needs one `codex plugin marketplace
// upgrade huddle`). `huddle doctor` and the session start say when Codex is on the machine but Huddle is not installed in it.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { setup } from '../../lib/setup/index.mjs';
import { run } from '../../lib/cli/run.mjs';
import { harness } from '../cli/harness.mjs';

const ANSWERS = { platform: 'github', project: 'acme/app', coach: 'boss', assignees: ['ana'], staging_branch: '', language: '' };
const inTemp = (fn) => { const dir = mkdtempSync(path.join(tmpdir(), 'huddle-codex-')); try { return fn(dir); } finally { rmSync(dir, { recursive: true, force: true }); } };
const codexFile = (dir) => path.join(dir, '.codex', 'config.toml');

test('setup writes .codex/config.toml with the Huddle marketplace and the plugin enabled', () => inTemp((dir) => {
  const r = setup(dir, ANSWERS);
  assert.ok(r.written.includes('.codex/config.toml'));
  const t = readFileSync(codexFile(dir), 'utf8');
  assert.match(t, /\[marketplaces\.huddle\]\nsource_type = "git"\nsource = "https:\/\/github\.com\/SrProfessional\/Huddle\.git"/);
  assert.match(t, /\[plugins\."huddle@huddle"\]\nenabled = true/);
}));

test('the project\'s own Codex config is kept, with the Huddle tables added once', () => inTemp((dir) => {
  mkdirSync(path.join(dir, '.codex'), { recursive: true });
  writeFileSync(codexFile(dir), 'model = "gpt-5.6-terra"\n');
  setup(dir, ANSWERS);
  setup(dir, {});
  const t = readFileSync(codexFile(dir), 'utf8');
  assert.ok(t.startsWith('model = "gpt-5.6-terra"\n'));
  assert.equal(t.split('[marketplaces.huddle]').length, 2, 'once');
  assert.equal(t.split('[plugins."huddle@huddle"]').length, 2, 'once');
}));

test('a hand-written huddle marketplace with another source is kept and reported', () => inTemp((dir) => {
  mkdirSync(path.join(dir, '.codex'), { recursive: true });
  const own = '[marketplaces.huddle]\nsource_type = "local"\nsource = "D:/my-huddle"\n';
  writeFileSync(codexFile(dir), own);
  const r = setup(dir, ANSWERS);
  assert.equal(readFileSync(codexFile(dir), 'utf8'), own);
  assert.ok(r.skipped.includes('.codex/config.toml'));
  assert.ok(r.notes.some((n) => /\.codex\/config\.toml/.test(n) && /another source/.test(n)));
}));

test('doctor says when Codex is on this machine but Huddle is not installed in it, with the one command', async () => {
  const h = harness();
  h.ctx.codexState = () => ({ codex: 'C:/x/codex.exe', installed: false });
  await run(['doctor'], h.ctx);
  assert.match(h.text(), /⚠ codex: Codex is on this machine but Huddle is not installed in it/);
  assert.match(h.text(), /codex plugin marketplace upgrade huddle/);
  const ok = harness();
  ok.ctx.codexState = () => ({ codex: 'C:/x/codex.exe', installed: true });
  await run(['doctor'], ok.ctx);
  assert.match(ok.text(), /✔ codex: Huddle is installed in Codex too/);
  const none = harness();
  none.ctx.codexState = () => ({ codex: null, installed: false });
  await run(['doctor'], none.ctx);
  assert.doesNotMatch(none.text(), /codex:/);
});

test('a Claude Code session start says it once per repo', async () => {
  const h = harness();
  Object.assign(h.ctx, { tool: 'claude', sharedDir: '/home/.huddle', updateCachePath: '/data/huddle-update.json', codexState: () => ({ codex: 'C:/x/codex.exe', installed: false }) });
  await run(['hook'], h.ctx);
  assert.match(h.text(), /Codex is on this machine but Huddle is not installed in it/);
  h.out.length = 0;
  await run(['hook'], h.ctx);
  assert.doesNotMatch(h.text(), /Codex is on this machine/);
});
