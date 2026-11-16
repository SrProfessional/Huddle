// Issue #189: the Coach's session decides what has a clear best answer and keeps going, asking only about the product, money, secrets,
// security, deleting and production; and every session says Coach and Player, even where older text still has the old names.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { setup } from '../../lib/setup/index.mjs';

const read = (rel) => readFileSync(fileURLToPath(new URL(`../../${rel}`, import.meta.url)), 'utf8').replace(/\s+/g, ' ');

for (const f of ['templates/CLAUDE.huddle.md', 'CLAUDE.md']) {
  test(`${f}: «The Coach's session decides, and keeps going», with what it decides and what it still asks`, () => {
    const t = read(f);
    assert.match(t, /### The Coach's session decides, and keeps going/);
    const s = t.slice(t.indexOf("### The Coach's session decides"));
    for (const re of [/clear best answer is not asked/, /one line what it decided and why/, /limits and budgets/, /widening an Issue's allowed files/, /writing the follow-up Issues it proposed/, /technical «❓ Decision for the Coach»/]) assert.match(s, re, String(re));
    for (const re of [/what users see or do/, /priorities/, /money/, /secrets/, /security or privacy/, /deleting work or data/, /`\/huddle-release`/]) assert.match(s, re, String(re));
  });

  test(`${f}: the names line says Coach and Player, and what the old names mean`, () => {
    assert.match(read(f), /### Names .*«AI Manager» and «developer».*mean the Coach and the Player.*always write Coach and Player/i);
  });
}

test('/huddle-decide answers a technical question itself and asks only a product one', () => {
  const t = read('skills/huddle-decide/SKILL.md');
  assert.match(t, /technical question/i);
  assert.match(t, /without asking the Coach/);
  assert.match(t, /product question/i);
});

test('/huddle-watch answers a technical decision; a product one is only reported', () => {
  const t = read('skills/huddle-watch/SKILL.md');
  assert.match(t, /technical, answer it as `\/huddle-decide` does/);
  assert.match(t, /product question .*only reported|only reported.*product question/);
});

test('/huddle-review writes follow-up Issues right away; /huddle-issue waits for an OK only for the product', () => {
  assert.match(read('skills/huddle-review/SKILL.md'), /follow-up work .*write it as Issues right away/i);
  const issue = read('skills/huddle-issue/SKILL.md');
  assert.match(issue, /wait for the Coach's OK only when the Issue changes the product's design, behaviour or scope/);
});

test('huddle update notes the old names in the project\'s own CLAUDE.md text, and never counts the Huddle block or GitLab\'s role', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'huddle-names-'));
  try {
    const answers = { platform: 'github', project: 'acme/app', coach: 'boss' };
    setup(dir, answers);
    const claude = path.join(dir, 'CLAUDE.md');
    writeFileSync(claude, `# Shop\n\nOnly the AI Manager deploys.\nEach developer runs the tests.\nGitLab: invite with the role Developer.\n\n${readFileSync(claude, 'utf8')}`);
    const notes = setup(dir, {}).notes.join('\n');
    assert.match(notes, /CLAUDE\.md still says the old role names outside the Huddle block \(lines 3, 4\)/);
    assert.doesNotMatch(notes, /lines 3, 4, 5/);
    writeFileSync(claude, readFileSync(claude, 'utf8').replace('Only the AI Manager deploys.\nEach developer runs the tests.\n', ''));
    assert.doesNotMatch(setup(dir, {}).notes.join('\n'), /old role names/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('/huddle-update rewrites those lines in the same PR', () => {
  assert.match(read('skills/huddle-update/SKILL.md'), /old role names.*rewrite them in this same PR/);
});
