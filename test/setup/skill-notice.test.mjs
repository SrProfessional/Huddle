// Issue #91, docs/design.md §20: /huddle-play and /huddle-update begin with `huddle notice` and say its text.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (f) => readFileSync(path.join(root, f), 'utf8');
const NOTICE = 'node "${CLAUDE_PLUGIN_ROOT}/bin/huddle" notice';

for (const name of ['huddle-play', 'huddle-update']) {
  test(`${name}: runs the notice first, in the full form, and says it as the first thing in the person's language`, () => {
    const t = read(`skills/${name}/SKILL.md`);
    assert.ok(t.includes(NOTICE), 'the full command');
    const head = t.search(/## (1\. )?(The )?version notice/i);
    const section = t.slice(head);
    assert.ok(head > 0, 'a «Version notice» section');
    assert.ok(head < t.search(/\n## (2\. The plugin|Which one is it|Start an Issue|Continue an Issue|Run the command first)/), 'before the work');
    assert.match(section, /in (the person's|their) language/i);
    assert.match(section, /first thing/i);
    assert.match(section, /never (stops|asks)/i);
    assert.match(section, /prints nothing[^.]*(say nothing|nothing about versions)/i);
  });

  test(`${name}: no bare huddle notice`, () => {
    const t = read(`skills/${name}/SKILL.md`).split(NOTICE).join('<HUDDLE>');
    assert.doesNotMatch(t, /\bhuddle notice\b/);
  });
}
