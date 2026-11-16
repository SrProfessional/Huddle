// Issue #88, docs/design.md §19: `/huddle-watch` lets the Coach's session check what waits and review it. Since Issue #157 it waits in
// the background (`huddle queue --wait`) with no Claude tokens while nothing waits, instead of a recurring job. The skill is tested as text.
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

test('it is for the Coach only: doctor first, and a clear stop for anyone else', () => {
  const t = flat(WATCH);
  assert.match(t, /For the Coach only/);
  assert.ok(t.indexOf(`${HUDDLE} doctor`) > 0);
  assert.match(t, /`coach`/);
  assert.match(t, /stop/i);
});

test('on: no second watch, the check now, then the background wait with the interval in seconds (Issue #157)', () => {
  const t = flat(WATCH);
  assert.match(t, /already on/i);
  assert.match(t, /do \*\*not\*\* start a second/i);
  assert.match(t, /default 5 minutes/i);
  assert.match(t, /2 to 60/);
  const check = t.search(/\*\*Check now:\*\*/);
  const queue = t.indexOf(`${HUDDLE} queue --json`, check);
  const wait = t.indexOf(`${HUDDLE} queue --wait <seconds> --seen <keys>`, queue);
  assert.ok(check > 0 && queue > check && wait > queue, 'check now, then queue --json, then the background wait');
  assert.match(t, /in the background/i);
  assert.match(t, /`5m` is `300`/);
});

test('it uses no recurring job, never expires after 7 days, and says it uses no Claude tokens while nothing waits', () => {
  const t = flat(WATCH);
  assert.doesNotMatch(t, /CronCreate|CronList|CronDelete|7 days/);
  assert.match(t, /no Claude tokens while nothing waits/i);
  assert.match(t, /Nothing turns it on by itself/);
});

test('the first message says that turning it on is the order to review and merge, and what stops it', () => {
  const t = flat(WATCH);
  assert.match(t, /turning the watch on is the Coach's order to review and merge/i);
  assert.match(t, /as if (they|you) asked for each review/i);
  assert.match(t, /\/huddle-watch off/);
  assert.match(t, /closing Claude Code/i);
  assert.match(t, /lives only in the session/i);
  assert.match(t, /session open/i);
});

test('when the wait ends: the new items are handled and the wait starts again; stopped means off', () => {
  const t = flat(WATCH);
  assert.match(t, /\{ "waiting": \[\.\.\.\] \}/);
  assert.match(t, /start the wait again/i);
  assert.match(t, /\{ "stopped": true \}/);
  assert.match(t, /`<pr>@<head>`/);
  assert.match(t, /`#<issue>`/);
});

test('off runs queue --wait-off and stops the background command; status says whether it runs and its interval', () => {
  const t = flat(WATCH);
  assert.ok(t.includes(`${HUDDLE} queue --wait-off`));
  assert.match(t, /Nothing running: say so/);
  assert.match(t, /\/huddle-watch status/);
  assert.match(t, /interval/i);
});

test('the check now says «Nothing is waiting for the Coach.» when empty', () => {
  assert.match(flat(WATCH), /Nothing is waiting for the Coach\./);
});

test('a review item runs /huddle-review with its usual rules: merge when good, the «🔁 Changes requested» comment when not', () => {
  const t = flat(WATCH);
  assert.match(t, /`review`/);
  assert.match(t, /\/huddle-review/);
  assert.match(t, /approve and merge/i);
  assert.match(t, /🔁 Changes requested/);
  assert.match(t, /oldest first/i);
});

test('a triage item is only reported; a decision is answered when technical (Issue #189), only reported when it is a product question', () => {
  const t = flat(WATCH);
  assert.match(t, /`decision`/);
  assert.match(t, /`triage`/);
  assert.match(t, /never answered/i);
  assert.match(t, /waits for your decision/);
  assert.match(t, /once per Issue/i);
  assert.match(t, /technical, answer it as `\/huddle-decide` does/);
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
  assert.match(design, /^## 19\. Watching what waits for the Coach/m);
  assert.match(design, /huddle-watch\/SKILL\.md/);
  for (const f of ['README.md', 'docs/team-guide.md', 'docs/roles.md']) assert.match(read(f), /\/huddle-watch/, f);
  assert.match(read('README.md'), /huddle queue/);
  assert.match(read('CHANGELOG.md').split('## [0.5.0]')[0], /huddle queue[\s\S]*\/huddle-watch|\/huddle-watch[\s\S]*huddle queue/);
});

test('§19 says the watch waits in the background with queue --wait, and keeps the check now', () => {
  const d = flat('docs/design.md');
  const s19 = d.slice(d.indexOf('## 19. Watching'), d.indexOf('## 20.'));
  assert.match(s19, /queue --wait/);
  assert.match(s19, /--wait-off/);
  assert.match(s19, /no Claude tokens/i);
  assert.match(s19, /Check now/);
  assert.match(s19, /Nothing is waiting for the Coach\./);
  assert.doesNotMatch(s19, /expires after 7 days/);
});
