// Issue #241: keep line breaks and backslashes when sending bodies and comments.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const files = [
  'skills/huddle-play/SKILL.md',
  'skills/huddle-review/SKILL.md',
  'skills/huddle-decide/SKILL.md',
  'skills/huddle-issue/SKILL.md',
  'skills/huddle-bug/SKILL.md',
  'templates/CLAUDE.huddle.md',
];

for (const file of files) {
  test(`${file}: send bodies and comments from a temporary file`, () => {
    const text = readFileSync(new URL(`../../${file}`, import.meta.url), 'utf8');
    assert.match(text, /write .+bod(?:y|ies).+comment.+temporary (?:UTF-8 )?file first/i);
    assert.match(text, /`--body-file <file>` to `gh`/);
    assert.match(text, /`glab api … -F ['"]?body=@file['"]?`/);
    assert.match(text, /`(?:--description-file <file>|-F ['"]?description=@file['"]?)`/);
    assert.match(text, /never pass the text inline/i);
  });
}

const expanded = [
  ['team', '--description-file'],
  ['update', '--description-file'],
  ['release', '--description-file', 'body=@file'],
  ['watch', 'body=@file'],
  ['answer-review', 'body=@file'],
];

for (const [name, ...gitlabForms] of expanded) {
  test(`huddle-${name}: use file options for its publishing steps`, () => {
    const text = readFileSync(new URL(`../../skills/huddle-${name}/SKILL.md`, import.meta.url), 'utf8');
    assert.match(text, /temporary UTF-8 file/);
    assert.match(text, /--body-file <file>/);
    for (const form of gitlabForms) assert.ok(text.includes(form), `missing GitLab file form ${form}`);
    assert.doesNotMatch(text, /(?:--body|--description)(?:\s+|=)\.\.\./);
  });
}
