// Issue #166: the roles are Coach (was «AI Manager») and Player (was «developer»). Nothing a repo already has breaks: `ai_manager` still
// works as an alias of `coach`, and the old «changes requested from AI Manager» label is renamed once by the full labels run.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadConfig, coachOf } from '../../lib/cli/config.mjs';
import { run } from '../../lib/cli/run.mjs';
import { harness, CONFIG } from '../cli/harness.mjs';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const read = (rel) => readFileSync(path.join(ROOT, rel), 'utf8');
const configFrom = (data) => loadConfig('/r', () => JSON.stringify({ platform: 'github', project: 'a/b', ...data }));

test('coach is read; ai_manager still works; both different is an error; neither names both', () => {
  assert.equal(coachOf(configFrom({ coach: 'boss' })), 'boss');
  assert.equal(coachOf(configFrom({ ai_manager: 'boss' })), 'boss');
  assert.equal(coachOf(configFrom({ coach: 'boss', ai_manager: 'Boss' })), 'boss', 'the same login in both is fine');
  assert.throws(() => configFrom({ coach: 'boss', ai_manager: 'other' }), /"coach" and "ai_manager" name different logins/);
  assert.throws(() => configFrom({}), /"coach" is required \(or "ai_manager" in older repos\)/);
});

test('every command reads the coach from either key (the same session is the Coach)', async () => {
  const { ai_manager, ...rest } = CONFIG;
  const h = harness({ config: { ...rest, coach: ai_manager }, setup: (w) => w.issue({ number: 5, body: '## Depends on\n\n- None\n', assignees: ['ana'], labels: ['assigned'] }) });
  assert.equal(await run(['queue', '--always'], { ...h.ctx, updateCachePath: '/data/u.json' }), 0, 'the coach login passes the Coach-only check');
});

test('the full labels run renames the old «changes requested from AI Manager» label once, and reads both names until then', async () => {
  const h = harness({ setup: (w) => {
    w.issue({ number: 7, body: '## Depends on\n\n- None\n', assignees: ['ana'], labels: ['changes requested from AI Manager'], reviews: [70] });
    w.review({ number: 70 });
    w.repoLabel('changes requested from AI Manager');
  } });
  assert.equal(await run(['labels'], h.ctx), 0);
  assert.ok(!Object.keys(h.world.repoLabels()).includes('changes requested from AI Manager'), 'the old label is gone from the repo');
  assert.ok(Object.keys(h.world.repoLabels()).includes('changes requested from Coach'));
  assert.ok(!h.world.labelsOf(7).includes('changes requested from AI Manager'), 'the Issue no longer carries the old name');
});

/** The texts a person reads, without the history (released CHANGELOG sections, old smoke-test results). */
function texts() {
  const out = [];
  const walk = (dir) => {
    for (const name of readdirSync(path.join(ROOT, dir))) {
      const rel = path.join(dir, name);
      if (statSync(path.join(ROOT, rel)).isDirectory()) walk(rel);
      else if (/\.(md|html)$/.test(name)) out.push(rel.replaceAll('\\', '/'));
    }
  };
  for (const d of ['docs', 'site', 'skills', 'templates']) walk(d);
  return ['README.md', ...out].filter((f) => !/^docs\/(smoke-test|design)\.md$/.test(f));
}

test('no text a person reads says «AI Manager» any more (history aside)', () => {
  const hits = texts().filter((f) => /AI Manager/.test(read(f)));
  assert.deepEqual(hits, []);
  const smoke = read('docs/smoke-test.md').split(/^### Results/m)[0];
  assert.doesNotMatch(smoke, /AI Manager/, 'docs/smoke-test.md, before the results tables');
});

test('the CLAUDE.md block and the play skill say Player and Coach', () => {
  for (const f of ['templates/CLAUDE.huddle.md', 'skills/huddle-play/SKILL.md']) {
    assert.match(read(f), /\bPlayer\b/, f);
    assert.match(read(f), /\bCoach\b/, f);
  }
});

test('the website and the guide PDF source name /huddle-watch always (the content of #163)', () => {
  for (const f of ['site/how-it-works/index.html', 'docs/pdf/src/guide.html']) assert.match(read(f), /\/huddle-watch always/, f);
});
