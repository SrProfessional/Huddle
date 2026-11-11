// Issue #79: /huddle-setup in a repo that already has a valid huddle.json asks nothing: it refreshes. The skill's text is what the session follows,
// so it is tested as text; the CLI contract the skill relies on is tested on the real setup().
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { setup } from '../../lib/setup/index.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const skill = readFileSync(path.join(root, 'skills', 'huddle-setup', 'SKILL.md'), 'utf8');
const inTemp = (fn) => {
  const dir = mkdtempSync(path.join(tmpdir(), 'huddle-refresh-'));
  try { return fn(dir); } finally { rmSync(dir, { recursive: true, force: true }); }
};
const ANSWERS = { platform: 'github', project: 'acme/app', ai_manager: 'boss', assignees: ['ana', 'luis'], max_open_per_person: 2 };

/** The text of the section that starts at the heading matching `re`, up to the next «## » heading. */
function section(re) {
  const start = skill.search(re);
  assert.ok(start >= 0, `the skill has a section matching ${re}`);
  const rest = skill.slice(start + 1);
  const next = rest.search(/^## /m);
  return skill.slice(start, next < 0 ? undefined : start + 1 + next);
}

test('the skill looks at huddle.json before it asks anything', () => {
  const look = skill.search(/^## Look at `huddle\.json` first/m);
  const ask = skill.search(/^## Ask/m);
  assert.ok(look >= 0, 'a «Look at huddle.json first» section exists');
  assert.ok(ask >= 0);
  assert.ok(look < ask, 'and it comes before the questions');
});

test('a valid huddle.json: ask nothing, run the CLI with no flags', () => {
  const look = section(/^## Look at `huddle\.json` first/m);
  assert.match(look, /valid/i);
  assert.match(look, /ask nothing|asks nothing|do not ask|never ask/i);
  assert.match(look, /no flags|without (any )?flags/i);
  assert.match(look, /lib\/setup\/cli\.mjs/);
});

test('a missing or invalid huddle.json: ask only for the fields the CLI names as missing', () => {
  const look = section(/^## Look at `huddle\.json` first/m);
  assert.match(look, /missing|invalid/i);
  assert.match(look, /only[^.]*(missing|names)/i);
  const ask = section(/^## Ask/m);
  assert.match(ask, /first install|only (for )?(the|what)/i, 'the questions say when they apply');
});

test('the report of a refresh says what changed and which templates were kept', () => {
  const look = section(/^## Look at `huddle\.json` first/m);
  assert.match(look, /block/i);
  assert.match(look, /template/i);
  assert.match(look, /kept|skipped/i);
});

test('a first install still asks the five questions', () => {
  const ask = section(/^## Ask/m);
  for (const word of ['Platform', 'Host', 'Project', 'AI Manager', 'Team']) assert.ok(ask.includes(word), `the questions still include ${word}`);
});

// The contract the skill relies on.

test('setup with no answers on a valid huddle.json refreshes the block and keeps every key of the file', () => inTemp((dir) => {
  setup(dir, ANSWERS);
  const file = path.join(dir, 'huddle.json');
  const before = JSON.parse(readFileSync(file, 'utf8'));
  writeFileSync(path.join(dir, 'CLAUDE.md'), readFileSync(path.join(dir, 'CLAUDE.md'), 'utf8').replace('Language', 'Idioma'));
  const report = setup(dir, {});
  assert.equal(report.claudeMd, 'updated');
  assert.deepEqual(JSON.parse(readFileSync(file, 'utf8')), before, 'huddle.json is the same');
  assert.match(readFileSync(path.join(dir, 'CLAUDE.md'), 'utf8'), /Language/, 'the block is the current one again');
}));

test('setup with no answers and no huddle.json fails and names every missing field', () => inTemp((dir) => {
  assert.throws(() => setup(dir, {}), (e) => ['platform', 'project', 'ai_manager'].every((f) => e.message.includes(`"${f}"`)));
}));

test('setup with only the missing answer completes a half-configured huddle.json', () => inTemp((dir) => {
  writeFileSync(path.join(dir, 'huddle.json'), JSON.stringify({ platform: 'github', project: 'acme/app' }));
  assert.throws(() => setup(dir, {}), /ai_manager/);
  setup(dir, { ai_manager: 'boss' });
  const config = JSON.parse(readFileSync(path.join(dir, 'huddle.json'), 'utf8'));
  assert.equal(config.ai_manager, 'boss');
  assert.equal(config.project, 'acme/app', 'what was there stays');
}));
