// Issue #335: the Coach's sessions ask every real question as a multiple choice, ask an unanswered one again, and block only what depends on it.
// The rule lives in the managed block (template, CLAUDE.md, AGENTS.md), which the block tests keep equal.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const read = (rel) => readFileSync(fileURLToPath(new URL(`../../${rel}`, import.meta.url)), 'utf8');
const flat = (rel) => read(rel).replace(/\s+/g, ' ');
const block = (text) => text.slice(text.indexOf('<!-- huddle:start'), text.indexOf('<!-- huddle:end -->'));

for (const f of ['templates/CLAUDE.huddle.md', 'CLAUDE.md', 'AGENTS.md']) {
  test(`${f}: the ask rule is in the block`, () => {
    const t = block(flat(f));
    assert.match(t, /### The Coach's session asks/);
    const s = t.slice(t.indexOf("### The Coach's session asks"));
    for (const re of [
      /`AskUserQuestion`/, /`request_user_input`/, /2 to 4 options/, /\(Recommended\)/, /«Other»/, /up to 4 related questions per call/,
      /numbered list ending «Other: tell me what you prefer»/, /never written as a paragraph in a status answer/, /is there anything to decide\?/,
      /decided and said in one line/,
    ]) assert.match(s, re, String(re));
  });

  test(`${f}: an unanswered question is asked again, and blocks only what depends on it`, () => {
    const t = block(flat(f));
    const s = t.slice(t.indexOf("### The Coach's session asks"), t.indexOf('### Names'));
    for (const re of [
      /asked <n> times, last at <time>/, /start of each Coach turn and each watch wake/, /once/, /asked at <time>, still waiting/, /`huddle asked <n>`/,
      /never answers a product question for the person/, /does not merge, answer or move forward the Issue that waits for it/, /`Depends on`/, /shares an allowed file/,
      /reviews and merges of independent work go on/,
    ]) assert.match(s, re, String(re));
  });
}

test('the block of the template, CLAUDE.md and AGENTS.md is the same text', () => {
  const t = block(read('templates/CLAUDE.huddle.md'));
  assert.equal(block(read('CLAUDE.md')), t);
  assert.equal(block(read('AGENTS.md')), t);
});

test('/huddle-decide and /huddle-watch ask again with «asked at», record it with `huddle asked`, and hold only what depends on the answer', () => {
  for (const f of ['skills/huddle-decide/SKILL.md', 'skills/huddle-watch/SKILL.md']) {
    const t = flat(f);
    assert.match(t, /`huddle asked <n>`/, f);
    assert.match(t, /asked at <time>, still waiting/, f);
    assert.match(t, /only what depends on/i, f);
  }
});

test('the CHANGELOG, the team guide and design §19 name the rule', () => {
  assert.match(read('CHANGELOG.md').split('## [Unreleased]')[1].split(/\n## \[/)[0], /huddle asked/);
  assert.match(flat('docs/team-guide.md'), /huddle asked/);
  const d = flat('docs/design.md');
  assert.match(d.slice(d.indexOf('## 19')), /huddle asked/);
});
