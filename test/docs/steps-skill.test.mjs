// Issue #340 (part 2 of #338), docs/design.md §13, §19, §21: the skill /huddle-steps asks the steps of the person one at a time, the other skills
// write the list in the form of Issue #338, and the docs say it. The skills are what a session follows, so they are tested as text.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const path = (rel) => fileURLToPath(new URL(`../../${rel}`, import.meta.url));
const raw = (rel) => readFileSync(path(rel), 'utf8');
const read = (rel) => raw(rel).replace(/\s+/g, ' ');
const skill = () => read('skills/huddle-steps/SKILL.md');
const section = (text, from, to) => text.slice(text.indexOf(from), to ? text.indexOf(to) : undefined);

test('the skill exists with its front matter and names the command in both forms', () => {
  const t = skill();
  assert.match(t, /^--- name: huddle-steps description: Use when .+? ---/);
  assert.match(t, /`\/huddle-steps`/);
  assert.match(t, /`\$huddle-steps`/);
});

test('the front matter is valid YAML: the description is one plain scalar with no «: » inside', () => {
  const fm = raw('skills/huddle-steps/SKILL.md').match(/^---\r?\n([\s\S]*?)\r?\n---/)[1].split(/\r?\n/);
  assert.equal(fm.length, 2);
  for (const line of fm) {
    const m = line.match(/^(name|description): (.*)$/);
    assert.ok(m, line);
    assert.doesNotMatch(m[2], /: | #/, `a plain YAML scalar cannot hold «: » or « #»: ${m[2]}`);
    assert.doesNotMatch(m[2], /^[`'"\[{&*!|>%@]/);
  }
});

test('the skill is for the Coach only, and short', () => {
  const t = skill();
  assert.match(t, /For the Coach only/);
  assert.match(t, /bin\/huddle" doctor/);
  assert.match(t, /change nothing/);
  assert.ok(raw('skills/huddle-steps/SKILL.md').split('\n').length <= 90, 'keep it short');
});

test('it shows ONE step of ONE Issue with AskUserQuestion and the four options, in Codex request_user_input or a numbered list', () => {
  const t = skill();
  assert.match(t, /bin\/huddle" steps --json/);
  assert.match(t, /One step, of one Issue, never two at once/);
  assert.match(t, /`AskUserQuestion` tool, never as prose/);
  for (const option of [/\*\*Done\*\*/, /\*\*I could not do it\*\*/, /\*\*It failed \(I will tell you what I saw\)\*\*/, /\*\*Skip it\*\*/]) assert.match(t, option);
  assert.match(t, /recommended one first and marked «\(Recommended\)»/);
  assert.match(t, /`request_user_input`/);
  assert.match(t, /numbered list/);
  assert.match(t, /Other: tell me what you prefer/);
  assert.match(t, /«You should see:» its `see` and «If you see something else:» its `else`/);
});

test('«Skip it» says plainly that the Issue goes on without the step; a failed step never resumes it', () => {
  const t = skill();
  assert.match(t, /\*\*Skip it\*\*: the Issue goes on without that step/);
  assert.match(t, /A skipped last step puts the Issue back in play, as `huddle steps --skip` does; a failed one never does/);
});

test('it records the answer with huddle steps and never asks the person to type a command', () => {
  const t = skill();
  assert.match(t, /bin\/huddle" steps <n> --done/);
  assert.match(t, /steps <n> --failed --note/);
  assert.match(t, /steps <n> --skip --note/);
  assert.match(t, /never ask the person to type a command/);
  assert.match(t, /never with a command for the person to type/);
});

test('it goes to the next step of the same Issue, then the next Issue, and ends with what is closed, failed and skipped', () => {
  const t = skill();
  assert.match(t, /next step of the same Issue/);
  assert.match(t, /Then the next Issue/);
  assert.match(t, /what is closed, what failed, what was skipped, and the Issues that went back into play/);
});

test('a pending step stays in front of the person and holds only the dependent work, with the record of Issue #335', () => {
  const t = skill();
  assert.match(t, /bin\/huddle" asked <n>/);
  assert.match(t, /asked at <time>, still waiting/);
  assert.match(t, /`huddle queue`, in the «Stalled» block of `huddle next` and in `huddle status`/);
  assert.match(t, /holds only the work that depends on it/);
  assert.match(t, /independent reviews and merges/);
});

test('the watch asks a pending step once per turn and wake, and holds only the dependent work', () => {
  const t = read('skills/huddle-watch/SKILL.md');
  assert.match(t, /A step that waits for the person \(the `steps` key of `queue --json`/);
  assert.match(t, /once per turn and wake, one step of one Issue at a time as `\/huddle-steps` does, with «asked at <time>, still waiting»/);
  assert.match(t, /recorded with `huddle asked <n>`; it holds only what depends on it \(`holds`, `heldBy`\), and independent reviews and merges go on/);
});

test('/huddle-play and /huddle-issue say to write the steps in the form of Issue #338 and never hand a command to the person', () => {
  for (const name of ['huddle-play', 'huddle-issue']) {
    const t = read(`skills/${name}/SKILL.md`);
    assert.match(t, /never write it as free prose: write ONE comment with the list of steps in the form of Issue #338 \(`stepsBody` of/, name);
    assert.match(t, /never hand the person a command to type: you run it yourself after they confirm/, name);
    assert.match(t, /`\/huddle-steps` asks the steps one by one/, name);
  }
});

test('no skill grew past its line limit and the old rules of the touched sections are still there', () => {
  const limit = { 'huddle-play': 100, 'huddle-issue': 90, 'huddle-watch': 90, 'huddle-steps': 90 };
  for (const [name, max] of Object.entries(limit)) assert.ok(raw(`skills/${name}/SKILL.md`).split('\n').length <= max, name);
  const play = read('skills/huddle-play/SKILL.md');
  assert.match(play, /If a permission is denied or a credential is missing, stop and ask; never look for another way\./);
  const issue = read('skills/huddle-issue/SKILL.md');
  assert.match(issue, /If a permission is denied or a credential is missing, stop and ask; never look for another way\./);
  const watch = read('skills/huddle-watch/SKILL.md');
  assert.match(watch, /A message that asked and got no answer ends with one line «Pending decisions: #n, #m»/);
  assert.match(watch, /A waiting decision blocks only what depends on the answer \(Issue #335\)/);
});

test('the design (§13, §19, §21), the team guide and the changelog say it', () => {
  const design = read('docs/design.md');
  const s13 = section(design, '## 13. The session does every step it can', '## 14. Bugs');
  assert.match(s13, /`\/huddle-steps`/);
  assert.match(s13, /never hands the person a command/);
  const s19 = section(design, '## 19. Watching what waits for the Coach', '## 20. The version notice');
  assert.match(s19, /waits for you: step i of n of #N/);
  assert.match(s19, /huddle asked/);
  const s21 = section(design, '## 21. A staging branch', '## 22. The labels of one Issue');
  assert.match(s21, /`\/huddle-steps`/);
  assert.match(read('docs/team-guide.md'), /`\/huddle-steps`/);
  const log = read('CHANGELOG.md');
  const unreleased = section(log, '## [Unreleased]', '## [1.0.5]');
  assert.match(unreleased, /`\/huddle-steps`.*Issue #340/);
});
