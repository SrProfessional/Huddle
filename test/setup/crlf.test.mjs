// Huddle: setup compares a template with the project's copy ignoring line endings (git core.autocrlf=true gives CRLF on Windows).
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { setup } from '../../lib/setup/index.mjs';

const GH = { platform: 'github', project: 'acme/app', ai_manager: 'santiago' };
const PR = '.github/pull_request_template.md';
const tpl = (rel) => readFileSync(fileURLToPath(new URL(`../../templates/${rel}`, import.meta.url)), 'utf8');
const bytes = (root, rel) => readFileSync(path.join(root, rel), 'utf8');

function inTemp(fn) {
  const root = mkdtempSync(path.join(tmpdir(), 'huddle-crlf-'));
  try { return fn(root); } finally { rmSync(root, { recursive: true, force: true }); }
}

test('a template that differs only in line endings (CRLF) is refreshed, not skipped, and keeps CRLF', () => inTemp((root) => {
  setup(root, GH);
  const lf = tpl('github/pull_request_template.md').replace(/\r\n/g, '\n');
  writeFileSync(path.join(root, PR), lf.replace(/\n/g, '\r\n'));
  const r = setup(root, GH);
  assert.ok(!r.skipped.includes(PR), 'not reported as edited by the project');
  assert.ok(r.written.includes(PR));
  assert.equal(bytes(root, PR), lf.replace(/\n/g, '\r\n'), 'still CRLF, every line');
  assert.ok(!r.notes.some((n) => n.includes(PR)));
}));

test('a CRLF copy with a real edit is still kept as it was', () => inTemp((root) => {
  setup(root, GH);
  const mine = 'my own PR template\r\nsecond line\r\n';
  writeFileSync(path.join(root, PR), mine);
  const r = setup(root, GH);
  assert.ok(r.skipped.includes(PR));
  assert.equal(bytes(root, PR), mine);
}));

test('a copy that is the template with one real word changed and CRLF is kept', () => inTemp((root) => {
  setup(root, GH);
  const edited = `${tpl('github/pull_request_template.md').replace(/\r\n/g, '\n')}\nExtra team rule.\n`.replace(/\n/g, '\r\n');
  writeFileSync(path.join(root, PR), edited);
  assert.ok(setup(root, GH).skipped.includes(PR));
  assert.equal(bytes(root, PR), edited);
}));

test('an LF copy identical to an LF template stays untouched', () => inTemp((root) => {
  setup(root, GH);
  const before = bytes(root, PR);
  const r = setup(root, GH);
  assert.ok(r.written.includes(PR) && !r.skipped.includes(PR));
  assert.equal(bytes(root, PR), before);
}));

test('GitLab templates get the same treatment', () => inTemp((root) => {
  const GL = { platform: 'gitlab', project: 'team/app', ai_manager: 'santiago' };
  setup(root, GL);
  const rel = '.gitlab/issue_templates/Task.md';
  const crlf = tpl('gitlab/issue_templates/Task.md').replace(/\r\n/g, '\n').replace(/\n/g, '\r\n');
  writeFileSync(path.join(root, rel), crlf);
  const r = setup(root, GL);
  assert.ok(!r.skipped.includes(rel));
  assert.equal(bytes(root, rel), crlf);
}));
