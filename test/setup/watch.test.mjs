// Issue #88, docs/design.md §19: `/huddle-watch` starts a check every few minutes in the AI Manager's session. The skill is text the session follows, so it is tested as text.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (rel) => readFileSync(new URL(`../../${rel}`, import.meta.url), 'utf8');
const flat = (rel) => read(rel).replace(/\s+/g, ' ');
const WATCH = 'skills/huddle-watch/SKILL.md';
const HUDDLE = 'node "${CLAUDE_PLUGIN_ROOT}/bin/huddle"';

test('the watch skill has a name, says when to use it, and is short', () => {
  const text = read(WATCH);
  const fm = Object.fromEntries(text.match(/^---\r?\n([\s\S]*?)\r?\n---/)[1].split(/\r?\n/).map((l) => [l.slice(0, l.indexOf(':')), l.slice(l.indexOf(':') + 1).trim()]));
  assert.equal(fm.name, 'huddle-watch');
  assert.match(fm.description, /^Use when /);
  assert.ok(text.split('\n').length <= 90, 'keep it short');
});

test('it is for the AI Manager only: doctor first, and a clear stop for anyone else', () => {
  const t = flat(WATCH);
  assert.match(t, /For the AI Manager only/);
  assert.ok(t.indexOf(`${HUDDLE} doctor`) > 0);
  assert.match(t, /`ai_manager`/);
  assert.match(t, /stop/i);
});

test('on: CronList first, no second watch, then CronCreate a recurring job whose prompt starts with [huddle-watch], on an off-minute', () => {
  const t = flat(WATCH);
  const list = t.indexOf('CronList');
  const create = t.indexOf('CronCreate');
  assert.ok(list >= 0 && create > list, 'CronList before CronCreate');
  assert.match(t, /\[huddle-watch\]/);
  assert.match(t, /already (on|running)/i);
  assert.match(t, /not a second|no second|do \*\*not\*\* start a second|never (a )?second/i);
  assert.match(t, /not :00 or :30|never :00 or :30|not the :00 or :30/i);
  assert.match(t, /2-59\/5 \* \* \* \*/);
  assert.match(t, /default 5 minutes/i);
  assert.match(t, /2 to 60/);
  assert.ok(t.includes(`${HUDDLE} queue --json`));
});

test('the first message says that turning it on is the order to review and merge', () => {
  const t = flat(WATCH);
  assert.match(t, /turning the watch on is the AI Manager's order to review and merge/i);
  assert.match(t, /as if (they|you) asked for each review/i);
});

test('it says what stops it: off, or closing Claude Code, and that a recurring job expires after 7 days', () => {
  const t = flat(WATCH);
  assert.match(t, /\/huddle-watch off/);
  assert.match(t, /closing Claude Code/i);
  assert.match(t, /only in the session|lives only in the session/i);
  assert.match(t, /7 days/);
});

test('off: CronList, CronDelete the [huddle-watch] job, and says so when nothing runs; status says on or off, the interval and the next run', () => {
  const t = flat(WATCH);
  assert.match(t, /CronDelete/);
  assert.match(t, /nothing (is )?running|not running/i);
  assert.match(t, /\/huddle-watch status/);
  assert.match(t, /next run/i);
  assert.match(t, /interval/i);
});

test('a review item runs /huddle-review with its usual rules: merge when good, the «🔁 Changes requested» comment when not', () => {
  const t = flat(WATCH);
  assert.match(t, /`review`/);
  assert.match(t, /\/huddle-review/);
  assert.match(t, /approve and merge/i);
  assert.match(t, /🔁 Changes requested/);
  assert.match(t, /oldest first/i);
});

test('a decision or triage item is only reported, once per Issue, and never answered', () => {
  const t = flat(WATCH);
  assert.match(t, /`decision`/);
  assert.match(t, /`triage`/);
  assert.match(t, /never answered/i);
  assert.match(t, /waits for your decision/);
  assert.match(t, /once per Issue/i);
  assert.doesNotMatch(t, /\/huddle-decide/, 'it must not run the decision skill');
});

test('a review that stops is said once with its reason, and is not retried on the same head; a new commit is a new item', () => {
  const t = flat(WATCH);
  assert.match(t, /stops/i);
  assert.match(t, /once, with the reason/i);
  assert.match(t, /same `head`/);
  assert.match(t, /new commit/i);
  assert.match(t, /`head`/);
});

test('it has «Who does each step», and every command is in the full form, never a bare huddle', () => {
  assert.match(read(WATCH), /^## Who does each step/m);
  const rest = read(WATCH).replace(/node "\$\{CLAUDE_PLUGIN_ROOT\}\/bin\/huddle"/g, '<HUDDLE>');
  assert.doesNotMatch(rest, /bin\/huddle/);
  assert.doesNotMatch(rest, /\bhuddle (wait|take|doctor|labels|pending|hook|update|queue)\b/);
});

test('the docs say what the watch is and where it stops', () => {
  const design = read('docs/design.md');
  assert.match(design, /^## 19\. Watching what waits for the AI Manager/m);
  assert.match(design, /huddle-watch\/SKILL\.md/);
  for (const f of ['README.md', 'docs/team-guide.md', 'docs/roles.md']) assert.match(read(f), /\/huddle-watch/, f);
  assert.match(read('README.md'), /huddle queue/);
  assert.match(read('CHANGELOG.md').split('## [0.5.0]')[0], /huddle queue[\s\S]*\/huddle-watch|\/huddle-watch[\s\S]*huddle queue/);
});

// Issue #107: the first check runs right away, in the same turn.
const onSection = (text) => text.split(/## Each item/)[0];

test('on: the order is CronList, then CronCreate, then an immediate queue --json check', () => {
  const t = onSection(flat(WATCH));
  const list = t.indexOf('CronList');
  const create = t.indexOf('CronCreate');
  const check = t.search(/Check now/);
  const queue = t.indexOf(`${HUDDLE} queue --json`, check);
  assert.ok(list >= 0 && create > list, 'CronList before CronCreate');
  assert.ok(check > create, 'the check now comes after CronCreate');
  assert.ok(queue > check, 'the immediate queue --json comes after «Check now»');
});

test('the immediate check handles the items as a tick does and shares the stopped list', () => {
  const t = flat(WATCH);
  assert.match(t, /Check now:.*?as a tick does/);
  assert.match(t, /«Each item»/);
  assert.match(t, /same list is shared with the ticks/i);
  assert.match(t, /not tried again at the next tick/i);
});

test('the first check says «Nothing is waiting for the AI Manager.» but a tick stays silent when nothing waits', () => {
  const t = flat(WATCH);
  assert.match(t, /Nothing is waiting for the AI Manager\./);
  assert.match(t, /unlike a tick/i);
  assert.match(t, /if nothing waits, say nothing and stop/i);
});

test('the first message says the first check runs now and the next ones at the interval', () => {
  assert.match(flat(WATCH), /first check runs now and the next ones at the interval/i);
});

test('§19 says the same as the skill about the first check', () => {
  const d = flat('docs/design.md');
  const s19 = d.slice(d.indexOf('## 19. Watching'), d.indexOf('## 20.'));
  assert.match(s19, /Check now/);
  assert.match(s19, /Nothing is waiting for the AI Manager\./);
  assert.match(s19, /unlike a tick/i);
  assert.match(s19, /first check runs now and the next ones at the interval/i);
  assert.match(s19, /not tried again at the next tick/i);
});
