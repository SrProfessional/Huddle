// Issue #269: /huddle-test guides the Coach through testing each staged Issue, one by one, and marks it tested.
// The skill is what the session follows, so it is tested as text. No real GitHub or GitLab is called.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const read = (rel) => readFileSync(fileURLToPath(new URL(`../../${rel}`, import.meta.url)), 'utf8').replace(/\s+/g, ' ');
const skill = () => read('skills/huddle-test/SKILL.md');

test('the skill exists with its front matter and names the command in both forms', () => {
  const t = skill();
  assert.match(t, /^--- name: huddle-test description: .+? ---/);
  assert.match(t, /`\/huddle-test`/);
  assert.match(t, /`\$huddle-test`/);
});

test('the front matter is valid YAML: the description is one plain scalar with no «: » inside', () => {
  const raw = readFileSync(fileURLToPath(new URL('../../skills/huddle-test/SKILL.md', import.meta.url)), 'utf8');
  const fm = raw.match(/^---\r?\n([\s\S]*?)\r?\n---/)[1].split(/\r?\n/);
  assert.equal(fm.length, 2);
  for (const line of fm) {
    const m = line.match(/^(name|description): (.*)$/);
    assert.ok(m, line);
    assert.doesNotMatch(m[2], /: | #/, `a plain YAML scalar cannot hold «: » or « #»: ${m[2]}`);
    assert.doesNotMatch(m[2], /^[`'"\[{&*!|>%@]/);
  }
});

test('the skill is for the Coach only: huddle doctor first, one line and no change otherwise', () => {
  const t = skill();
  assert.match(t, /For the Coach only/);
  assert.match(t, /bin\/huddle" doctor/);
  assert.match(t, /`coach` login in `huddle\.json`/);
  assert.match(t, /stop with one clear line/);
  assert.match(t, /change nothing/);
});

test('it starts from huddle release --json and the Issues that are not tested', () => {
  const t = skill();
  assert.match(t, /bin\/huddle" release --json/);
  assert.match(t, /`tested: false`/);
  assert.match(t, /`\/huddle-release`/);
});

test('it states the order rule and shows the order with a reason each, which the Coach may change', () => {
  const t = skill();
  assert.match(t, /first what other Issues depend on/);
  assert.match(t, /what a person sees or touches/);
  assert.match(t, /before internal changes/);
  assert.match(t, /another tool or device/);
  assert.match(t, /only changes docs or tests goes last/);
  assert.match(t, /tested by its own tests/);
  assert.match(t, /one line of reason each/);
  assert.match(t, /the Coach may change it/);
});

test('it handles one Issue at a time, with steps that have «You should see:» and «If you see something else:»', () => {
  const t = skill();
  assert.match(t, /one at a time, never several together/);
  assert.match(t, /no technical background/);
  assert.match(t, /You should see:/);
  assert.match(t, /If you see something else:/);
  assert.match(t, /docs\/design\.md §13/);
  assert.match(t, /🙋 Only you/);
});

test('it builds the steps from the Issue and never invents a behaviour', () => {
  const t = skill();
  assert.match(t, /«How to test in staging» section/);
  assert.match(t, /«Tests that must pass»/);
  assert.match(t, /merged PR's description/);
  assert.match(t, /Never invent a behaviour the Issue does not state/);
  assert.match(t, /ask the Coach what to check/);
  assert.match(t, /run by the session/);
});

test('it marks an Issue tested only after a yes from the Coach in this chat, and handles failed, skip and stop', () => {
  const t = skill();
  assert.match(t, /«passed» \(run `node "\$\{CLAUDE_PLUGIN_ROOT\}\/bin\/huddle" tested <n>`/);
  assert.match(t, /«failed»/);
  assert.match(t, /`\/huddle-bug`/);
  assert.match(t, /do not mark it/);
  assert.match(t, /«skip»/);
  assert.match(t, /«stop»/);
  assert.match(t, /Never mark an Issue tested without a yes from the Coach in this chat/);
});

test('it ends with what is marked, failed and skipped, and points to /huddle-release', () => {
  const t = skill();
  assert.match(t, /what is marked, what failed and what was skipped/);
  assert.match(t, /`\/huddle-release` is next/);
});

test('it works in Codex too', () => {
  assert.match(skill(), /\*\*In OpenAI Codex\*\*/);
});

for (const [name, file] of [['GitHub', 'templates/github/ISSUE_TEMPLATE/task.md'], ['GitLab', 'templates/gitlab/issue_templates/Task.md']]) {
  test(`the ${name} Task template has the optional «How to test in staging» section`, () => {
    const t = read(file);
    assert.match(t, /## How to test in staging/);
    assert.match(t, /Optional/i);
    assert.match(t, /no technical background/);
    assert.match(t, /what they should see/);
    assert.ok(t.indexOf('## How to test in staging') > t.indexOf('## Prompt for Claude Code'));
    assert.ok(t.indexOf('## How to test in staging') < t.indexOf('## Allowed files'));
  });
}

test('huddle-issue asks for the section, and huddle-release points to /huddle-test', () => {
  assert.match(read('skills/huddle-issue/SKILL.md'), /\*\*How to test in staging:\*\*/);
  assert.match(read('skills/huddle-issue/SKILL.md'), /`\/huddle-test`/);
  const rel = read('skills/huddle-release/SKILL.md');
  assert.match(rel, /`\/huddle-test`/);
  assert.match(rel, /instead of asking Issue by Issue/);
  assert.match(rel, /even exactly one/); // a single untested Issue also gets the guided steps
  assert.match(rel, /--untested <n> --reason/); // the explicit untested-reason option stays
});

test('the docs say it: design §21, README, the team guide, in both forms, and the changelog under Unreleased', () => {
  const design = readFileSync(fileURLToPath(new URL('../../docs/design.md', import.meta.url)), 'utf8');
  const s21 = design.slice(design.indexOf('## 21.'), design.indexOf('## 22.'));
  assert.match(s21, /`\/huddle-test`/);
  assert.match(read('README.md'), /the `\/huddle-test` skill/);
  assert.match(read('README.md'), /\$huddle-test/);
  assert.match(read('docs/team-guide.md'), /the `\/huddle-test` skill/);
  assert.match(read('docs/team-guide.md'), /\$huddle-test/);
  const changelog = readFileSync(fileURLToPath(new URL('../../CHANGELOG.md', import.meta.url)), 'utf8');
  // «Unreleased» plus the section of the release that carries it (1.0.0): everything above 0.9.5.
  const unreleased = changelog.slice(changelog.indexOf('## [Unreleased]'), changelog.indexOf('## [0.9.5]'));
  assert.match(unreleased, /huddle-test/);
});
