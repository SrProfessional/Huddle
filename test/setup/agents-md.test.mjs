// Issue #200: OpenAI Codex reads AGENTS.md, not CLAUDE.md, so setup and update write the same managed Huddle block into both.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { setup } from '../../lib/setup/index.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const ANSWERS = { platform: 'github', project: 'acme/app', coach: 'boss', assignees: ['ana', 'luis'], max_open_per_person: 2 };
const inTemp = (fn) => {
  const dir = mkdtempSync(path.join(tmpdir(), 'huddle-agents-'));
  try { return fn(dir); } finally { rmSync(dir, { recursive: true, force: true }); }
};
const block = (text) => text.slice(text.indexOf('<!-- huddle:start'), text.indexOf('<!-- huddle:end -->'));
const read = (dir, f) => readFileSync(path.join(dir, f), 'utf8');

test('setup on a new repo writes AGENTS.md with the same block as CLAUDE.md', () => inTemp((dir) => {
  const r = setup(dir, ANSWERS);
  assert.ok(r.written.includes('AGENTS.md'));
  assert.equal(r.agentsMd, 'created');
  assert.ok(block(read(dir, 'AGENTS.md')).length > 1000);
  assert.equal(block(read(dir, 'AGENTS.md')), block(read(dir, 'CLAUDE.md')));
}));

test('a refresh swaps the block in AGENTS.md and keeps the project\'s own text outside the markers', () => inTemp((dir) => {
  setup(dir, ANSWERS);
  const own = '# Our Codex notes\n\nUse pnpm.\n\n';
  writeFileSync(path.join(dir, 'AGENTS.md'), own + read(dir, 'AGENTS.md').replace('Never work on', 'OLD TEXT'));
  const r = setup(dir, ANSWERS);
  assert.equal(r.agentsMd, 'updated');
  const text = read(dir, 'AGENTS.md');
  assert.ok(text.startsWith(own));
  assert.doesNotMatch(text, /OLD TEXT/);
}));

test('a repo with only CLAUDE.md: a dry run lists AGENTS.md as a change and writes nothing', () => inTemp((dir) => {
  setup(dir, ANSWERS);
  rmSync(path.join(dir, 'AGENTS.md'));
  const r = setup(dir, ANSWERS, { dryRun: true });
  assert.deepEqual(r.changed, ['AGENTS.md']);
  assert.throws(() => read(dir, 'AGENTS.md'));
}));

test('an AGENTS.md with half a marker is named in the error, and nothing is written', () => inTemp((dir) => {
  writeFileSync(path.join(dir, 'AGENTS.md'), '<!-- huddle:start v1 -->\nno end\n');
  assert.throws(() => setup(dir, ANSWERS), /AGENTS\.md has a Huddle marker/);
}));

test('the block fits well under Codex\'s 32 KiB limit for AGENTS.md files', () => {
  assert.ok(Buffer.byteLength(read(root, 'templates/CLAUDE.huddle.md')) < 16 * 1024);
});

test('the block speaks of the session, not only Claude Code, where a Player\'s session is meant', () => {
  const t = read(root, 'templates/CLAUDE.huddle.md');
  assert.match(t, /Claude Code or Codex/);
  assert.doesNotMatch(t, /^## Huddle: how this team works with Claude Code$/m);
});

test('the setup and update skills name AGENTS.md next to CLAUDE.md', () => {
  assert.match(read(root, 'skills/huddle-setup/SKILL.md'), /the block of `CLAUDE\.md` and of `AGENTS\.md`/);
  assert.match(read(root, 'skills/huddle-update/SKILL.md'), /`AGENTS\.md` \(`agentsMd`/);
});
