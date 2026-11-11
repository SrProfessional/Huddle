// Huddle: checks on the public docs (Issue #7). They only read files; nothing here calls GitHub or GitLab.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));
const read = (rel) => readFileSync(path.join(root, rel), 'utf8');
const DOCS = ['README.md', 'CHANGELOG.md', 'docs/roles.md', 'docs/first-day.md', 'docs/team-guide.md', 'docs/gitlab.md'];
const NAME = 'Huddle: Decision-led development for teams coding with AI';

test('every public doc exists and is not empty', () => {
  for (const f of DOCS) {
    assert.ok(existsSync(path.join(root, f)), `${f} is missing`);
    assert.ok(read(f).trim().length > 200, `${f} is empty or too short`);
  }
});

test('the README gives the full name, an install and a quickstart for GitHub and for GitLab', () => {
  const t = read('README.md');
  assert.ok(t.includes(NAME), 'full name missing');
  assert.match(t, /^##\s+Install/im);
  assert.match(t, /^##\s+.*Quickstart.*GitHub/im);
  assert.match(t, /^##\s+.*Quickstart.*GitLab/im);
});

test('no em dash anywhere in the public docs', () => {
  for (const f of DOCS) assert.ok(!read(f).includes('—'), `${f} has an em dash`);
});

test('the GitLab guide covers the schedule, the HUDDLE_TOKEN step and a self-managed host', () => {
  const t = read('docs/gitlab.md');
  assert.match(t, /\*\/10 \* \* \* \*/);
  assert.match(t, /HUDDLE_TOKEN/);
  assert.match(t, /masked/i);
  assert.match(t, /protected/i);
  assert.match(t, /self-managed/i);
  assert.match(t, /"host"/);
});

test('GitLab docs: token stays protected, MR pipelines skip, labels lag up to 10 minutes also after a push', () => {
  const t = read('docs/gitlab.md');
  assert.match(t, /Huddle: HUDDLE_TOKEN is only available on protected branches/);
  assert.match(t, /up to 10 minutes[^.]*also after a push/s);
  assert.match(t, /`test` stage/);
  for (const f of ['README.md', 'docs/gitlab.md', 'docs/team-guide.md', 'docs/first-day.md', 'docs/roles.md']) {
    assert.doesNotMatch(read(f), /push[^.\n]*updates it at once/i, f);
  }
  assert.match(read('README.md'), /up to 10 minutes[^.]*also after a push/s);
});

// --- every command in the docs exists in the CLI or the skills ---------------------------------------------------------------

const CLI = ['labels', 'wait', 'take', 'pending', 'queue', 'progress', 'areas', 'team', 'clean', 'update', 'hook', 'doctor'];
const skills = readdirSync(path.join(root, 'skills')).filter((d) => existsSync(path.join(root, 'skills', d, 'SKILL.md')));

/** The text inside code fences and inline code spans: where commands are written. */
function code(text) {
  const spans = [];
  const noFences = text.replace(/```[^\n]*\n([\s\S]*?)```/g, (_, body) => { spans.push(body); return ''; });
  for (const m of noFences.matchAll(/`([^`\n]+)`/g)) spans.push(m[1]);
  return spans.join('\n');
}

test('the CLI commands the docs name are in bin/huddle (checked against its usage line)', () => {
  const usage = read('lib/cli/run.mjs').match(/const USAGE = '([^']+)'/)[1];
  for (const c of CLI) assert.match(usage, new RegExp(`\\b${c}\\b`), `${c} is not in the CLI`);
  let seen = 0;
  for (const f of DOCS) {
    for (const m of code(read(f)).matchAll(/(?:bin\/huddle|\bhuddle)[ \t]+([a-z][a-z-]*)/g)) {
      if (m[1] === 'json') continue;
      seen += 1;
      assert.ok(CLI.includes(m[1]), `${f}: "huddle ${m[1]}" is not a command of the CLI`);
    }
  }
  assert.ok(seen > 0, 'the docs show no CLI command at all');
});

test('the /huddle-* skills the docs name exist in skills/', () => {
  let seen = 0;
  for (const f of DOCS) {
    for (const m of read(f).matchAll(/(?<![\w./-])\/(huddle-[a-z]+)(?![\w.-])/g)) { // a slash command, not a path such as workflows/huddle-labels.yml
      seen += 1;
      assert.ok(skills.includes(m[1]), `${f}: /${m[1]} is not a skill`);
    }
  }
  assert.ok(seen > 0, 'the docs name no skill');
  for (const s of skills) assert.ok(DOCS.some((f) => read(f).includes(`/${s}`)), `no doc mentions /${s}`);
});

test('every CLI command is documented somewhere', () => {
  const all = DOCS.map(read).join('\n');
  for (const c of CLI) assert.match(all, new RegExp(`huddle ${c}\\b`), `huddle ${c} is not documented`);
});

// --- links ------------------------------------------------------------------------------------------------------------------------

const slug = (h) => h.toLowerCase().replace(/[^\p{L}\p{N}\s-]/gu, '').trim().replace(/\s+/g, '-');
const anchors = (text) => new Set([...text.replace(/```[\s\S]*?```/g, '').matchAll(/^#{1,6}\s+(.+)$/gm)].map((m) => slug(m[1].replace(/[`*]/g, ''))));

test('every link inside the repo resolves (files and #anchors)', () => {
  let checked = 0;
  for (const f of [...DOCS, 'docs/design.md']) {
    if (!existsSync(path.join(root, f))) continue; // a missing doc fails in the first test
    const text = read(f);
    for (const m of text.replace(/```[\s\S]*?```/g, '').matchAll(/\[[^\]]*\]\(([^)\s]+)\)/g)) {
      const [target, hash] = m[1].split('#');
      if (/^[a-z]+:/i.test(target)) continue; // external: never fetched
      const file = target ? path.join(path.dirname(path.join(root, f)), target) : path.join(root, f);
      assert.ok(existsSync(file), `${f}: ${m[1]} does not exist`);
      checked += 1;
      if (hash && file.endsWith('.md')) assert.ok(anchors(readFileSync(file, 'utf8')).has(hash), `${f}: no heading for #${hash} in ${target || f}`);
    }
  }
  assert.ok(checked > 5, 'too few links were checked');
});
