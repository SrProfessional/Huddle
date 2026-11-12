import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// A text about installing or updating the plugin must not say «new session» unless it also says /reload-plugins or «restart».
const root = new URL('../../', import.meta.url);
const files = [
  'README.md', 'docs/first-day.md', 'docs/team-guide.md', 'docs/smoke-test.md', 'skills/huddle-setup/SKILL.md', 'skills/huddle-team/SKILL.md',
  'skills/huddle-update/SKILL.md', 'docs/pdf/src/guide.html', 'docs/pdf/src/first-day.section.html', 'site/get-started/index.html', 'site/index.html',
  'lib/core/update.mjs', 'lib/cli/run.mjs', 'lib/setup/index.mjs',
];

for (const f of files) {
  test(`${f}: no «new session» after installing or updating the plugin without /reload-plugins or restart`, () => {
    const text = readFileSync(fileURLToPath(new URL(f, root)), 'utf8');
    const lines = text.split('\n');
    lines.forEach((line, i) => {
      if (/^\|/.test(line) && f === 'docs/smoke-test.md') return; // the old «Results» tables are history
      if (!/new session/i.test(line)) return;
      const near = lines.slice(Math.max(0, i - 2), i + 3).join(' ');
      if (!/(install|update|plugin)/i.test(near)) return;
      assert.match(near, /\/reload-plugins|restart/i, `${f}:${i + 1}: ${line.trim().slice(0, 140)}`);
    });
  });
}
