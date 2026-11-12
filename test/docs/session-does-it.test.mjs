// Huddle: the session does every step it can; human-only steps are for-dummies steps (Issue #50).
// These tests only read files; nothing here calls GitHub or GitLab.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));
const read = (rel) => readFileSync(path.join(root, rel), 'utf8');
const design = read('docs/design.md');
const smoke = read('docs/smoke-test.md');
const skills = readdirSync(path.join(root, 'skills')).map((d) => [d, read(`skills/${d}/SKILL.md`)]);

const ONLY = '🙋 Only you';

// The «🙋 Only you» steps of a document: each top-level numbered checkbox step tagged with the label, with its indented body.
const steps = (text) => text.split(/^(?=\d+\. \[[ x]\] |#{2,3} )/m).filter((s) => /^\d+\. \[[ x]\] /.test(s));
const personSteps = (text) => steps(text).filter((s) => s.startsWith(`${s.split(' ')[0]} [ ] **${ONLY}:**`));

test('design.md §13 states the rule, the human-only cases, the format and «never around a refusal»', () => {
  const m = design.match(/^## 13\. The session does every step it can\r?\n([\s\S]*?)(?=^## |(?![\s\S]))/m);
  assert.ok(m, 'no «## 13. The session does every step it can»');
  const t = m[1].replace(/\s+/g, ' ');
  for (const needle of ['gh', 'glab', 'git', 'does it itself', 'reports what it did',
    "second person's account", 'a payment', 'a secret', 'a phone or another device', 'a legal or business decision',
    'a paid action the person must approve', 'a permission that was denied',
    '«🙋 Solo tú»', ONLY, 'numbered', 'One action per step', 'copy block', 'You should see', 'If you see something else',
    'never looks for another way'])
    assert.ok(t.includes(needle), `§13 is missing «${needle}»`);
});

test('design.md keeps its earlier sections: §13 comes after §12 and nothing before it changed shape', () => {
  assert.ok(design.indexOf('## 12. Progress') >= 0 && design.indexOf('## 12. Progress') < design.indexOf('## 13. '));
});

test('every skill carries «Who does each step»: do it yourself, only 🙋 Only you for the person, the closing message', () => {
  assert.ok(skills.length >= 7);
  for (const [name, t] of skills) {
    const m = t.match(/^## Who does each step\r?\n([\s\S]*?)(?=^## |(?![\s\S]))/m);
    assert.ok(m, `${name}: no «## Who does each step»`);
    const s = m[1].replace(/\s+/g, ' ');
    for (const needle of ['yourself', ONLY, 'docs/design.md §13', 'closing message', 'next step', 'never look for another way'])
      assert.ok(s.includes(needle), `${name}: «Who does each step» is missing «${needle}»`);
  }
});

test('huddle-review merges and tags itself once its session approved, and asks only for 🙋 steps', () => {
  const t = read('skills/huddle-review/SKILL.md').replace(/\s+/g, ' ');
  for (const needle of ['merge it yourself', 'gh pr merge --merge', 'git tag -a', 'git push origin', 'gh release create', 'glab release create',
    ONLY, 'every cell of the smoke test is ✔', 'never hand'])
    assert.ok(t.includes(needle), `huddle-review is missing «${needle}»`);
  assert.doesNotMatch(t, /Tell the developer's next step in one line\.$/);
});

test('huddle-issue marks the steps only a person can do with «🙋» and leaves the rest to the session', () => {
  const t = read('skills/huddle-issue/SKILL.md').replace(/\s+/g, ' ');
  for (const needle of ['🙋', ONLY, 'every other step stays the session'])
    assert.ok(t.includes(needle), `huddle-issue is missing «${needle}»`);
});

test('huddle-play closes with the next step as a session action or as 🙋 steps', () => {
  const t = read('skills/huddle-play/SKILL.md').replace(/\s+/g, ' ');
  assert.match(t, /the next step[^.]*(🙋|Only you)/i);
});

test('the smoke test says who does each step: «Session» or «🙋 Only you», and the session runs its own', () => {
  const head = smoke.slice(0, smoke.indexOf('## 1. Setup')).replace(/\s+/g, ' ');
  assert.match(head, /The AI Manager's session runs/);
  assert.ok(head.includes(ONLY) && head.includes('Session'), 'the intro must explain both labels');
  const all = steps(smoke);
  assert.ok(all.length > 50, 'expected the whole checklist');
  for (const s of all) {
    const first = s.split('\n')[0];
    assert.match(first, /^\d+\. \[[ x]\] \*\*(Session|🙋 Only you):\*\* /, `no «Session» or «🙋 Only you» tag: ${first.slice(0, 70)}`);
  }
  assert.ok(personSteps(smoke).length >= 8, 'the steps that need a person must be there');
  assert.ok(all.length - personSteps(smoke).length > personSteps(smoke).length, 'the session must do most of the checklist');
});

test('the steps that need a second account or a new Claude Code window are 🙋', () => {
  const text = (heading) => smoke.match(new RegExp(`^## ${heading}\\r?\\n([\\s\\S]*?)(?=^## |(?![\\s\\S]))`, 'm'))[1];
  const mine = (heading) => personSteps(text(heading)).join('\n');
  assert.match(mine('3\\. Start'), /\/huddle-play/);
  assert.match(mine('5\\. A review request taken by a waiting session'), /second account/);
  assert.match(mine('6\\. The hook on reopen'), /new Claude Code window/i);
  assert.match(mine('1\\. Setup'), /HUDDLE_TOKEN/);
});

test('every 🙋 step is numbered, has a copy block when something is pasted, and says what the person should see', () => {
  for (const s of personSteps(smoke)) {
    const title = s.split('\n')[0].slice(0, 80);
    assert.ok((s.match(/^\s+\d+\. \S/gm) || []).length >= 2, `not numbered into sub-steps: ${title}`);
    assert.match(s, /You should see:/, `does not say what to see: ${title}`);
    assert.match(s, /If you see something else:/, `does not say what to do otherwise: ${title}`);
    if (/\b(paste|type|run)\b/i.test(s)) assert.match(s, /^\s+(`{3,})text\r?\n[\s\S]+?^\s+\1\s*$/m, `no copy block: ${title}`);
  }
});

test('no 🙋 step leaves jargon unexplained: «terminal», «clone» and «token» get a one-line meaning', () => {
  const all = personSteps(smoke).join('\n');
  for (const [word, meaning] of [['terminal', /terminal \(/i], ['clone', /clone \(/i], ['token', /token \(/i]])
    if (new RegExp(`\\b${word}\\b`, 'i').test(all)) assert.match(all, meaning, `«${word}» is used in a 🙋 step without a one-line explanation`);
});

test('the other guides: the GitLab token step is a «🙋 Only you» block, and roles.md says the session does the rest', () => {
  const g = read('docs/gitlab.md');
  assert.ok(g.includes(ONLY), 'gitlab.md has no «🙋 Only you» block');
  const block = g.slice(g.indexOf(ONLY));
  assert.ok((block.match(/^\d+\. \S/gm) || []).length >= 4, 'the token steps must be numbered');
  assert.match(block, /You should see:/);
  assert.match(block, /If you see something else:/);
  assert.match(block, /```text/);
  assert.match(read('docs/roles.md'), /does every step it can/);
});

test('team-guide.md explains it: the rule, who gets a 🙋, the format and the refusal rule', () => {
  const m = read('docs/team-guide.md').match(/^## Who does each step\r?\n([\s\S]*?)(?=^## |(?![\s\S]))/m);
  assert.ok(m, 'no «## Who does each step» in the team guide');
  const t = m[1].replace(/\s+/g, ' ');
  for (const needle of ['does every step it can', ONLY, '«🙋 Solo tú»', 'second person', 'payment', 'secret', 'phone', 'legal or business',
    'You should see', 'never looks for another way', '[the design](design.md#13-the-session-does-every-step-it-can)'])
    assert.ok(t.includes(needle), `team guide is missing «${needle}»`);
});

test('the CHANGELOG lists it under «Unreleased»', () => {
  const c = read('CHANGELOG.md');
  const unreleased = c.slice(c.indexOf('## [Unreleased]'), c.indexOf('## [0.2.0]'));
  assert.match(unreleased, /Issue #50/);
  assert.ok(unreleased.includes('🙋'));
});

test('no em dash in the new texts of the public docs', () => {
  for (const f of ['docs/gitlab.md', 'docs/roles.md', 'docs/team-guide.md'])
    assert.ok(!read(f).includes('—'), `${f} has an em dash`);
});
