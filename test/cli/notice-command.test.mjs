// Issue #91, docs/design.md §20: `huddle notice [--json]` says the «newer Huddle» notice from inside a skill, with its own daily timestamp.
import test from 'node:test';
import assert from 'node:assert/strict';
import { run } from '../../lib/cli/run.mjs';
import { skillNotice } from '../../lib/core/update.mjs';
import { harness, fakeNow } from './harness.mjs';

const DAY = 24 * 60 * 60 * 1000;
const T0 = Date.parse('2026-11-10T09:00:00Z');
const ROOT = '/plugins/cache/huddle/huddle/0.3.0';
const CACHE = '/data/huddle-update.json';
const WRITES = new Set(['setLabels', 'ensureLabels', 'assign', 'merge', 'postComment', 'editComment', 'markTaken', 'createIssue', 'updateIssue', 'closeIssue', 'pinIssue', 'createMilestone', 'updateMilestone', 'setIssueMilestone']);

function fakeFetch(answer) {
  const calls = [];
  const fn = async (url) => {
    calls.push(String(url));
    if (answer === 'offline') throw new TypeError('fetch failed');
    return { ok: true, status: 200, json: async () => ({ tag_name: answer.tag, prerelease: false }) };
  };
  fn.calls = calls;
  return fn;
}

function mk({ answer = { tag: 'v0.4.0' }, installed = '0.3.0', me = 'ana', cache, now = T0 } = {}) {
  const writes = [];
  const wrap = (a) => new Proxy({ ...a, me: async () => { if (me instanceof Error) throw me; return me; } }, {
    get: (t, op) => (WRITES.has(op) ? async () => { writes.push(op); throw new Error(`notice called ${String(op)}`); } : t[op]),
  });
  const h = harness({ wrap });
  const state = { now };
  const fetch = fakeFetch(answer);
  Object.assign(h.ctx, { fetch, now: fakeNow(() => state.now), pluginRoot: ROOT, updateCachePath: CACHE, pluginInstalled: true, updateTimeoutMs: 30 });
  const files = { [`${ROOT}/.claude-plugin/plugin.json`]: JSON.stringify({ version: installed }) };
  if (cache) files[CACHE] = JSON.stringify(cache);
  h.ctx.readFile = ((read) => (p) => files[p.replaceAll('\\', '/')] ?? read(p))(h.ctx.readFile);
  h.ctx.writeFile = (p, text) => { files[p.replaceAll('\\', '/')] = text; h.writes.push(p.replaceAll('\\', '/')); };
  return { h, state, fetch, writes, cacheNow: () => JSON.parse(files[CACHE] ?? '{}') };
}

test('notice prints the text when a newer release exists, and nothing the second time within 24 hours', async () => {
  const { h, state } = mk();
  assert.equal(await run(['notice'], h.ctx), 0);
  assert.match(h.text(), /Huddle 0\.4\.0 is available \(you have 0\.3\.0\)/);
  assert.match(h.text(), /claude plugin update huddle@huddle/);
  assert.match(h.text(), /releases\/tag\/v0\.4\.0/);
  h.out.length = 0;
  state.now = T0 + 3600_000;
  assert.equal(await run(['notice'], h.ctx), 0);
  assert.equal(h.text(), '');
  h.out.length = 0;
  state.now = T0 + DAY + 1000;
  await run(['notice'], h.ctx);
  assert.match(h.text(), /is available/, 'the next day it shows again');
});

test('notice --json has the documented shape', async () => {
  const { h } = mk();
  assert.equal(await run(['notice', '--json'], h.ctx), 0);
  const j = JSON.parse(h.text());
  assert.deepEqual(Object.keys(j).sort(), ['installed', 'latest', 'show', 'text']);
  assert.equal(j.show, true);
  assert.equal(j.installed, '0.3.0');
  assert.equal(j.latest, '0.4.0');
  assert.match(j.text, /Huddle 0\.4\.0 is available/);
  h.out.length = 0;
  await run(['notice', '--json'], h.ctx);
  const again = JSON.parse(h.text());
  assert.deepEqual(again, { show: false, installed: '0.3.0', latest: '0.4.0', text: null });
});

