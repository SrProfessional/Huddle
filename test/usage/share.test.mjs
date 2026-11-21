// Issue #230: each person's token summary goes to the orphan branch huddle-usage (numbers only), written with git plumbing so the
// working tree, the index and the current branch are never touched. A local bare repo stands in for the remote: no network.
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pushUsage, readTeamUsage, sumRows, gitRunner, pushGoesTo } from '../../lib/usage/share.mjs';
import { run } from '../../lib/cli/run.mjs';
import { harness } from '../cli/harness.mjs';

const sh = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
function world() {
  const dir = mkdtempSync(path.join(tmpdir(), 'huddle-share-'));
  const remote = path.join(dir, 'remote.git');
  sh(dir, 'init', '-q', '--bare', remote);
  const clone = (name) => {
    const at = path.join(dir, name);
    sh(dir, 'clone', '-q', remote, at);
    sh(at, 'config', 'user.email', 'test@example.com');
    sh(at, 'config', 'user.name', 'Test');
    return at;
  };
  const a = clone('a');
  writeFileSync(path.join(a, 'README.md'), 'hello\n');
  sh(a, 'add', 'README.md');
  sh(a, 'commit', '-q', '-m', 'first');
  sh(a, 'push', '-q', 'origin', 'HEAD:main');
  return { dir, remote, a, clone };
}
const row = (day, input) => ({ day, tool: 'Claude Code', model: 'claude-opus-5-5', issue: 230, input, output: 1, cacheRead: 2, cacheWrite: 3, reasoning: 0 });

test('pushUsage writes usage/<login>/<day>.json on huddle-usage and leaves HEAD, the index and the working tree alone', () => {
  const w = world();
  const before = { head: sh(w.a, 'rev-parse', 'HEAD'), branch: sh(w.a, 'branch', '--show-current') };
  writeFileSync(path.join(w.a, 'wip.txt'), 'not committed\n'); // a Player's work in progress
  pushUsage({ run: gitRunner(w.a), person: 'ana', rows: [row('2026-11-20', 10)] });
  assert.equal(sh(w.a, 'rev-parse', 'HEAD'), before.head);
  assert.equal(sh(w.a, 'branch', '--show-current'), before.branch);
  assert.equal(sh(w.a, 'status', '--porcelain'), '?? wip.txt', 'nothing staged, nothing changed');
  const text = sh(w.remote, 'show', 'huddle-usage:usage/ana/2026-11-20.json');
  assert.deepEqual(JSON.parse(text), { person: 'ana', day: '2026-11-20', rows: [row('2026-11-20', 10)] });
  assert.equal(sh(w.remote, 'log', '--format=%P', '-1', 'huddle-usage'), '', 'an orphan branch: its first commit has no parent');
});

test('a second day adds a file and keeps the first; the same day is replaced, not duplicated', () => {
  const w = world();
  const r = gitRunner(w.a);
  pushUsage({ run: r, person: 'ana', rows: [row('2026-11-20', 10)] });
  pushUsage({ run: r, person: 'ana', rows: [row('2026-11-20', 15), row('2026-11-21', 7)] });
  const files = sh(w.remote, 'ls-tree', '-r', '--name-only', 'huddle-usage').split('\n');
  assert.deepEqual(files, ['usage/ana/2026-11-20.json', 'usage/ana/2026-11-21.json']);
  assert.equal(JSON.parse(sh(w.remote, 'show', 'huddle-usage:usage/ana/2026-11-20.json')).rows[0].input, 15);
});

test('a push rejected because someone pushed meanwhile fetches and retries once on top of their commit', () => {
  const w = world();
  const b = w.clone('b');
  const r = gitRunner(w.a);
  let raced = false;
  const racing = (args, opts) => {
    if (args[0] === 'push' && !raced) { raced = true; pushUsage({ run: gitRunner(b), person: 'luis', rows: [row('2026-11-20', 4)] }); }
    return r(args, opts);
  };
  pushUsage({ run: racing, person: 'ana', rows: [row('2026-11-20', 10)] });
  const files = sh(w.remote, 'ls-tree', '-r', '--name-only', 'huddle-usage').split('\n');
  assert.deepEqual(files, ['usage/ana/2026-11-20.json', 'usage/luis/2026-11-20.json'], 'both people, nobody lost');
});

