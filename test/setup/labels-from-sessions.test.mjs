// docs/design.md §22 (H51): the sessions keep the board right with `huddle labels --issue <n>` at each step. The skills are text the session follows, so they are tested as text.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (rel) => readFileSync(new URL(`../../${rel}`, import.meta.url), 'utf8');
const flat = (rel) => read(rel).replace(/\s+/g, ' ');
const HUDDLE = 'node "${CLAUDE_PLUGIN_ROOT}/bin/huddle"';
const ISSUE_CMD = `${HUDDLE} labels --issue <n>`;
const SKILLS = ['play', 'review', 'decide', 'watch'].map((s) => `skills/huddle-${s}/SKILL.md`);

// Index of `needle` at or after `from`; fails the test with a clear message when it is missing.
function at(text, needle, from = 0, what = needle) {
  const i = text.indexOf(needle, from);
  assert.ok(i >= 0, `missing «${what}» after position ${from}`);
  return i;
}

test('every skill is best effort for labels and never blocks', () => {
  for (const f of SKILLS) {
    const t = flat(f);
    assert.ok(t.includes('labels'), `${f} names the labels command`);
    assert.match(t, /best effort/i, `${f} says best effort`);
    assert.match(t, /never (stop|block)s?/i, `${f} says it never blocks`);
    assert.match(t, /never asks/i, `${f} says it never asks`);
  }
});

test('huddle-play runs labels --issue after the branch and label, the PR, the decision comment and «Ready for review again»', () => {
  const t = flat('skills/huddle-play/SKILL.md');
  assert.ok(t.includes(ISSUE_CMD));
  const start = at(t, '## Start an Issue');
  const branch = at(t, '`in progress` label', start);
  const l1 = at(t, 'labels --issue', branch, 'labels after the branch');
  const pr = at(t, 'Open the PR/MR', l1);
  const l2 = at(t, 'labels --issue', pr, 'labels after the PR is opened');
  assert.ok(l1 < pr && pr < l2);
  const cont = at(t, '## Continue an Issue');
  const take = at(t, 'huddle" take <n>', cont);
  const l3 = at(t, 'labels --issue', take, 'labels after take');
  const ready = at(t, '«Ready for review again»', l3);
  const l4 = at(t, 'labels --issue', ready, 'labels after Ready for review again');
  assert.ok(take < l3 && l3 < ready && ready < l4);
  const stop = at(t, '## When you cannot go on');
  const dec = at(t, '`needs decision` label', stop);
  const l5 = at(t, 'labels --issue', dec, 'labels after the decision comment');
  assert.ok(dec < l5);
});

test('huddle-play and huddle-decide never say to assign, and play keeps «do not edit labels by hand»', () => {
  for (const f of ['skills/huddle-play/SKILL.md', 'skills/huddle-decide/SKILL.md']) {
    assert.doesNotMatch(flat(f), /(?<!never |not |only the AI Manager )\bassign(s)? (it|the|an|a|them)\b/i, `${f} must not tell to assign`);
  }
  const play = flat('skills/huddle-play/SKILL.md');
  assert.match(play, /never assigns/i);
  assert.match(play, /not edit (a Huddle|the) label|never edit(s)? a Huddle label|do not touch/i);
});

test('huddle-decide runs labels --issue after the answer, which takes needs decision off', () => {
  const t = flat('skills/huddle-decide/SKILL.md');
  assert.ok(t.includes(ISSUE_CMD));
  assert.doesNotMatch(t, /Do not change labels/);
  assert.doesNotMatch(t, /the labels job takes `needs decision` off/);
  const post = at(t, 'Post the answer');
  const l = at(t, 'labels --issue', post);
  assert.ok(post < l);
  assert.match(t.slice(l), /needs decision/);
});

test('huddle-review runs labels --issue after the changes comment and after the merge (land first with staging)', () => {
  const t = flat('skills/huddle-review/SKILL.md');
  assert.ok(t.includes(ISSUE_CMD));
  const ch = at(t, '## Changes needed');
  const c = at(t, 'labels --issue', ch, 'labels after Changes requested');
  assert.ok(c < at(t, '## All good'));
  const good = at(t, '## All good');
  const merge = at(t, 'gh pr merge --merge', good);
  const land = at(t, 'huddle" land <pr>`, then', merge, 'land before labels');
  const m = at(t, 'labels --issue', land, 'labels after the merge');
  assert.ok(merge < land && land < m);
  assert.match(t.slice(m, m + 400), /assign/i);
  assert.match(t, /only the AI Manager/i);
});

test('huddle-watch runs the full labels before queue --json, in each tick and in the first check', () => {
  const t = flat('skills/huddle-watch/SKILL.md');
  const FULL = `${HUDDLE} labels\``;
  assert.ok(t.includes(FULL), 'the full labels command appears');
  const on = at(t, '## On');
  const step2 = at(t, 'CronCreate', on);
  const tick = t.slice(step2, at(t, 'Your first message', step2));
  assert.ok(tick.indexOf('labels`') >= 0 && tick.indexOf('labels`') < tick.indexOf('queue --json'), 'tick: labels before queue');
  const check = at(t, '**Check now:**', on);
  const checkEnd = at(t, '## Each item', check);
  const checkText = t.slice(check, checkEnd);
  assert.ok(checkText.indexOf('labels`') >= 0 && checkText.indexOf('labels`') < checkText.indexOf('queue --json'), 'first check: labels before queue');
  assert.match(t, /at most once per tick/i);
  assert.match(t, /queue is read anyway|read the queue anyway/i);
});

test('the CLAUDE.md block names the command, who runs it, and keeps «nobody edits a Huddle label by hand»', () => {
  const t = flat('templates/CLAUDE.huddle.md');
  assert.ok(t.includes('huddle labels --issue <n>'));
  assert.match(t, /safety net/i);
  assert.match(t, /never edit(s)? a Huddle label by hand|nobody puts it or takes it off by hand/i);
  assert.match(t, /best effort/i);
});

test('design §22 and §19, the team guide and the changelog say it', () => {
  const d = flat('docs/design.md');
  const s22 = d.slice(at(d, '## 22. The labels of one Issue'));
  assert.match(s22, /who runs it and when/i);
  assert.match(s22, /safety net/i);
  const s19 = d.slice(at(d, '## 19. Watching what waits'), at(d, '## 20. The version notice'));
  assert.match(s19, /full `huddle labels` first|runs the full `huddle labels`/);
  assert.match(flat('docs/team-guide.md'), /permission to edit labels/i);
  assert.match(flat('CHANGELOG.md').slice(0, 6000), /H51|Issue #120/);
});
