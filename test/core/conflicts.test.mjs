// Issue #312: planned file conflicts between open Issues and the order that settles them (docs/design.md §22). Pure functions on canned bodies.
import test from 'node:test';
import assert from 'node:assert/strict';
import { sharedFiles, addDependency, conflictReport, planApply } from '../../lib/core/conflicts.mjs';

const body = (files, deps = '- None') => `## Depends on\n\n${deps}\n\n## Allowed files\n\n${files.map((f) => `- \`${f}\``).join('\n')}\n\n## Contract or spec\n\nx\n`;
const issue = (number, files, { deps, labels = [], severity } = {}) => ({ number, title: `Issue ${number}`, labels, body: body(files, deps) + (severity ? `\n## Severity\n\n${severity}\n` : '') });

test('sharedFiles: the same path, a folder that covers a path, and nothing else; the files every Issue touches by rule are ignored', () => {
  assert.deepEqual(sharedFiles(['a/x.mjs', 'b.mjs'], ['a/x.mjs', 'c.mjs']), ['a/x.mjs']);
  assert.deepEqual(sharedFiles(['Assets/Scenes/'], ['Assets/Scenes/Main.unity']), ['Assets/Scenes/Main.unity']);
  assert.deepEqual(sharedFiles(['a/x.mjs'], ['a/y.mjs']), []);
  assert.deepEqual(sharedFiles(['CHANGELOG.md', 'a.mjs'], ['CHANGELOG.md', 'b.mjs']), []);
});

test('conflictReport groups the pairs with their files, the lower number first, and lists the Issues with no conflict', () => {
  const r = conflictReport([issue(91, ['Scene.unity', 'A.cs']), issue(84, ['Scene.unity', 'A.cs', 'B.cs']), issue(85, ['Scene.unity']), issue(7, ['other.mjs'])]);
  assert.deepEqual(r.rows.map((x) => [x.first, x.then, x.files]), [[84, 85, ['Scene.unity']], [84, 91, ['A.cs', 'Scene.unity']], [85, 91, ['Scene.unity']]]);
  assert.deepEqual(r.free, [7]);
});

test('the order: a dependency goes first, then a blocking bug, then the lower number', () => {
  const dep = conflictReport([issue(5, ['a.mjs'], { deps: '- #9' }), issue(9, ['a.mjs'])]);
  assert.deepEqual(dep.rows.map((x) => [x.first, x.then]), [[9, 5]]);
  const bug = conflictReport([issue(5, ['a.mjs']), issue(9, ['a.mjs'], { labels: ['bug'], severity: 'blocking' })]);
  assert.deepEqual(bug.rows.map((x) => [x.first, x.then]), [[9, 5]]);
  const low = conflictReport([issue(9, ['a.mjs']), issue(5, ['a.mjs'])]);
  assert.deepEqual(low.rows.map((x) => [x.first, x.then]), [[5, 9]]);
});

test('a pair already ordered by a direct or indirect dependency is settled; two docs-only Issues sharing a doc do not conflict', () => {
  const r = conflictReport([issue(1, ['a.mjs']), issue(2, ['b.mjs'], { deps: '- #1' }), issue(3, ['a.mjs', 'b.mjs'], { deps: '- #2' })]);
  assert.deepEqual(r.rows.map((x) => [x.first, x.then, x.settled]), [[1, 3, true], [2, 3, true]]);
  const docs = conflictReport([issue(1, ['docs/design.md']), issue(2, ['docs/design.md', 'docs/team-guide.md'])]);
  assert.deepEqual(docs.rows, []);
  assert.deepEqual(docs.free, [1, 2]);
  const mixed = conflictReport([issue(1, ['docs/design.md', 'a.mjs']), issue(2, ['docs/design.md'])]);
  assert.equal(mixed.rows.length, 1, 'only one of them is docs-only');
});

test('Issues that are not managed (no «Depends on») or wait for triage are left out', () => {
  const r = conflictReport([issue(1, ['a.mjs']), { number: 2, title: 'x', labels: [], body: '## Allowed files\n\n- `a.mjs`\n' }, issue(3, ['a.mjs'], { labels: ['needs triage'] })]);
  assert.deepEqual(r.rows, []);
});

