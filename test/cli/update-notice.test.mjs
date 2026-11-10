// Issue #65: the once-a-day «newer Huddle» notice in the SessionStart hook, and doctor's version line.
// The GitHub release endpoint and the clock are fakes: no test touches the network.
import test from 'node:test';
import assert from 'node:assert/strict';
import { run } from '../../lib/cli/run.mjs';
import { isNewer, parseVersion } from '../../lib/core/update.mjs';
import { harness } from './harness.mjs';

const DAY = 24 * 60 * 60 * 1000;
const T0 = Date.parse('2026-11-10T09:00:00Z');
const ROOT = '/plugins/cache/huddle/huddle/0.3.0';
const CACHE = '/data/huddle-update.json';
const LABELS = ['ready', 'assigned', 'in progress', 'in review', 'blocked', 'needs decision', 'changes requested from AI Manager'];
const wrap = (a) => ({ ...a, listLabels: async () => LABELS });

/** A fake `fetch` for the releases/latest endpoint. `answer` is a release, or { status }, or { raw }, or 'hang' / 'offline'. */
function fakeFetch(answer) {
  const calls = [];
  const fn = async (url, opts) => {
    calls.push({ url: String(url), opts });
    if (answer === 'offline') throw new TypeError('fetch failed');
    if (answer === 'hang') return new Promise(() => {});
    if (answer.status) return { ok: false, status: answer.status, json: async () => ({}) };
    if (answer.raw !== undefined) return { ok: true, status: 200, json: async () => JSON.parse(answer.raw) };
    return { ok: true, status: 200, json: async () => ({ tag_name: answer.tag, prerelease: answer.prerelease ?? false }) };
  };
  fn.calls = calls;
  return fn;
}

function setupUpdate(h, { answer = { tag: 'v0.4.0' }, installed = '0.3.0', clone = false, now = T0 } = {}) {
  const state = { now };
  const fetch = fakeFetch(answer);
  h.ctx.fetch = fetch;
  h.ctx.now = () => state.now;
  h.ctx.pluginRoot = ROOT;
  h.ctx.updateCachePath = CACHE;
  h.ctx.pluginInstalled = !clone;
  h.ctx.updateTimeoutMs = 30;
  h.ctx.readFile = ((read) => (p) => (p.replaceAll('\\', '/') === `${ROOT}/.claude-plugin/plugin.json` ? JSON.stringify({ version: installed }) : read(p)))(h.ctx.readFile);
  return { state, fetch };
}
const hookJson = (h) => JSON.parse(h.text());
const visible = (h) => (h.text() ? hookJson(h).systemMessage ?? '' : '');
const context = (h) => (h.text() ? hookJson(h).hookSpecificOutput?.additionalContext ?? '' : '');

test('semver: newer only for a higher release; a pre-release never counts', () => {
  assert.deepEqual(parseVersion('v0.4.0'), { core: [0, 4, 0], pre: false });
  assert.equal(parseVersion('nonsense'), null);
  assert.equal(isNewer('0.4.0', '0.3.0'), true);
  assert.equal(isNewer('v0.10.0', '0.9.9'), true);
  assert.equal(isNewer('0.3.0', '0.3.0'), false);
  assert.equal(isNewer('0.2.0', '0.3.0'), false);
  assert.equal(isNewer('0.5.0-rc.1', '0.3.0'), false);
  assert.equal(isNewer('garbage', '0.3.0'), false);
  assert.equal(isNewer('0.4.0', 'garbage'), false);
});

