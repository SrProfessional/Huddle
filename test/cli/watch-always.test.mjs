// Issue #160: `/huddle-watch always` keeps the watch on in the Coach's sessions of a repo, on their machine only.
// `huddle queue --always` sets a mark next to the update cache; `--wait-off` clears it; the hook asks Claude to start the watch. Canned adapter only.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { run } from '../../lib/cli/run.mjs';
import { harness } from './harness.mjs';

const MANAGED = '## Depends on\n\nNone.\n';
function mk({ me = 'SrProfessional', setup } = {}) {
  const h = harness({ setup, wrap: (a) => ({ ...a, me: async () => me }) });
  h.ctx.updateCachePath = '/data/huddle-update.json';
  return h;
}
const hookOut = (h) => (h.text() ? JSON.parse(h.text()) : null);

test('--always sets the mark, the hook then asks Claude to start the watch, and --wait-off clears it', async () => {
  const h = mk();
  h.ctx.session = { tool: 'claude', id: 'coach-session' };
  assert.equal(await run(['role', 'coach'], h.ctx), 0);
  assert.equal(await run(['queue', '--always'], h.ctx), 0);
  h.out.length = 0;
  assert.equal(await run(['hook'], h.ctx), 0);
  const j = hookOut(h);
  assert.match(j.systemMessage, /the watch starts now, as you asked \(\/huddle-watch always\)/);
  assert.match(j.systemMessage, /\/huddle-watch off stops it/);
  assert.match(j.hookSpecificOutput.additionalContext, /before anything else, start the watch/i);
  assert.match(j.hookSpecificOutput.additionalContext, /\/huddle-watch/);
  h.out.length = 0;
  assert.equal(await run(['queue', '--wait-off'], h.ctx), 0);
  h.out.length = 0;
  assert.equal(await run(['hook'], h.ctx), 0);
  assert.doesNotMatch(h.text(), /watch starts now/);
});

test('another login cannot set it', async () => {
  const h = mk({ me: 'ana' });
  assert.equal(await run(['queue', '--always'], h.ctx), 1);
  assert.match(h.text(), /Coach only/);
});

test('a Player\'s session start never starts the watch, even with the mark on the machine', async () => {
  const boss = mk();
  await run(['queue', '--always'], boss.ctx);
  const dev = mk({ me: 'ana' });
  dev.ctx.writeFile = boss.ctx.writeFile;
  dev.ctx.readFile = boss.ctx.readFile; // same machine, same files
  assert.equal(await run(['hook'], dev.ctx), 0);
  assert.doesNotMatch(dev.text(), /watch starts now/);
});

test('no mark: the session start says nothing about the watch, and the line about what waits still shows', async () => {
  const h = mk({ setup: (w) => { w.issue({ number: 42, title: 'Add login form', body: MANAGED, assignees: ['ana'], reviews: [51] }); w.review({ number: 51 }); } });
  assert.equal(await run(['hook'], h.ctx), 0);
  assert.doesNotMatch(h.text(), /watch starts now/);
  assert.match(hookOut(h).systemMessage, /1 thing waits for the Coach/);
});

const skill = readFileSync(fileURLToPath(new URL('../../skills/huddle-watch/SKILL.md', import.meta.url)), 'utf8').replace(/\s+/g, ' ');

test('the watch skill has «always», sets it with queue --always, and off forgets it', () => {
  assert.match(skill, /\/huddle-watch always/);
  assert.ok(skill.includes('node "${CLAUDE_PLUGIN_ROOT}/bin/huddle" queue --always'));
  assert.match(skill, /off.*forgets «always»|forgets «always».*off/i);
  assert.match(skill, /this machine/);
});