test('notice --json with nothing newer: show false, latest and text null', async () => {
  const { h } = mk({ answer: { tag: 'v0.3.0' } });
  assert.equal(await run(['notice', '--json'], h.ctx), 0);
  assert.deepEqual(JSON.parse(h.text()), { show: false, installed: '0.3.0', latest: null, text: null });
});

test('notice is silent with exit 0 offline, and with an unreadable installed version', async () => {
  const off = mk({ answer: 'offline' });
  assert.equal(await run(['notice'], off.h.ctx), 0);
  assert.equal(off.h.text(), '');
  const bad = mk({ installed: 'garbage' });
  assert.equal(await run(['notice'], bad.h.ctx), 0);
  assert.equal(bad.h.text(), '');
  const json = mk({ answer: 'offline' });
  assert.equal(await run(['notice', '--json'], json.h.ctx), 0);
  assert.equal(JSON.parse(json.h.text()).show, false);
});

test('the AI Manager\'s extra line only for the AI Manager; a failed login is a developer', async () => {
  const dev = mk({ me: 'ana' });
  await run(['notice'], dev.h.ctx);
  assert.doesNotMatch(dev.h.text(), /huddle-update/);
  const mgr = mk({ me: 'SrProfessional' });
  await run(['notice'], mgr.h.ctx);
  assert.match(mgr.h.text(), /Huddle 0\.4\.0 is available/);
  assert.match(mgr.h.text(), /run \/huddle-update in each repo/);
  const out = mk({ me: new Error('not logged in') });
  assert.equal(await run(['notice'], out.h.ctx), 0);
  assert.match(out.h.text(), /is available/);
  assert.doesNotMatch(out.h.text(), /huddle-update/);
});

test('a bad flag is exit 2', async () => {
  for (const args of [['notice', '--nope'], ['notice', 'x'], ['notice', '--json', '--json2']]) {
    const { h } = mk();
    assert.equal(await run(args, h.ctx), 2, args.join(' '));
    assert.match(h.errText(), /Usage: huddle/);
  }
});

test('notice makes no write other than the cache file', async () => {
  const { h, writes } = mk({ me: 'SrProfessional' });
  await run(['notice'], h.ctx);
  assert.deepEqual(writes, []);
  assert.ok(h.writes.length > 0);
  assert.ok(h.writes.every((p) => p === CACHE), h.writes.join(','));
});

test('skillNotice writes only skillShownAt: the hook\'s shownAt stays; it shows even when shownAt is today', async () => {
  const shownAt = T0 - 1000;
  const { h, cacheNow } = mk({ cache: { checkedAt: T0 - 500, latest: '0.4.0', shownAt } });
  const r = await skillNotice(h.ctx, async () => false);
  assert.equal(r.show, true);
  assert.equal(cacheNow().shownAt, shownAt);
  assert.equal(cacheNow().skillShownAt, T0);
});

test('skillNotice: the hook never reads skillShownAt, so a notice the skills showed does not silence the hook', async () => {
  const { h } = mk({ cache: { checkedAt: T0 - 500, latest: '0.4.0', skillShownAt: T0 - 1000 } });
  await run(['hook'], h.ctx);
  assert.match(h.text(), /is available/);
});

test('skillNotice does not show for the same or an older release, with no answer or an unreadable version', async () => {
  for (const opts of [{ answer: { tag: 'v0.3.0' } }, { answer: { tag: 'v0.2.0' } }, { answer: 'offline' }, { installed: 'junk' }]) {
    const { h } = mk(opts);
    const r = await skillNotice(h.ctx, async () => false);
    assert.equal(r.show, false, JSON.stringify(opts));
    assert.equal(r.text, null);
  }
});

test('the update steps name the project scope: Huddle is installed per project; a clone is pulled', async () => {
  const { h } = mk();
  await run(['notice'], h.ctx);
  assert.match(h.text(), /claude plugin update huddle@huddle --scope project/);
  const doc = mk({ cache: {} });
  await run(['doctor'], doc.h.ctx); // its exit code depends on the labels of the fake repo, not on this line
  assert.match(doc.h.text(), /claude plugin update huddle@huddle --scope project/);
  const clone = mk();
  clone.h.ctx.pluginInstalled = false;
  await run(['notice'], clone.h.ctx);
  assert.doesNotMatch(clone.h.text(), /--scope/);
});
