// Second review of PR #245 (Issue #230): the destination keeps its port; the refusal never prints a URL (it may carry a credential); the
// hourly reservation is atomic across processes; remote rows are type-checked, with real calendar dates, row by row.
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { pushGoesTo, projectRows } from '../../lib/usage/share.mjs';
import { run } from '../../lib/cli/run.mjs';
import { harness } from '../cli/harness.mjs';

const row = (day, input) => ({ day, tool: 'Claude Code', model: 'claude-opus-5-5', issue: 230, input, output: 1, cacheRead: 2, cacheWrite: 3, reasoning: 0 });

test('the port is part of the destination: a default port matches, another port does not unless the configured host names it', () => {
  const gh = { platform: 'github', project: 'acme/app' };
  assert.equal(pushGoesTo(['https://github.com:443/acme/app.git'], gh), true, 'https on its default port');
  assert.equal(pushGoesTo(['ssh://git@github.com:22/acme/app.git'], gh), true, 'ssh on its default port');
  assert.equal(pushGoesTo(['https://github.com:8443/acme/app.git'], gh), false, 'another service on the same host');
  assert.equal(pushGoesTo(['ssh://git@github.com:2222/acme/app.git'], gh), false);
  const gl = { platform: 'gitlab', host: 'gitlab.example.com:8443', project: 'team/app' };
  assert.equal(pushGoesTo(['https://gitlab.example.com:8443/team/app.git'], gl), true, 'the configured host names that port');
  assert.equal(pushGoesTo(['https://gitlab.example.com/team/app.git'], gl), false, 'the default port is another service there');
});

test('share_usage never widens a destination on another port', async () => {
  const pushed = [];
  const h = harness({ config: { platform: 'github', project: 'acme/app', ai_manager: 'SrProfessional', assignees: ['ana'], share_usage: true } });
  h.ctx.usageDestinations = () => ['https://github.com:8443/acme/app.git'];
  h.ctx.collectUsage = () => assert.fail('no transcript is read');
  h.ctx.pushUsage = (a) => pushed.push(a);
  assert.equal(await run(['usage', '--push'], h.ctx), 0);
  assert.equal(pushed.length, 0);
});

test('the refusal happens before any transcript is read and never prints the URL, which may carry a credential', async () => {
  const h = harness({ config: { platform: 'github', project: 'acme/app', ai_manager: 'SrProfessional', assignees: ['ana'], share_usage: true } });
  h.ctx.usageDestinations = () => ['https://someone:ghp_FAKE_SECRET_123@github.com/evil/app.git'];
  h.ctx.collectUsage = () => assert.fail('no transcript is read');
  h.ctx.pushUsage = () => assert.fail('nothing is pushed');
  assert.equal(await run(['usage', '--push'], h.ctx), 0);
  assert.match(h.text(), /Usage not shared: origin does not push only to acme\/app/);
  assert.doesNotMatch(h.text() + h.errText(), /ghp_FAKE_SECRET_123|someone|evil/);
});

test('two sessions starting at the same moment: only one reserves the hour and starts the push (real processes)', async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'huddle-reserve-'));
  const file = path.join(dir, 'huddle-usage-x.pushed');
  const main = fileURLToPath(new URL('../../lib/cli/main.mjs', import.meta.url));
  const child = () => new Promise((resolve) => {
    const p = spawn(process.execPath, ['--input-type=module', '-e', `import { reserveWindow } from ${JSON.stringify(new URL(`file:///${main.replace(/\\/g, '/')}`).href)}; process.stdout.write(String(reserveWindow(${JSON.stringify(file)}, Date.now(), 3600000)));`]);
    let out = '';
    p.stdout.on('data', (d) => { out += d; });
    p.on('close', () => resolve(out.trim()));
  });
  const results = await Promise.all([child(), child(), child(), child()]);
  assert.equal(results.filter((r) => r === 'true').length, 1, results.join(','));
});

