// Issue #207: VS Code's Codex chat has no /hooks. The terminal Codex shares
// its configuration, so it is where a Player reviews and trusts Huddle's hook.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const read = (rel) => readFileSync(fileURLToPath(new URL(`../../${rel}`, import.meta.url)), 'utf8');
const flat = (text) => text.replace(/\s+/g, ' ');

test('Codex hook trust is done in terminal Codex, never through /hooks in the VS Code chat', () => {
  const readme = read('README.md');
  const guide = read('docs/team-guide.md');

  assert.doesNotMatch(readme, /type `\/hooks`/i);
  assert.doesNotMatch(guide, /Codex chat in the repo and type `\/hooks`/i);
  assert.match(flat(readme), /VS Code.*no `\/hooks`.*terminal Codex.*same configuration/i);
  assert.match(flat(guide), /Terminal → New Terminal/);
  assert.match(flat(guide), /\$codex = \(Get-ChildItem/);
  assert.match(flat(guide), /& \$codex --no-daemon/);
  assert.match(flat(guide), /Hooks need review/);
  assert.match(flat(guide), /Review hooks/);
  assert.match(flat(guide), /SessionStart/);
  assert.match(flat(guide), /Review 1/);
  assert.match(flat(guide), /node "\$\{CLAUDE_PLUGIN_ROOT\}\/bin\/huddle" hook/);
  assert.match(flat(guide), /plugin `huddle`/i);
  assert.match(flat(guide), /Active 1.*Review 0/);
  assert.match(flat(guide), /Esc.*\/exit/);
});

test('Codex update repeats terminal hook trust and the design records the live verification', () => {
  const guide = read('docs/team-guide.md');
  const design = read('docs/design.md');

  assert.match(flat(guide), /Updating Huddle in Codex:/);
  assert.match(flat(guide), /terminal Codex/);
  assert.match(flat(guide), /trust again/i);
  assert.match(flat(design), /terminal Codex/);
  assert.match(flat(design), /2026-11-20/);
  assert.match(flat(design), /codex exec.*no bypass/i);
  assert.match(flat(design), /model.*hook.*line/i);
  assert.match(flat(design), /test\/templates\/gitlab-job\.test\.mjs.*spawnSync sh ENOENT.*outside the sandbox.*pass/i);
});