test('readTeamUsage sums the team and keeps each person apart', () => {
  const w = world();
  pushUsage({ run: gitRunner(w.a), person: 'ana', rows: [row('2026-11-20', 10)] });
  pushUsage({ run: gitRunner(w.a), person: 'luis', rows: [row('2026-11-20', 5)] });
  const team = readTeamUsage({ run: gitRunner(w.a) });
  assert.deepEqual(Object.keys(team.people).sort(), ['ana', 'luis']);
  assert.equal(team.people.ana[0].input, 10);
  assert.equal(team.team.length, 1);
  assert.equal(team.team[0].input, 15);
  assert.deepEqual(sumRows([row('2026-11-20', 1), row('2026-11-20', 2)])[0].input, 3);
});

test('readTeamUsage with no huddle-usage branch yet is an empty team, not an error', () => {
  const w = world();
  assert.deepEqual(readTeamUsage({ run: gitRunner(w.a) }), { team: [], people: {} });
});

test('the session start pushes the summary in the background at most once an hour', async () => {
  const started = [];
  const clock = { t: Date.parse('2026-11-21T10:00:00Z') };
  const h = harness();
  Object.assign(h.ctx, { sharedDir: '/home/.huddle', updateCachePath: '/data/huddle-update.json', now: () => clock.t, startDetached: (a) => started.push(a) });
  await run(['hook'], h.ctx);
  await run(['hook'], h.ctx);
  assert.deepEqual(started, [['usage', '--push']]);
  clock.t += 61 * 60 * 1000;
  await run(['hook'], h.ctx);
  assert.equal(started.length, 2);
});

test('usage --push and usage --team --json reach the sharing functions', async () => {
  const pushed = [];
  const h = harness();
  h.ctx.collectUsage = () => [row('2026-11-20', 10)];
  h.ctx.usageDestinations = () => ['https://github.com/acme/app.git'];
  h.ctx.pushUsage = (args) => pushed.push(args);
  h.ctx.readTeamUsage = () => ({ team: [row('2026-11-20', 10)], people: { SrProfessional: [row('2026-11-20', 10)] } });
  assert.equal(await run(['usage', '--push'], h.ctx), 0);
  assert.equal(pushed[0].person, 'SrProfessional');
  assert.equal(pushed[0].rows.length, 1);
  h.out.length = 0;
  assert.equal(await run(['usage', '--team', '--json'], h.ctx), 0);
  assert.equal(JSON.parse(h.text()).team[0].input, 10);
});

for (const gitlab of [false, true]) {
  test(`[${gitlab ? 'gitlab' : 'github'}] usage --push shares only in a private repo unless share_usage says otherwise (the Coach's privacy rule)`, async () => {
    const cases = [['private', undefined, true], ['internal', undefined, true], ['public', undefined, false], ['public', true, true], ['private', false, false]];
    for (const [vis, share, pushes] of cases) {
      const pushed = [];
      const h = harness({ gitlab, config: { ...(gitlab ? { platform: 'gitlab' } : {}), platform: gitlab ? 'gitlab' : 'github', project: 'acme/app', ai_manager: 'SrProfessional', assignees: ['ana'], ...(share !== undefined && { share_usage: share }) }, setup: (w) => w.visibility(vis) });
      h.ctx.collectUsage = () => [row('2026-11-20', 10)];
      h.ctx.usageDestinations = () => [gitlab ? 'https://gitlab.com/acme/app.git' : 'https://github.com/acme/app.git'];
      h.ctx.pushUsage = (a) => pushed.push(a);
      assert.equal(await run(['usage', '--push'], h.ctx), 0, `${vis}/${share}`);
      assert.equal(pushed.length, pushes ? 1 : 0, `${vis}/${share}`);
      if (!pushes) assert.match(h.text(), /Usage not shared/);
    }
  });
}

// --- Review of PR #245 ---------------------------------------------------------------------------------------------------------------