test('remote rows are type-checked one by one: valid ones kept, impossible dates and odd types dropped, nothing thrown', () => {
  const rows = projectRows([
    row('2026-11-20', 10),
    row('2026-02-31', 5), // not a calendar date
    { ...row('2026-11-21', 7), tool: { toString() { throw new Error('boom'); } } }, // an object where a string goes
    { ...row('2026-11-22', 3), input: { valueOf() { throw new Error('boom'); } } }, // an object where a number goes
    { ...row('2026-11-23', 4), issue: { n: 1 } },
    row('2026-11-24', 9),
  ]);
  // An object where a number goes counts as 0, as non-numbers already do (first review); an object where a string or the Issue goes,
  // or an impossible date, drops that row only.
  assert.deepEqual(rows.map((r) => r.day), ['2026-11-20', '2026-11-22', '2026-11-24']);
  assert.equal(rows.find((r) => r.day === '2026-11-22').input, 0);
});

// --- Third review of PR #245 ---------------------------------------------------------------------------------------------------------

test('only unambiguous remotes count: ordinary SSH and HTTPS pass; local paths and ambiguous forms are refused', () => {
  const gh = { platform: 'github', project: 'acme/app' };
  for (const ok of ['https://github.com/acme/app.git', 'ssh://git@github.com/acme/app.git', 'git@github.com:acme/app.git', 'github.com:acme/app.git']) {
    assert.equal(pushGoesTo([ok], gh), true, ok);
  }
  for (const bad of [
    '/tmp/x@github.com:acme/app.git', // a local path that looks like user@host:path
    'D:/repos/x@github.com:acme/app.git',
    'D:\\repos\\github.com:acme/app.git',
    './github.com:acme/app.git',
    'file:///github.com/acme/app.git',
    'C:acme/app.git', // a Windows drive, not a host
    'git@github.com:/acme/app.git', // scp-like with an absolute path
    'us/er@github.com:acme/app.git',
  ]) assert.equal(pushGoesTo([bad], gh), false, bad);
});

// Fourth review of PR #245: no lock and so nothing to recover. Each hour is a file of its own, created exclusively ('wx'): the
// operating system lets exactly one caller create a given name, a reservation is never moved or deleted by another caller, and a
// leftover file (a crashed session, an old hour) only ever stands for its own hour.
test('one reservation per hour: the first caller of an hour reserves it, every later one in that hour does not, the next hour is free again', async () => {
  const { reserveWindow } = await import('../../lib/cli/main.mjs');
  const dir = mkdtempSync(path.join(tmpdir(), 'huddle-reserve-hour-'));
  const file = path.join(dir, 'huddle-usage-x.pushed');
  const H = 3600000;
  const t = Date.parse('2026-11-21T10:05:00Z');
  assert.equal(reserveWindow(file, t, H), true);
  assert.equal(reserveWindow(file, t + 1000, H), false, 'a second session in the same hour');
  assert.equal(reserveWindow(file, t + 54 * 60 * 1000, H), false, 'still the same hour');
  assert.equal(reserveWindow(file, t + 56 * 60 * 1000, H), true, 'the next hour (11:01)');
});

test('a reservation left by a crashed session never blocks or is moved by a later caller: it stands only for its own hour', async () => {
  const { reserveWindow } = await import('../../lib/cli/main.mjs');
  const { writeFileSync, readdirSync } = await import('node:fs');
  const dir = mkdtempSync(path.join(tmpdir(), 'huddle-reserve-left-'));
  const file = path.join(dir, 'huddle-usage-x.pushed');
  const H = 3600000;
  const t = Date.parse('2026-11-21T10:05:00Z');
  writeFileSync(`${file}.${Math.floor(t / H) - 3}`, ''); // an hour three hours ago, left behind
  assert.equal(reserveWindow(file, t, H), true);
  assert.ok(readdirSync(dir).includes(`huddle-usage-x.pushed.${Math.floor(t / H)}`), 'this hour\'s reservation stays valid');
  assert.equal(reserveWindow(file, t + 1, H), false);
});
