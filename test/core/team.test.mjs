// Huddle: the pure part of `huddle team` (Issue #36): editing `assignees` in the text of huddle.json, and the step for the AI Manager.
import test from 'node:test';
import assert from 'node:assert/strict';
import { assignStep, withAssignees } from '../../lib/core/team.mjs';

test('withAssignees rewrites only the assignees array and keeps everything else byte for byte', () => {
  const text = '{\n  "platform": "github",\n  "assignees": ["ana", "luis"],\n  "max_open_per_person": 2\n}\n';
  assert.equal(withAssignees(text, ['ana', 'luis', 'eva']), '{\n  "platform": "github",\n  "assignees": ["ana", "luis", "eva"],\n  "max_open_per_person": 2\n}\n');
  assert.equal(withAssignees(text, ['luis']), '{\n  "platform": "github",\n  "assignees": ["luis"],\n  "max_open_per_person": 2\n}\n');
  assert.equal(withAssignees(text, []), '{\n  "platform": "github",\n  "assignees": [],\n  "max_open_per_person": 2\n}\n');
});

test('withAssignees keeps CRLF line endings, also for a multi-line array', () => {
  const text = '{\r\n    "assignees": [\r\n        "ana"\r\n    ],\r\n    "project": "a/b"\r\n}\r\n';
  assert.equal(withAssignees(text, ['ana', 'luis']), '{\r\n    "assignees": [\r\n        "ana",\r\n        "luis"\r\n    ],\r\n    "project": "a/b"\r\n}\r\n');
  assert.ok(!/[^\r]\n/.test(withAssignees(text, ['x'])), 'no bare LF appears in a CRLF file');
});

test('withAssignees keeps the spacing style of an inline array', () => {
  assert.equal(withAssignees('{"assignees":["a","b"],"x":1}', ['a', 'b', 'c']), '{"assignees":["a","b","c"],"x":1}');
  assert.equal(withAssignees('{"assignees": []}', ['a']), '{"assignees": ["a"]}');
});

test('withAssignees fills a multi-line array that was empty, and ignores brackets and the word inside strings', () => {
  const text = '{\n  "project": "assignees",\n  "labels": { "ready": "a]b", "x": "\\"assignees\\": [1]" },\n  "assignees": ["ana"]\n}';
  assert.equal(withAssignees(text, ['ana', 'luis']), text.replace('["ana"]', '["ana", "luis"]'));
});

test('withAssignees adds the key as the last one when huddle.json has none, with the file\'s indent and line ending', () => {
  assert.equal(withAssignees('{\n  "platform": "github"\n}\n', ['ana']), '{\n  "platform": "github",\n  "assignees": ["ana"]\n}\n');
  assert.equal(withAssignees('{\r\n\t"platform": "github"\r\n}', ['ana']), '{\r\n\t"platform": "github",\r\n\t"assignees": ["ana"]\r\n}');
});

test('withAssignees escapes what JSON needs', () => {
  assert.equal(withAssignees('{"assignees": []}', ['a"b']), '{"assignees": ["a\\"b"]}');
});

test('assignStep on GitHub names the Settings page and the exact gh command', () => {
  const step = assignStep({ platform: 'github', project: 'acme/app', host: '' }, 'ana', true);
  assert.match(step, /Settings → Collaborators/);
  assert.match(step, /gh api -X PUT repos\/acme\/app\/collaborators\/ana/);
  assert.match(step, /https:\/\/github\.com\/acme\/app\/settings\/access/);
  assert.doesNotMatch(step, /--hostname/);
  assert.match(assignStep({ platform: 'github', project: 'acme/app', host: 'ghe.example.com' }, 'ana', true), /gh api --hostname ghe\.example\.com -X PUT repos\/acme\/app\/collaborators\/ana/);
});

test('assignStep on GitLab names Manage → Members and the Developer role, with the members page of the host', () => {
  const step = assignStep({ platform: 'gitlab', project: 'team/sub/app', host: 'gitlab.example.com' }, 'luis', true);
  assert.match(step, /Manage → Members/);
  assert.match(step, /Developer/);
  assert.match(step, /https:\/\/gitlab\.example\.com\/team\/sub\/app\/-\/project_members/);
  assert.match(assignStep({ platform: 'gitlab', project: 'a/b', host: '' }, 'x', true), /https:\/\/gitlab\.com\/a\/b\/-\/project_members/);
});

test('assignStep, when the login does not exist, says to check the spelling instead of inviting', () => {
  const step = assignStep({ platform: 'github', project: 'acme/app', host: '' }, 'anaa', false);
  assert.match(step, /no user "anaa"/i);
  assert.doesNotMatch(step, /gh api -X PUT/);
});
