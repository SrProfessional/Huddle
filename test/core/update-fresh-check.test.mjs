// Issue #136: /huddle-update always gets the newest Huddle. A cached «latest» older than the installed plugin is stale,
// `doctor` looks up fresh, and the update skill always updates the plugin in the scope where it is installed.
// The release endpoint and the clock are fakes: no test touches the network.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { latestRelease, versionCheck, skillNotice, sessionNotice } from '../../lib/core/update.mjs';

const HOUR = 60 * 60 * 1000;
const T0 = Date.parse('2026-11-14T21:30:00Z');
const ROOT = '/plugins/cache/huddle/huddle/0.8.0';
const CACHE = '/data/huddle-update.json';

/** A ctx with a fake fetch (`answer`: a tag, or 'offline'), a fake clock and an in-memory cache file. */
function makeCtx({ answer = 'v0.8.1', installed = '0.8.0', cache = null } = {}) {
  const files = new Map();
  files.set(`${ROOT}/.claude-plugin/plugin.json`, JSON.stringify({ version: installed }));
  if (cache) files.set(CACHE, JSON.stringify(cache));
  const calls = [];
  const fetch = async (url) => {
    calls.push(String(url));
    if (answer === 'offline') throw new TypeError('fetch failed');
    return { ok: true, status: 200, json: async () => ({ tag_name: answer, prerelease: false }) };
  };
  const ctx = {
    fetch,
    now: () => new Date(T0),
    readFile: (p) => (files.has(p) ? files.get(p) : null),
    writeFile: (p, t) => files.set(p, t),
    pluginRoot: ROOT,
    updateCachePath: CACHE,
    pluginInstalled: true,
    updateTimeoutMs: 50,
  };
  return { ctx, calls, cache: () => JSON.parse(files.get(CACHE) ?? '{}') };
}

test('the incident: a cache from this morning saying 0.7.0, installed 0.8.0, GitHub says 0.8.1 -> 0.8.1, and the cache is renewed', async () => {
  const t = makeCtx({ cache: { checkedAt: T0 - 8 * HOUR, latest: '0.7.0' } });
  assert.equal(await latestRelease(t.ctx), '0.8.1');
  assert.equal(t.calls.length, 1);
  assert.equal(t.cache().latest, '0.8.1');
});

test('a stale cache and a failed lookup: the cached answer, which claims nothing newer', async () => {
  const t = makeCtx({ answer: 'offline', cache: { checkedAt: T0 - 8 * HOUR, latest: '0.7.0' } });
  assert.equal(await latestRelease(t.ctx), '0.7.0');
  assert.equal(t.calls.length, 1);
});

test('a cache equal to or newer than the installed version, under 24 hours old: no lookup', async () => {
  for (const latest of ['0.8.0', '0.8.1']) {
    const t = makeCtx({ cache: { checkedAt: T0 - 8 * HOUR, latest } });
    assert.equal(await latestRelease(t.ctx), latest);
    assert.equal(t.calls.length, 0, latest);
  }
});

test('{ fresh: true } looks up even with a valid cache, and falls back to the cached answer when the lookup fails', async () => {
  const t = makeCtx({ answer: 'v0.8.2', cache: { checkedAt: T0 - HOUR, latest: '0.8.1' } });
  assert.equal(await latestRelease(t.ctx, { fresh: true }), '0.8.2');
  assert.equal(t.calls.length, 1);
  assert.equal(t.cache().latest, '0.8.2');
  const off = makeCtx({ answer: 'offline', cache: { checkedAt: T0 - HOUR, latest: '0.8.1' } });
  assert.equal(await latestRelease(off.ctx, { fresh: true }), '0.8.1');
  assert.equal(off.calls.length, 1);
});

test('doctor looks up fresh: a release made after this morning\'s check shows at once', async () => {
  const t = makeCtx({ installed: '0.8.0', cache: { checkedAt: T0 - HOUR, latest: '0.8.0' } });
  const line = await versionCheck(t.ctx);
  assert.equal(line.mark, '⚠');
  assert.match(line.detail, /latest is 0\.8\.1/);
  assert.equal(t.calls.length, 1);
});

test('the daily notices keep the 24-hour cache when it is valid', async () => {
  const t = makeCtx({ answer: 'v0.8.2', cache: { checkedAt: T0 - HOUR, latest: '0.8.1' } });
  const skill = await skillNotice(t.ctx, async () => false);
  assert.equal(skill.latest, '0.8.1');
  await sessionNotice(t.ctx, async () => false);
  assert.equal(t.calls.length, 0);
});

const skill = readFileSync(fileURLToPath(new URL('../../skills/huddle-update/SKILL.md', import.meta.url)), 'utf8');
const step2 = skill.slice(skill.indexOf('## 2.'), skill.indexOf('## 3.'));

test('the update skill always updates the plugin, in the scope read from claude plugin list --json', () => {
  assert.doesNotMatch(step2, /If a newer Huddle exists/);
  assert.match(step2, /[Aa]lways run `claude plugin marketplace update huddle`/);
  assert.match(step2, /claude plugin list --json/);
  assert.match(step2, /projectPath/);
  assert.match(step2, /--scope project/);
  assert.match(step2, /--scope user/);
  assert.match(step2, /claude plugin update huddle@huddle --scope <scope>/);
  assert.match(step2, /\/huddle-setup/);
});