test('addDependency adds «- #n» once, removes «- None», touches only that section', () => {
  const b = body(['a.mjs']);
  const out = addDependency(b, 4);
  assert.match(out, /## Depends on\n\n- #4\n\n## Allowed files/);
  assert.ok(!/- None/.test(out));
  assert.equal(addDependency(out, 4), out, 'never twice');
  assert.match(addDependency(out, 6), /- #4\n- #6\n/);
  assert.equal(addDependency('## Goal\n\nx\n', 4), null, 'no section, no change');
});

test('planApply: one change per «then» Issue, none for what is settled, and no circle is ever written', () => {
  const issues = [issue(1, ['a.mjs']), issue(2, ['a.mjs']), issue(3, ['a.mjs'])];
  const p = planApply(issues);
  assert.deepEqual(p.changes.map((c) => [c.issue, c.add]), [[2, [1]], [3, [1, 2]]]);
  assert.match(p.changes[1].body, /- #1\n- #2\n/);
  assert.deepEqual(p.refused, []);
  const again = planApply(issues.map((i) => { const c = p.changes.find((x) => x.issue === i.number); return c ? { ...i, body: c.body } : i; }));
  assert.deepEqual(again.changes, [], 'a second run changes nothing');
  // A circle: #1 depends on #3 through #2, and #1 shares a file with #3 where the number order wants #1 first. The dependency wins, so no circle.
  const chain = planApply([issue(1, ['a.mjs'], { deps: '- #2' }), issue(2, ['b.mjs'], { deps: '- #3' }), issue(3, ['a.mjs'])]);
  assert.deepEqual(chain.changes, []);
  assert.deepEqual(chain.refused, []);
});

test('planApply refuses a link that would close a circle and names the link to break', () => {
  // #1 depends on #3. #1 and #2 share a.mjs (#1 first), #2 and #3 share b.mjs (#2 first): #2 waits for #1, #3 for #2, and #1 already waits for #3.
  const issues = [issue(1, ['a.mjs'], { deps: '- #3' }), issue(2, ['a.mjs', 'b.mjs']), issue(3, ['b.mjs'])];
  const p = planApply(issues);
  assert.deepEqual(p.changes.map((c) => [c.issue, c.add]), [[2, [1]]]);
  assert.equal(p.refused.length, 1);
  assert.deepEqual([p.refused[0].first, p.refused[0].then], [2, 3]);
  assert.match(p.refused[0].text, /circular wait: #1 → #3 → #2 → #1/);
  assert.match(p.refused[0].breakIt, /«Depends on»/);
});

// Issue #315: `None` is not a file, CHANGELOG.md does not stop an Issue from being docs-only, a fenced «Depends on» is not the real one, and `--order` takes the Coach's order.
const rawBody = (allowed, deps = '- None') => `## Depends on\n\n${deps}\n\n## Allowed files\n\n${allowed}\n\n## Contract or spec\n\nx\n`;

test('«None» and «(none)» list no file, in any case, with or without backticks or a dash; two such Issues never conflict', () => {
  for (const line of ['- None', '- none', '- (none)', '- (None)', '- `None`', '* None', '- None.', '-   NONE']) {
    const r = conflictReport([{ number: 1, title: 'a', labels: [], body: rawBody(line) }, { number: 2, title: 'b', labels: [], body: rawBody(line) }]);
    assert.deepEqual(r.rows, [], line);
    assert.deepEqual(r.free, [1, 2], line);
  }
  // A real file next to None still counts, and a file whose name only starts with «none» is a file.
  const mixed = conflictReport([{ number: 1, title: 'a', labels: [], body: rawBody('- None\n- `a.mjs`') }, { number: 2, title: 'b', labels: [], body: rawBody('- `a.mjs`') }]);
  assert.equal(mixed.rows.length, 1);
  const named = conflictReport([{ number: 1, title: 'a', labels: [], body: rawBody('- `none.mjs`') }, { number: 2, title: 'b', labels: [], body: rawBody('- `none.mjs`') }]);
  assert.equal(named.rows.length, 1);
});

test('a docs-only Issue that also lists CHANGELOG.md is still docs-only: two of them sharing a docs page do not conflict', () => {
  const r = conflictReport([issue(1, ['docs/design.md', 'CHANGELOG.md']), issue(2, ['docs/design.md', 'docs/team-guide.md', 'CHANGELOG.md'])]);
  assert.deepEqual(r.rows, []);
  const code = conflictReport([issue(1, ['docs/design.md', 'CHANGELOG.md']), issue(2, ['docs/design.md', 'lib/a.mjs', 'CHANGELOG.md'])]);
  assert.equal(code.rows.length, 1, 'one of them also lists code');
  const onlyLog = conflictReport([issue(1, ['CHANGELOG.md']), issue(2, ['CHANGELOG.md'])]);
  assert.deepEqual(onlyLog.rows, []);
});

test('a fenced «## Depends on» before the real section is not edited and not read; the real one is', () => {
  const fenced = '## Goal\n\n```text\n## Depends on\n\n- #99\n```\n\n## Depends on\n\n- None\n\n## Allowed files\n\n- `a.mjs`\n';
  const out = addDependency(fenced, 4);
  assert.match(out, /```text\n## Depends on\n\n- #99\n```/, 'the fenced block is untouched');
  assert.match(out, /## Depends on\n\n- #4\n\n## Allowed files/);
  assert.equal(addDependency(out, 4), out, 'never twice');
  const fencedOnly = '## Goal\n\n```\n## Depends on\n\n- None\n```\n\n## Allowed files\n\n- `a.mjs`\n';
  assert.equal(addDependency(fencedOnly, 4), null, 'a fenced section alone is no section');
  // The report reads the real section too: #2 really depends on #1, so the pair is settled.
  const r = conflictReport([issue(1, ['a.mjs']), { number: 2, title: 'two', labels: [], body: fenced.replace('- None\n\n## Allowed', '- #1\n\n## Allowed') }]);
  assert.deepEqual(r.rows.map((x) => [x.first, x.then, x.settled]), [[1, 2, true]]);
});

test('--order: the named Issues follow the Coach\'s order between the pairs that share a file; the rest of the suggestion stays', () => {
  const issues = [issue(84, ['Scene.unity', 'A.cs']), issue(85, ['Scene.unity']), issue(91, ['A.cs', 'Scene.unity']), issue(7, ['other.mjs']), issue(8, ['other.mjs'])];
  const r = conflictReport(issues, { order: [91, 84, 85] });
  assert.deepEqual(r.rows.map((x) => [x.first, x.then]), [[7, 8], [84, 85], [91, 84], [91, 85]]);
  const p = planApply(issues, { order: [91, 84, 85] });
  assert.deepEqual(p.changes.map((c) => [c.issue, c.add]), [[8, [7]], [84, [91]], [85, [84, 91]]]);
  assert.deepEqual(p.refused, []);
  // Only pairs that share a file: #86 comes after #91 in the order but shares nothing with it, so it depends on nobody.
  const apart = planApply([issue(91, ['a.mjs']), issue(86, ['b.mjs']), issue(87, ['a.mjs'])], { order: [87, 86, 91] });
  assert.deepEqual(apart.changes.map((c) => [c.issue, c.add]), [[91, [87]]]);
  // A named Issue with an unnamed one keeps the default rule.
  const half = planApply([issue(1, ['a.mjs']), issue(2, ['a.mjs']), issue(3, ['a.mjs'])], { order: [3, 2] });
  assert.deepEqual(half.changes.map((c) => [c.issue, c.add]), [[2, [1, 3]], [3, [1]]]);
  // Without an order nothing changes.
  assert.deepEqual(planApply(issues), planApply(issues, {}));
});

test('--order never makes a circle: a link against an existing dependency is refused with the link to break', () => {
  const issues = [issue(1, ['a.mjs'], { deps: '- #2' }), issue(2, ['a.mjs'])];
  const p = planApply(issues, { order: [1, 2] });
  assert.deepEqual(p.changes, []);
  assert.equal(p.refused.length, 1);
  assert.deepEqual([p.refused[0].first, p.refused[0].then], [1, 2]);
  assert.match(p.refused[0].text, /circular wait/);
});
