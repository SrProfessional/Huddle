// Huddle: the plugin files (docs/design.md §4, §8): five skills and the SessionStart hook.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const abs = (rel) => fileURLToPath(new URL(`../../${rel}`, import.meta.url));
const read = (rel) => readFileSync(abs(rel), 'utf8');
const SKILLS = ['huddle-setup', 'huddle-play', 'huddle-issue', 'huddle-review', 'huddle-decide', 'huddle-team', 'huddle-areas', 'huddle-bug', 'huddle-update', 'huddle-watch'];

const frontmatter = (text) => {
  const m = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n/);
  assert.ok(m, 'missing frontmatter');
  return Object.fromEntries(m[1].split(/\r?\n/).map((l) => [l.slice(0, l.indexOf(':')), l.slice(l.indexOf(':') + 1).trim()]));
};

test('hooks.json runs `huddle hook` on startup and resume, with a timeout of 45 s', () => {
  const entries = JSON.parse(read('hooks/hooks.json')).hooks.SessionStart;
  assert.equal(entries.length, 1);
  assert.equal(entries[0].matcher, 'startup|resume');
  const [h] = entries[0].hooks;
  assert.equal(h.type, 'command');
  assert.match(h.command, /\$\{CLAUDE_PLUGIN_ROOT\}\/bin\/huddle" hook$/);
  assert.equal(h.timeout, 45);
});

for (const name of SKILLS) {
  test(`${name}: SKILL.md has a name, says when to use it, and is short`, () => {
    const text = read(`skills/${name}/SKILL.md`);
    const fm = frontmatter(text);
    assert.equal(fm.name, name);
    assert.match(fm.description, /^Use when /);
    // huddle-play is the old start and continue skills in one (the Design flow moved in unchanged), so it gets 100 lines.
    assert.ok(text.split('\n').length <= (['huddle-play', 'huddle-update'].includes(name) ? 100 : 90), 'keep it short');
    assert.doesNotMatch(text, /socialcortex|docs\/equipo|scripts\/huddle/i);
  });
}

test('setup asks the five questions and calls lib/setup', () => {
  const t = read('skills/huddle-setup/SKILL.md');
  for (const q of [/platform/i, /host/i, /project/i, /AI Manager/, /team/i]) assert.match(t, q);
  assert.match(t, /lib\/setup\/cli\.mjs/);
  assert.match(t, /bin\/huddle" doctor/);
});

test('review and decide post «## Prompt for Claude Code» on the PR/MR and on its Issue', () => {
  for (const name of ['huddle-review', 'huddle-decide']) {
    const t = read(`skills/${name}/SKILL.md`);
    assert.match(t, /## Prompt for Claude Code/);
    assert.match(t, /PR\/MR/);
    assert.match(t, /Issue/);
  }
});

test('only the AI Manager merges: review says so, start never merges and uses wait/take', () => {
  assert.match(read('skills/huddle-review/SKILL.md'), /AI Manager/);
  const play = read('skills/huddle-play/SKILL.md');
  assert.match(play, /never merge/i);
  assert.match(play, /huddle" wait/);
  assert.match(play, /huddle" take/);
});

test('every command runs as node "${CLAUDE_PLUGIN_ROOT}/bin/huddle" <command>: a team repo has no bin/huddle and no huddle on the PATH', () => {
  const full = /node "(\$\{CLAUDE_PLUGIN_ROOT\}|<new folder>)\/bin\/huddle"/g;
  for (const name of SKILLS) {
    const rest = read(`skills/${name}/SKILL.md`).replace(full, '<HUDDLE>');
    assert.doesNotMatch(rest, /bin\/huddle/, `${name}: bin/huddle outside the full command`);
    assert.doesNotMatch(rest, /\bhuddle (wait|take|doctor|labels|pending|hook|update|queue)\b/, `${name}: bare huddle command`);
  }
});

test('the label is always named in full: «changes requested from AI Manager»', () => {
  for (const name of SKILLS) assert.doesNotMatch(read(`skills/${name}/SKILL.md`), /changes requested(?! from AI Manager)/, name);
  assert.match(read('skills/huddle-review/SKILL.md'), /changes requested from AI Manager/);
  assert.match(read('skills/huddle-play/SKILL.md'), /changes requested from AI Manager/);
});

test('setup says an empty max open per person means no limit, and gives no default of 2', () => {
  const t = read('skills/huddle-setup/SKILL.md');
  assert.match(t, /empty = no limit/);
  assert.doesNotMatch(t, /default 2/);
});

// The text block of the «## Prompt for Claude Code» a skill posts: from its opening fence to the closing one.
const templateOf = (name) => {
  const t = read(`skills/${name}/SKILL.md`);
  const m = t.match(/## Prompt for Claude Code\r?\n\r?\n```text\r?\n([\s\S]*?)\r?\n```\r?\n````/);
  assert.ok(m, `${name}: no prompt template found`);
  return m[1];
};

test('the review and decide prompt templates start with the take step', () => {
  for (const name of ['huddle-review', 'huddle-decide']) {
    const first = templateOf(name).split('\n')[0];
    assert.match(first, /^First run \/huddle-play <n>: it marks this request as taken \(👀\), so the Issue shows «in progress»\./, name);
  }
});

test('plugin.json names the plugin', () => {
  const p = JSON.parse(read('.claude-plugin/plugin.json'));
  assert.equal(p.name, 'huddle');
  assert.ok(existsSync(abs('hooks/hooks.json')));
});
