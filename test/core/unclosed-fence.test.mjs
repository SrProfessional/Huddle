// Issue #326: an unclosed fence hides only up to the next «## » heading, and a fence of four backticks closes on four. Pure functions, canned bodies, no network.
import test from 'node:test';
import assert from 'node:assert/strict';
import { allowedFilesOf, effortOf } from '../../lib/core/effort.mjs';
import { dependsOn, unfenced } from '../../lib/core/issue-status.mjs';
import { conflictReport } from '../../lib/core/conflicts.mjs';

const rest = '## Depends on\n\n- #4\n\n## Effort\n\n3\n\n## Allowed files\n\n- `a.mjs`\n';

test('an unclosed fence before «## Depends on» hides only its own text: the sections after it are read', () => {
  for (const fence of ['```', '```text', '~~~', '  ```', '````']) {
    const body = `## Goal\n\n${fence}\nsome code\n\n${rest}`;
    assert.deepEqual(dependsOn(body), [4], fence);
    assert.equal(effortOf(body), 3, fence);
    assert.deepEqual(allowedFilesOf(body), ['a.mjs'], fence);
  }
});

test('an unclosed fence is blanked with the same length and lines, up to the heading and not including it', () => {
  const body = '## Goal\n\n```\nx\ny\n## Depends on\n- #1\n';
  const out = unfenced(body);
  assert.equal(out.length, body.length);
  assert.equal(out.split('\n').length, body.split('\n').length);
  assert.equal(out, '## Goal\n\n   \n \n \n## Depends on\n- #1\n');
});

test('an unclosed fence with no later heading still hides everything to the end', () => {
  assert.equal(dependsOn('## Goal\n\n```\n## x\n- #1\n'), null);
  assert.equal(unfenced('a\n```\nb\nc').trim(), 'a');
});

test('CRLF bodies: an unclosed fence ends at the next heading, a closed one is unchanged', () => {
  const crlf = (s) => s.replace(/\n/g, '\r\n');
  assert.deepEqual(dependsOn(crlf(`## Goal\n\n\`\`\`\ncode\n\n${rest}`)), [4]);
  assert.deepEqual(allowedFilesOf(crlf(`## Goal\n\n\`\`\`\ncode\n\n${rest}`)), ['a.mjs']);
  const closed = crlf('## Goal\n\n```\n## Depends on\n- #9\n```\n\n## Depends on\n\n- #4\n');
  assert.deepEqual(dependsOn(closed), [4]);
  assert.equal(unfenced(closed).length, closed.length);
});

test('closed fences are unchanged: a heading inside a closed fence stays hidden, with ~~~ and with an indent too', () => {
  for (const [open, close] of [['```', '```'], ['~~~', '~~~'], ['  ```', '  ```'], ['```md', '```']]) {
    const body = `## Goal\n\n${open}\n## Depends on\n\n- #9\n\n## Effort\n\n8\n${close}\n\n${rest}`;
    assert.deepEqual(dependsOn(body), [4], open);
    assert.equal(effortOf(body), 3, open);
  }
  assert.equal(dependsOn('## Goal\n\n```\n## Depends on\n- #9\n```\n'), null);
  const mixed = '## Depends on\n\n~~~\n```\n## x\n~~~\n\n- #6\n';
  assert.deepEqual(dependsOn(mixed), [6], 'a ``` line inside a ~~~ fence does not close it');
});

test('a fence closed by the end of the text on its last line still closes', () => {
  assert.equal(unfenced('a\n```\nb\n```').trim(), 'a');
});

test('two closed fences and an unclosed one after them', () => {
  const body = '```\n## A\n```\n\n## Depends on\n\n- #2\n\n```\n## B\n\n## Effort\n\n2\n';
  assert.deepEqual(dependsOn(body), [2]);
  assert.equal(effortOf(body), 2);
});

test('a fence of four backticks closes only on a line of at least four, as Markdown does', () => {
  const body = '## Goal\n\n````md\n```text\n## Depends on\n\n- #9\n```\n\n## Effort\n\n8\n````\n\n' + rest;
  assert.deepEqual(dependsOn(body), [4], 'the inner three-backtick line does not close the outer fence');
  assert.equal(effortOf(body), 3);
  const five = '`````\n````\n## Depends on\n- #9\n`````\n## Depends on\n\n- #1\n';
  assert.deepEqual(dependsOn(five), [1], 'five opens, four does not close it, five does');
  assert.equal(unfenced('````\na\n`````\nb').trim(), 'b', 'a longer line closes it');
});

test('huddle conflicts reads an Issue with an unclosed fence like the readers do', () => {
  const body = `## Goal\n\n\`\`\`\ncode\n\n## Depends on\n\n- None\n\n## Allowed files\n\n- \`a.mjs\`\n`;
  const issue = (number) => ({ number, title: 'x', body, labels: [], assignees: [] });
  assert.equal(conflictReport([issue(1), issue(2)]).rows.length, 1, 'both are managed and share a.mjs');
});

test('design §19 says a pending decision is asked again, and the review skill says what the watch subagent does when it cannot ask', async () => {
  const { readFileSync } = await import('node:fs');
  const design = readFileSync(new URL('../../docs/design.md', import.meta.url), 'utf8');
  const para = design.split('\n').find((l) => l.startsWith('**A new session after a closed chat'));
  assert.match(para, /A decision or a triage that still waits is asked again: it still waits\./);
  assert.doesNotMatch(para, /told once again/);
  const skill = readFileSync(new URL('../../skills/huddle-review/SKILL.md', import.meta.url), 'utf8');
  const asking = skill.split('## Asking the Coach')[1].split('\n## ')[0];
  assert.match(asking, /watch's review subagent/);
  assert.match(asking, /«❓ Decision for the Coach:»/);
  assert.match(asking, /labels --issue <n>" --needs-decision|labels --issue <n> --needs-decision/);
  assert.ok(skill.split('\n').length <= 90, 'the line limit of plugin.test.mjs');
});