test('hook shows the notice when the latest release is newer, with the two commands and the release link', async () => {
  const h = harness({ wrap: (a) => ({ ...a, me: async () => 'ana' }) }); // a developer: no AI Manager line
  const u = setupUpdate(h);
  assert.equal(await run(['hook'], h.ctx), 0);
  assert.equal(u.fetch.calls[0].url, 'https://api.github.com/repos/SrProfessional/Huddle/releases/latest');
  assert.equal(u.fetch.calls[0].opts.headers?.Authorization, undefined, 'unauthenticated');
  for (const text of [visible(h), context(h)]) {
    assert.match(text, /Huddle 0\.4\.0 is available \(you have 0\.3\.0\)/);
    assert.match(text, /claude plugin marketplace update huddle/);
    assert.match(text, /claude plugin update huddle@huddle/);
    assert.match(text, /https:\/\/github\.com\/SrProfessional\/Huddle\/releases\/tag\/v0\.4\.0/);
  }
  assert.match(context(h), /first thing in your first answer/i);
  assert.match(context(h), /in (the person's|their) language/i);
  assert.doesNotMatch(visible(h) + context(h), /huddle-setup/, 'the extra line is for the AI Manager only');
});

test('hook keeps the pending-request message and adds the notice to it', async () => {
  const h = harness({ setup: (w) => { w.issue({ number: 5, assignees: ['SrProfessional'], labels: ['in progress'] }); w.comment(5, { id: 401, author: 'SrProfessional', createdAt: '2026-11-05T10:00:00Z', body: '## Prompt for Claude Code\n\n```text\nx\n```' }); } });
  setupUpdate(h);
  await run(['hook'], h.ctx);
  assert.match(context(h), /Issue #5/);
  assert.match(context(h), /Huddle 0\.4\.0 is available/);
});

test('hook says nothing when the release is equal, older or a pre-release', async () => {
  for (const answer of [{ tag: 'v0.3.0' }, { tag: 'v0.2.0' }, { tag: 'v0.5.0-rc.1' }, { tag: 'v0.5.0', prerelease: true }]) {
    const h = harness();
    setupUpdate(h, { answer });
    assert.equal(await run(['hook'], h.ctx), 0);
    assert.equal(h.text(), '', JSON.stringify(answer));
  }
});

test('the notice appears at most once a day; the release is looked up at most once a day', async () => {
  const h = harness();
  const u = setupUpdate(h);
  await run(['hook'], h.ctx);
  assert.match(visible(h), /is available/);
  h.out.length = 0;
  u.state.now = T0 + 3600_000;
  await run(['hook'], h.ctx);
  assert.equal(h.text(), '', 'a second session within the day is quiet');
  assert.equal(u.fetch.calls.length, 1, 'and does not call GitHub again');
  u.state.now = T0 + DAY + 1000;
  await run(['hook'], h.ctx);
  assert.match(visible(h), /is available/, 'the next day it shows again');
  assert.equal(u.fetch.calls.length, 2);
});

test('hook stays silent on a timeout, an HTTP error, bad JSON and no network, and never errors', async () => {
  for (const answer of ['hang', { status: 403 }, { status: 500 }, { raw: '{oops' }, { raw: '{}' }, 'offline']) {
    const h = harness();
    setupUpdate(h, { answer });
    const started = Date.now();
    assert.equal(await run(['hook'], h.ctx), 0);
    assert.ok(Date.now() - started < 1500, 'never delays the hook beyond its own timeout');
    assert.equal(h.text(), '', String(answer?.status ?? answer?.raw ?? answer));
    assert.equal(h.errText(), '');
  }
});

test('a failed lookup does not hide the notice for a release that is cached', async () => {
  const h = harness();
  setupUpdate(h);
  h.ctx.writeFile(CACHE, JSON.stringify({ checkedAt: T0 - DAY - 1000, latest: '0.4.0' }));
  h.ctx.fetch = fakeFetch('offline');
  await run(['hook'], h.ctx);
  assert.match(visible(h), /Huddle 0\.4\.0 is available/, 'the old answer is better than none');
});

test('for the AI Manager login the notice adds the /huddle-setup line; a developer does not get it', async () => {
  const manager = harness();
  setupUpdate(manager);
  await run(['hook'], manager.ctx);
  for (const text of [visible(manager), context(manager)]) assert.match(text, /After updating, run \/huddle-setup on a branch in each repo to get the new templates\./);
  const dev = harness({ wrap: (a) => ({ ...a, me: async () => 'ana' }) });
  setupUpdate(dev);
  await run(['hook'], dev.ctx);
  assert.match(visible(dev), /is available/);
  assert.doesNotMatch(visible(dev) + context(dev), /huddle-setup/);
});

test('running from a clone, the notice says to pull the clone instead of the two commands', async () => {
  const h = harness();
  setupUpdate(h, { clone: true });
  await run(['hook'], h.ctx);
  for (const text of [visible(h), context(h)]) {
    assert.match(text, /pull your clone/i);
    assert.doesNotMatch(text, /claude plugin update/);
    assert.match(text, /releases\/tag\/v0\.4\.0/);
  }
});

test('hook does nothing about updates when the installed version cannot be read', async () => {
  const h = harness();
  const u = setupUpdate(h);
  h.ctx.pluginRoot = '/nowhere';
  await run(['hook'], h.ctx);
  assert.equal(h.text(), '');
  assert.equal(u.fetch.calls.length, 0);
});

test('doctor «version» line: latest, behind with the two commands, and could not check (a warning, not a failure)', async () => {
  const latest = harness({ wrap });
  setupUpdate(latest, { installed: '0.4.0' });
  assert.equal(await run(['doctor'], latest.ctx), 0);
  assert.match(latest.text(), /✔ version: huddle 0\.4\.0 \(latest\)/);

  const behind = harness({ wrap });
  setupUpdate(behind);
  assert.equal(await run(['doctor'], behind.ctx), 0);
  assert.match(behind.text(), /⚠ version: huddle 0\.3\.0, latest is 0\.4\.0/);
  assert.match(behind.text(), /claude plugin marketplace update huddle/);
  assert.match(behind.text(), /claude plugin update huddle@huddle/);

  const offline = harness({ wrap });
  setupUpdate(offline, { answer: 'offline' });
  assert.equal(await run(['doctor'], offline.ctx), 0);
  assert.match(offline.text(), /⚠ version: could not check the latest release/);
});

test('doctor does not use the once-a-day notice state: it says the same after the hook showed the notice', async () => {
  const h = harness({ wrap });
  setupUpdate(h);
  await run(['hook'], h.ctx);
  h.out.length = 0;
  await run(['doctor'], h.ctx);
  assert.match(h.text(), /⚠ version: huddle 0\.3\.0, latest is 0\.4\.0/);
});
