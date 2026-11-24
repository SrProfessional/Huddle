// Issue #321: every decision for the person is asked as a multiple choice with «Other», never as prose, and a pending one stays visible.
// The skills are what the session follows, so they are tested as text. No real GitHub or GitLab is called.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const raw = (rel) => readFileSync(fileURLToPath(new URL(`../../${rel}`, import.meta.url)), 'utf8');
const read = (rel) => raw(rel).replace(/\s+/g, ' ');
const NAMES = ['huddle-decide', 'huddle-watch', 'huddle-review', 'huddle-release', 'huddle-test'];
const skill = (n) => read(`skills/${n}/SKILL.md`);

for (const name of NAMES) {
  test(`${name}: a decision for the person is asked with AskUserQuestion, Codex's own tool, or a numbered list`, () => {
    const t = skill(name);
    assert.match(t, /`AskUserQuestion`/);
    assert.match(t, /up to 4 related questions in one call/);
    assert.match(t, /2 to 4 concrete options/);
    assert.match(t, /recommended one first and marked «\(Recommended\)»/);
    assert.match(t, /automatic «Other» stays/);
    assert.match(t, /never a yes\/no wrapped in prose/);
    assert.match(t, /`request_user_input`/);
    assert.match(t, /when the session has it/);
    assert.match(t, /numbered list/);
    assert.match(t, /Other: tell me what you prefer/);
  });

  test(`${name}: a pending decision stays visible, is asked again once per session, and an unanswered message ends with its list`, () => {
    const t = skill(name);
    assert.match(t, /`huddle queue`/);
    assert.match(t, /«Stalled» block of `huddle next`/);
    assert.match(t, /asks them again, once per session, before anything else/);
    assert.match(t, /Pending decisions: #n, #m/);
  });

  test(`${name}: stays within its line limit`, () => {
    assert.ok(raw(`skills/${name}/SKILL.md`).split('\n').length <= 90, 'keep it short');
  });
}

test('decide turns the newest «Decision for the Coach» into that question and keeps the option letters', () => {
  const t = skill('huddle-decide');
  assert.match(t, /newest «❓ Decision for the Coach:» comment/);
  assert.match(t, /keep the Player's option letters or numbers in the labels/);
  assert.match(t, /Player's recommendation/);
});

test('decide keeps its rule: a technical question is decided without asking, with one line saying what and why', () => {
  const t = skill('huddle-decide');
  assert.match(t, /A technical question \(.*?\) has a clear best answer: take it .*? without asking the Coach, and say in one line what you decided and why/);
  assert.match(t, /Only a product question/);
});

test('watch asks a waiting product decision at once, batched up to 4 per call, and answers it as /huddle-decide does', () => {
  const t = skill('huddle-watch');
  assert.match(t, /\*\*`decision`:\*\*.*asks it at once/);
  assert.match(t, /one question per waiting Issue, batched up to 4 per call/);
  assert.match(t, /reads the options from the Player's comment/);
  assert.match(t, /answers it as `\/huddle-decide` does/);
  assert.doesNotMatch(t, /once per Issue; add `#<issue>` to the keys\.\s*- \*\*`triage`/);
});

test('watch never answers a triage: it reports it and offers «triage now with /huddle-bug» or «later»', () => {
  const t = skill('huddle-watch');
  assert.match(t, /\*\*`triage`:\*\* never answered by the watch/);
  assert.match(t, /«triage now with \/huddle-bug»/);
  assert.match(t, /«later»/);
});

test('release, review and test name their own asks in the same form', () => {
  assert.match(skill('huddle-release'), /the OK and the word to merge are asked in this form/);
  assert.match(skill('huddle-review'), /## Asking the Coach .*When it must ask the Coach/);
  assert.match(skill('huddle-test'), /passed.*?failed.*?skip.*?stop/);
  assert.match(skill('huddle-test'), /as one question/);
});

test('design §19 says it, and the CHANGELOG lists it in 1.0.4 with Unreleased left empty', () => {
  const d = read('docs/design.md');
  const s19 = d.slice(d.indexOf('## 19. Watching what waits'), d.indexOf('## 20. The version notice'));
  assert.match(s19, /Issue #321/);
  assert.match(s19, /`AskUserQuestion`/);
  assert.match(s19, /`request_user_input`/);
  assert.match(s19, /numbered list/);
  assert.match(s19, /Pending decisions: #n/);
  assert.match(s19, /batched up to 4 per call/);
  assert.match(s19, /«Stalled» block of `huddle next`/);
  const c = raw('CHANGELOG.md');
  const unreleased = c.slice(c.indexOf('## [Unreleased]'), c.indexOf('## [1.0.4]'));
  assert.equal(unreleased.trim(), '## [Unreleased]');
  const v104 = c.slice(c.indexOf('## [1.0.4]'), c.indexOf('## [1.0.3]'));
  assert.match(v104, /Issue #321/);
});