test('the privacy check is bound to where the push really goes: every push URL of origin must be the configured project, checked before any transcript is read', async () => {
  const cases = [
    [['https://github.com/acme/app.git'], true],
    [['git@github.com:acme/app.git'], true],
    [['ssh://git@github.com/Acme/App'], true],
    [['https://github.com/evil/app.git'], false],
    [['https://github.com/acme/app.git', 'https://github.com/evil/app.git'], false], // several push URLs: all must match
    [[], false],
  ];
  for (const [urls, pushes] of cases) {
    for (const share of [undefined, true]) { // share_usage never widens the destination
      const pushed = [];
      const h = harness({ config: { platform: 'github', project: 'acme/app', ai_manager: 'SrProfessional', assignees: ['ana'], ...(share !== undefined && { share_usage: share }) }, setup: (w) => w.visibility('private') });
      h.ctx.usageDestinations = () => urls;
      h.ctx.collectUsage = () => { if (!pushes) assert.fail('no transcript is read when the push is declined'); return [row('2026-11-20', 10)]; };
      h.ctx.pushUsage = (a) => pushed.push(a);
      assert.equal(await run(['usage', '--push'], h.ctx), 0);
      assert.equal(pushed.length, pushes ? 1 : 0, JSON.stringify(urls));
      if (!pushes) assert.match(h.text(), /Usage not shared: origin does not push only to acme\/app/);
    }
  }
});

test('on GitLab the destination check takes the host and the group path', async () => {
  // The rule itself: a self-managed host and a group path.
  const self = { platform: 'gitlab', host: 'gitlab.example.com', project: 'team/sub/app' };
  assert.equal(pushGoesTo(['git@gitlab.example.com:team/sub/app.git'], self), true);
  assert.equal(pushGoesTo(['https://gitlab.example.com/Team/Sub/App.git'], self), true);
  assert.equal(pushGoesTo(['https://gitlab.com/team/sub/app.git'], self), false, 'another host is another destination');
  assert.equal(pushGoesTo(['https://gitlab.example.com/team/app.git'], self), false, 'another group path');
  // Through the command, on the canned GitLab (gitlab.com).
  const pushed = [];
  const h = harness({ gitlab: true, setup: (w) => w.visibility('private') });
  h.ctx.collectUsage = () => [row('2026-11-20', 10)];
  h.ctx.pushUsage = (a) => pushed.push(a);
  h.ctx.usageDestinations = () => ['git@gitlab.com:acme/app.git'];
  await run(['usage', '--push'], h.ctx);
  assert.equal(pushed.length, 1);
  h.ctx.usageDestinations = () => ['https://gitlab.example.com/acme/app.git'];
  await run(['usage', '--push'], h.ctx);
  assert.equal(pushed.length, 1, 'another host is another destination');
});

test('the hourly mark is shared by the worktrees of the same repo', async () => {
  const started = [];
  const clock = { t: Date.parse('2026-11-21T10:00:00Z') };
  const main = harness();
  Object.assign(main.ctx, { sharedDir: '/home/.huddle', updateCachePath: '/data/huddle-update.json', now: () => clock.t, startDetached: (a) => started.push(a) });
  await run(['hook'], main.ctx);
  const wt = harness();
  Object.assign(wt.ctx, { root: '/repo/.claude/worktrees/h95-usage-branch', sharedDir: '/home/.huddle', updateCachePath: '/data/huddle-update.json', now: () => clock.t, startDetached: (a) => started.push(a), readFile: main.ctx.readFile, writeFile: main.ctx.writeFile });
  wt.ctx.readFile = (p) => (String(p).replace(/\\/g, '/').endsWith('/huddle.json') ? main.ctx.readFile('/repo/huddle.json') : main.ctx.readFile(p));
  await run(['hook'], wt.ctx);
  assert.equal(started.length, 1, 'one push an hour for the repo, whatever the worktree');
});

test('the team report keeps only valid rows, projected to the summary fields; a malformed row never aborts it', () => {
  const w = world();
  const odd = [
    { ...row('2026-11-20', 10), secret: 'transcript text', path: 'C:/Users/x' },
    { day: 'not a day', tool: 'Claude Code', model: 'm', issue: 1, input: 5 },
    'not an object',
    null,
    { day: '2026-11-20', tool: 'Codex', model: 'gpt-5', issue: 'no Issue', input: 'NaN', output: -3, cacheRead: 2 },
  ];
  pushUsage({ run: gitRunner(w.a), person: 'ana', rows: odd });
  const team = readTeamUsage({ run: gitRunner(w.a) });
  assert.equal(team.people.ana.length, 2, 'the two rows with a real day');
  for (const r of team.people.ana) assert.deepEqual(Object.keys(r).sort(), ['cacheRead', 'cacheWrite', 'day', 'input', 'issue', 'model', 'output', 'reasoning', 'tool']);
  const codex = team.people.ana.find((r) => r.tool === 'Codex');
  assert.deepEqual([codex.input, codex.output, codex.cacheRead], [0, 0, 2], 'non-numbers and negatives count as 0');
});
