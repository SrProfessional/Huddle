import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { run } from '../../lib/cli/run.mjs';
import { setup } from '../../lib/setup/index.mjs';

const read = (file) => readFileSync(new URL(`../../${file}`, import.meta.url), 'utf8').replaceAll('\r\n', '\n');
const block = (file) => read(file).match(/<!-- huddle:start v1 -->[\s\S]*?<!-- huddle:end -->/)[0];
const rule = /When only the person can go on,[\s\S]*?The Coach's session asks them with `\/huddle-steps`\./;

test('the managed block tells every session how to hand steps to the person', () => {
  const template = block('templates/CLAUDE.huddle.md');
  const instructions = template.match(rule)?.[0];
  assert.ok(instructions, 'the block has a rule for steps only the person can do');
  assert.match(instructions, /`huddle steps <n> --post <file>`/);
  assert.match(instructions, /one action per step/);
  assert.match(instructions, /never a command for the person to type/);
  assert.equal(block('CLAUDE.md'), template);
  assert.equal(block('AGENTS.md'), template);
});

test('update --check offers the block refresh even at the installed setup version', async (t) => {
  const root = mkdtempSync(path.join(tmpdir(), 'huddle-steps-block-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  setup(root, { platform: 'github', project: 'acme/app', ai_manager: 'coach', assignees: ['ana'], max_open_per_person: 2 });
  const files = ['CLAUDE.md', 'AGENTS.md'].map((name) => path.join(root, name));
  for (const file of files) {
    const old = readFileSync(file, 'utf8').replace(rule, '');
    writeFileSync(file, old);
  }
  const before = files.map((file) => readFileSync(file, 'utf8'));
  const output = [];
  assert.equal(await run(['update', '--check', '--json'], {
    root,
    out: (line) => output.push(line),
    err: (line) => assert.fail(line),
  }), 3);
  const report = JSON.parse(output.join('\n'));
  assert.equal(report.status, 'would-change');
  assert.equal(report.setupVersion, report.installed);
  assert.deepEqual([...report.changed].sort(), ['AGENTS.md', 'CLAUDE.md']);
  assert.deepEqual(files.map((file) => readFileSync(file, 'utf8')), before);
});
