import test from 'node:test';
import assert from 'node:assert/strict';
import { closesIn } from '../../lib/core/closes.mjs';

const fence = '```';

test('closesIn: every platform keyword, in any case, closes the Issue that follows', () => {
  for (const word of ['close', 'closes', 'closed', 'fix', 'fixes', 'fixed', 'resolve', 'resolves', 'resolved']) {
    assert.deepEqual(closesIn(`${word} #7`), [7], word);
    assert.deepEqual(closesIn(`${word.toUpperCase()} #7`), [7], word.toUpperCase());
    assert.deepEqual(closesIn(`${word[0].toUpperCase()}${word.slice(1)} #7`), [7], word);
  }
  assert.deepEqual(closesIn('Closes: #7'), [7], 'a colon after the keyword is allowed');
  assert.deepEqual(closesIn('Closes   #7'), [7]);
  assert.deepEqual(closesIn('## Summary\n\nDoes a thing.\n\nResolves #12\n'), [12]);
});

test('closesIn: a bare #N, or a word that only looks like a keyword, closes nothing', () => {
  assert.deepEqual(closesIn('Related to #7'), []);
  assert.deepEqual(closesIn('See #7 and #8'), []);
  assert.deepEqual(closesIn('Part of #7, closes nothing'), []);
  assert.deepEqual(closesIn('disclosed #7'), [], 'the keyword is a word on its own');
  assert.deepEqual(closesIn('prefixed #7'), []);
  assert.deepEqual(closesIn('Closes #7abc'), [], 'the number ends at the digits');
  assert.deepEqual(closesIn('Closes 7'), []);
  assert.deepEqual(closesIn(''), []);
  assert.deepEqual(closesIn(undefined), []);
  assert.deepEqual(closesIn(null), []);
});

test('closesIn: owner/repo#N counts only for this project', () => {
  assert.deepEqual(closesIn('Closes acme/app#7', 'acme/app'), [7]);
  assert.deepEqual(closesIn('Closes ACME/App#7', 'acme/app'), [7], 'owner and repo are case-insensitive');
  assert.deepEqual(closesIn('Closes other/repo#7', 'acme/app'), [], 'another project');
  assert.deepEqual(closesIn('Closes acme/app#7'), [], 'without a project, no cross reference is this one');
  assert.deepEqual(closesIn('Closes group/sub/app#7', 'group/sub/app'), [7], 'a GitLab group path');
});

test('closesIn: a keyword inside an HTML comment does not count', () => {
  assert.deepEqual(closesIn('<!-- Closes #7 -->'), []);
  assert.deepEqual(closesIn('<!--\nCloses #7\n-->\nCloses #8'), [8]);
  assert.deepEqual(closesIn('Closes #8 <!-- Closes #9 -->'), [8]);
  assert.deepEqual(closesIn('<!-- never closed\nCloses #7'), [], 'an unfinished comment hides the rest');
});

test('closesIn: a keyword inside a fenced code block does not count', () => {
  assert.deepEqual(closesIn(`${fence}\nCloses #7\n${fence}`), []);
  assert.deepEqual(closesIn(`${fence}text\nCloses #7\n${fence}\nCloses #8`), [8]);
  assert.deepEqual(closesIn(`~~~\nCloses #7\n~~~\nFixes #9`), [9]);
  assert.deepEqual(closesIn(`${fence}\nCloses #7\n`), [], 'an unfinished block runs to the end');
  assert.deepEqual(closesIn(`  ${fence}\r\nCloses #7\r\n  ${fence}\r\nCloses #8`), [8], 'indented, CRLF');
  assert.deepEqual(closesIn(`${'````'}\n${fence}\nCloses #7\n${fence}\n${'````'}\nCloses #8`), [8], 'a longer fence is not closed by a shorter one');
  assert.deepEqual(closesIn(`## What\n\n${fence}text\nCloses #7\n${fence}\n\n## Done\n\nCloses #3`), [3], 'the template block with Closes #N in it');
});

test('closesIn: a keyword inside inline code does not count', () => {
  assert.deepEqual(closesIn('Write `Closes #7` in the body'), []);
  assert.deepEqual(closesIn('Write ``Closes #7`` and Closes #8'), [8]);
  assert.deepEqual(closesIn('`code` Closes #8'), [8]);
  assert.deepEqual(closesIn('A lone ` backtick. Closes #8'), [8], 'an unmatched backtick hides nothing');
  assert.deepEqual(closesIn('Closes `#7`'), [], 'the number inside code is not a link');
});

test('closesIn: no duplicates, ascending', () => {
  assert.deepEqual(closesIn('Closes #9\nFixes #3\nresolves #9\ncloses #12'), [3, 9, 12]);
  assert.deepEqual(closesIn('Closes #10\nCloses #2'), [2, 10], 'a number order, not a text order');
});
