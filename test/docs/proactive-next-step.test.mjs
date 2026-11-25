import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (file) => readFileSync(new URL(`../../${file}`, import.meta.url), 'utf8').replaceAll('\r\n', '\n');
const managed = (file) => read(file).match(/<!-- huddle:start v1 -->[\s\S]*?<!-- huddle:end -->/)?.[0];
const words = (text) => text.replace(/\s+/g, ' ');
const block = managed('templates/CLAUDE.huddle.md');
const rule = words(block.split('### Follow through on the goal')[1]?.split('\n### ')[0] ?? '');
const skill = (name) => read(`skills/${name}/SKILL.md`);

test('the shared rule takes authorized steps, asks for decisions, and keeps suggestions within the goal', () => {
  assert.equal(managed('CLAUDE.md'), block);
  assert.equal(managed('AGENTS.md'), block);
  assert.match(rule, /Coach, Player, and Both/);
  assert.match(rule, /within the current goal and authorized, take it/);
  assert.match(rule, /explain what remains and ask one concrete question/);
  assert.match(rule, /recommended option and (?:one|at least one) alternative/);
  assert.match(rule, /outside the current request.*?as a suggestion/);
  assert.match(rule, /skip suggestions when the goal is complete/i);
});

test('a pending decision waits for an answer and can be recovered after interruption', () => {
  assert.match(rule, /blocking question tool.*?asynchronous selector/);
  assert.match(rule, /wait for an actual answer, explicit deferral, or interruption/);
  assert.match(rule, /keep the turn active.*?independent work/i);
  assert.match(rule, /numbered choices.*?present the selector again.*?resume/i);
  assert.match(rule, /elapsed time alone does not end the turn and never counts as approval/i);
  assert.match(rule, /huddle asked <n>/);
  assert.match(rule, /numbered list.*?Other: tell me what you prefer/);
});

test('release compares production with the published artifact and asks before release preparation', () => {
  const release = words(skill('huddle-release'));
  assert.match(release, /merge.*?only when the Coach says so in the same chat/i);
  assert.match(release, /confirmed production merge.*?published version/);
  assert.match(release, /release record.*?tag or commit/);
  assert.match(release, /Prepare the next version \(Recommended\).*?Defer publication/);
  assert.match(release, /preparation.*?does not authorize publication/);
  assert.match(release, /existing publication approvals.*?smoke test.*?platform permissions/);
});

for (const name of ['huddle-issue', 'huddle-bug']) {
  test(`${name} states a creator benefit and observable acceptance in the Goal`, () => {
    const authoring = words(skill(name));
    assert.match(authoring, /clarify (?:the|that) outcome before drafting/);
    assert.match(authoring, /\*\*Goal:\*\*.*?creator benefit.*?observable acceptance criterion/);
    assert.match(authoring, /indirect benefit.*?manual step|indirect benefit.*?safer decision/);
  });
}

test('README and design connect implementation, testing, and follow-through to creator decisions', () => {
  const goal = words(read('docs/design.md').split('## 1. Goal')[1].split('\n## 2.')[0]);
  for (const doc of [words(read('README.md')), goal]) {
    assert.match(doc, /creator.*?decisions.*?implementation, testing, and follow-through/);
  }
});
