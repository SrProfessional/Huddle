import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const BIN = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'bin', 'huddle');
// Folders without a huddle.json: the CLI stops before it could start gh or glab, so these never touch a network.
const empty = () => fs.mkdtempSync(path.join(os.tmpdir(), 'huddle-bin-'));
const huddle = (args, cwd) => spawnSync(process.execPath, [BIN, ...args], { cwd, encoding: 'utf8' });

test('bin/huddle hook in a repo without huddle.json is silent and exits 0', () => {
  const r = huddle(['hook'], empty());
  assert.equal(r.status, 0);
  assert.equal(r.stdout + r.stderr, '');
});
test('bin/huddle labels without huddle.json fails and names the file', () => {
  const r = huddle(['labels', '--dry-run'], empty());
  assert.equal(r.status, 1);
  assert.match(r.stderr, /huddle\.json not found/);
});
test('bin/huddle with no command prints usage', () => {
  const r = huddle([], empty());
  assert.equal(r.status, 2);
  assert.match(r.stderr, /Usage: huddle/);
});
test('package.json has the bin entry', () => {
  const pkg = JSON.parse(fs.readFileSync(path.resolve(path.dirname(BIN), '..', 'package.json'), 'utf8'));
  assert.equal(pkg.bin.huddle, 'bin/huddle');
});
