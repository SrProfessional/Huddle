import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (file) => readFileSync(new URL(`../../${file}`, import.meta.url), 'utf8').replaceAll('\r\n', '\n');
const managed = (file) => read(file).match(/<!-- huddle:start v1 -->[\s\S]*?<!-- huddle:end -->/)?.[0];
const words = (text) => text.replace(/\s+/g, ' ');
const block = managed('templates/CLAUDE.huddle.md');
const section = (heading) => words(block.split(`### ${heading}\n`)[1]?.split('\n### ')[0] ?? '');
const rule = section('Follow through on the goal');
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

test('all Huddle questions use the shared selector order ahead of older skill fallbacks', () => {
  assert.match(rule, /every Huddle question/);
  assert.match(rule, /takes precedence over older skill instructions and session-start guidance.*?numbered list.*?wait/);
  assert.match(rule, /blocking question tool when available.*?otherwise, use a supported asynchronous selector.*?when neither selector can be used, present a numbered list/i);
  assert.match(rule, /numbered list.*?Other: tell me what you prefer/);
});

test('role selection uses the shared question rule and keeps role eligibility and the recorded ask', () => {
  const role = section('Session role');
  assert.match(role, /huddle role --json.*?choices allowed by the login and team configuration/);
  assert.match(role, /ask once in their language using the shared question rule above/);
  assert.match(role, /eligible choices \(Coach, Player, Both when both roles are available\)/);
  assert.match(role, /huddle role --asked.*?wait for the choice before beginning either Huddle workflow/);
  assert.doesNotMatch(role, /Otherwise use a short numbered list/);
});

test('a pending decision waits for an answer and can be recovered after interruption', () => {
  assert.match(rule, /wait for an actual answer, explicit deferral, or interruption/);
  assert.match(rule, /keep the turn active.*?independent work/i);
  assert.match(rule, /before waiting, if an abrupt interruption could lose.*?record the pending question.*?numbered choices in the chat/i);
  assert.match(rule, /on resumption, reopen the selector with the saved question and choices when supported/i);
  assert.match(rule, /elapsed time alone does not end the turn and never counts as approval/i);
  assert.match(rule, /outstanding decision state/);
  assert.match(rule, /huddle asked <n>/);
});

test('Codex keeps the active turn open after an asynchronous selector acknowledges the ask', () => {
  assert.match(rule, /before sending a final response.*?ask.*?in the same turn/i);
  assert.match(rule, /`request_user_input_async`.*?acknowledgement does not resolve the question/i);
  assert.match(rule, /interruptible wait.*?check for a reply and wait again/i);
  assert.match(rule, /send a final response only after an answer, explicit deferral, or interruption/i);
});

test('the Codex decision and watch skills use the asynchronous selector and wait before ending', () => {
  for (const name of ['huddle-decide', 'huddle-watch']) {
    const question = words(skill(name));
    assert.match(question, /otherwise use `request_user_input_async` when supported/i, name);
    assert.match(question, /follow the managed block's pending-question rule/i, name);
    assert.match(question, /after an explicit deferral or interruption.*?Pending decisions: #n, #m/i, name);
  }
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

test('release follow-through offers the actual next action when a candidate already exists', () => {
  const release = words(skill('huddle-release'));
  assert.match(release, /if a candidate already exists.*?remaining release decision/i);
  assert.match(release, /complete the next outstanding smoke check.*?authorization to publish/i);
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
