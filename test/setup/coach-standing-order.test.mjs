// Issue #175: the Coach's session merges a reviewed Issue PR/MR without stopping to ask. Claude Code confirms outward actions unless an
// authorization is written down for good, so the CLAUDE.md block says it as a standing order; /huddle-release still asks.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const read = (rel) => readFileSync(fileURLToPath(new URL(`../../${rel}`, import.meta.url)), 'utf8').replace(/\s+/g, ' ');

for (const f of ['templates/CLAUDE.huddle.md', 'CLAUDE.md']) {
  test(`${f}: «Standing orders of the Coach» names what needs no confirmation, and /huddle-release still asks`, () => {
    const t = read(f);
    assert.match(t, /### Standing orders of the Coach/);
    const s = t.slice(t.indexOf('### Standing orders of the Coach'));
    for (const re of [/need no confirmation/, /passed `\/huddle-review`/, /`huddle land`/, /`huddle labels`/, /`\/huddle-update`/, /`\/huddle-team`/]) assert.match(s, re, String(re));
    assert.match(s, /`\/huddle-release`.*still asks/);
  });
}

test('the review skill merges without asking, on the standing order', () => {
  const t = read('skills/huddle-review/SKILL.md');
  assert.match(t, /merge it yourself, now, without asking/);
  assert.match(t, /standing order/);
});

test('the play skill sends a Coach to /huddle-review right after the PR, and a Player still never merges', () => {
  const t = read('skills/huddle-play/SKILL.md');
  assert.ok(t.includes('If `node "${CLAUDE_PLUGIN_ROOT}/bin/huddle" doctor` says you are the Coach'));
  assert.match(t, /run `\/huddle-review` on that PR\/MR right away/);
  assert.match(t, /never merge/i);
});
