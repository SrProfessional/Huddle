// Issue #164: `/huddle-play` with no number works on several assigned Issues at once, each in a background subagent with a clean context, by
// effort and capacity. The instructions live in skills/huddle-play/parallel.md (the skill's own supporting file); tested as text.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const read = (rel) => readFileSync(fileURLToPath(new URL(`../../${rel}`, import.meta.url)), 'utf8').replace(/\s+/g, ' ');
const HUDDLE = 'node "${CLAUDE_PLUGIN_ROOT}/bin/huddle"';
const play = read('skills/huddle-play/SKILL.md');
const par = read('skills/huddle-play/parallel.md');

test('SKILL.md sends /huddle-play with no number to parallel.md, and keeps /huddle-play <n>', () => {
  assert.match(play, /With no number \(`\/huddle-play`\): read and follow `\$\{CLAUDE_PLUGIN_ROOT\}\/skills\/huddle-play\/parallel\.md`/);
  assert.match(play, /`\/huddle-play` alone to work on several assigned Issues at once/);
  assert.match(play, /## Start an Issue/);
});

test('parallel.md: huddle next --json first, then one background subagent per Issue with a clean context', () => {
  const next = par.indexOf(`${HUDDLE} next --json`);
  const agent = par.search(/subagent with the Agent tool, \*\*in the background\*\*/);
  assert.ok(next > 0 && agent > next);
  assert.match(par, /clean context/);
  assert.match(par, /keep its ID next to the Issue number/);
  assert.match(par, /follow «Start an Issue» for Issue <n>/);
  assert.match(par, /labels --issue <n> --started/);
  assert.match(par, /Do not start the wait/);
});

test('parallel.md: the waiting stays in the main session (one Player watch, Issue #248); a request continues the same subagent with SendMessage, or a new one', () => {
  assert.ok(par.includes(`${HUDDLE} next --wait --seen <keys>`));
  assert.match(par, /continue \*\*that Issue's\*\* subagent with SendMessage/);
  assert.match(par, /If SendMessage is not available here, or the subagent's ID is lost \(a new session, an old wait that died\), launch a new background/);
  assert.match(par, /«Continue an Issue»/);
});

test('parallel.md: the next one starts when room frees; Design Issues never go to a subagent; the main session reads only summaries', () => {
  assert.match(par, /run `huddle next --json` again/);
  assert.match(par, /A Design Issue never goes to a subagent/);
  assert.match(par, /never read the diff/);
  assert.match(par, /Leave this session open: closing it stops them/);
  assert.match(par, /huddle capacity <points>/);
});
