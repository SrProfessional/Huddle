// docs/design.md §16: `huddle clean`, and the hook that starts it. A fake `ctx.git` stands in for git; the last test runs the real one in a temporary folder.
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { run } from '../../lib/cli/run.mjs';
import { loadConfig } from '../../lib/cli/config.mjs';
import { CONFIG, harness } from './harness.mjs';

const MAIN = '/home/ana/app';
const wtPath = (name) => `${MAIN}/.claude/worktrees/${name}`;
const entry = (p, branch, head) => [`worktree ${p}`, `HEAD ${head}`, branch ? `branch refs/heads/${branch}` : 'detached', ''].join('\n');

/** A repo in memory: `worktrees` are names under .claude/worktrees; `dirty` and `merged` are sets of names. Records every git call and every folder removed. */
function repo({ names = ['done'], dirty = [], merged = names, failRemove = [], failFetch = false, base = 'origin/main', notARepo = false } = {}) {
  const calls = [];
  const removedDirs = [];
  const fail = (m, status = 1) => Object.assign(new Error(m), { status });
  const list = [entry(MAIN, 'main', 'sha-main'), ...names.map((n) => entry(wtPath(n), n, `sha-${n}`))].join('\n');
  const git = (args, opts = {}) => {
    calls.push({ args, cwd: opts.cwd });
    if (notARepo) throw fail('fatal: not a git repository');
    const [a, b] = args;
    if (a === 'worktree' && b === 'list') return list;
    if (a === 'fetch') { if (failFetch) throw fail('could not resolve host'); return ''; }
    if (a === 'symbolic-ref') throw fail('no origin/HEAD');
    if (a === 'rev-parse') { if (args.at(-1) === `${base}^{commit}`) return 'sha-base\n'; throw fail('bad ref'); }
    if (a === 'status') return dirty.some((n) => opts.cwd === wtPath(n)) ? ' M file.js\n' : '';
    if (a === 'merge-base') { if (merged.some((n) => args[2] === `sha-${n}`)) return ''; throw fail('not an ancestor'); }
    if (a === 'worktree' && b === 'remove') { if (failRemove.some((n) => args.at(-1) === wtPath(n))) throw fail('error: Permission denied\nsecond line'); return ''; }
    if (a === 'worktree' && b === 'prune') return '';
    throw fail(`unexpected git ${args.join(' ')}`);
  };
  return { git, calls, removedDirs, rm: (dir) => { removedDirs.push(dir); calls.push({ rm: dir }); }, gitCalls: (what) => calls.filter((c) => c.args?.[0] === what[0] && (!what[1] || c.args[1] === what[1])) };
}

function setup(over = {}, config = CONFIG) {
  const r = repo(over);
  const h = harness({ config });
  h.ctx.createPlatform = async () => { throw new Error('clean must not need a platform'); };
  Object.assign(h.ctx, { cwd: MAIN, platform: 'linux', now: () => Date.parse('2026-11-11T12:00:00Z'), git: r.git, rm: r.rm, touchedAt: () => 0, realpath: (p) => p });
  return { h, r };
}

test('clean removes the finished worktree and keeps the others, saying why', async () => {
  const { h, r } = setup({ names: ['done', 'wip', 'unmerged'], dirty: ['wip'], merged: ['done', 'wip'] });
  assert.equal(await run(['clean'], h.ctx), 0);
  assert.match(h.text(), new RegExp(`removed ${wtPath('done')}`));
  assert.match(h.text(), new RegExp(`kept ${wtPath('wip')}: uncommitted changes`));
  assert.match(h.text(), new RegExp(`kept ${wtPath('unmerged')}: not merged`));
  assert.match(h.text(), /1 removed, 2 kept/);
  assert.deepEqual(r.gitCalls(['worktree', 'remove']).map((c) => c.args.at(-1)), [wtPath('done')]);
});

test('clean never needs a login or a platform', async () => {
  const { h } = setup();
  assert.equal(await run(['clean'], h.ctx), 0);
});

test('clean --dry-run says what it would do and removes nothing', async () => {
  const { h, r } = setup();
  assert.equal(await run(['clean', '--dry-run'], h.ctx), 0);
  assert.match(h.text(), new RegExp(`would remove ${wtPath('done')}`));
  assert.deepEqual(r.removedDirs, []);
  assert.deepEqual(r.gitCalls(['worktree', 'remove']), []);
  assert.deepEqual(r.gitCalls(['worktree', 'prune']), []);
});

test('clean --quiet prints nothing, and still removes', async () => {
  const { h, r } = setup();
  assert.equal(await run(['clean', '--quiet'], h.ctx), 0);
  assert.equal(h.text(), '');
  assert.equal(h.errText(), '');
  assert.equal(r.gitCalls(['worktree', 'remove']).length, 1);
});

test('node_modules goes first, git never gets --force, and the worktrees are pruned at the end', async () => {
  const { h, r } = setup();
  await run(['clean'], h.ctx);
  const order = r.calls.filter((c) => c.rm || (c.args?.[0] === 'worktree' && ['remove', 'prune'].includes(c.args[1])));
  assert.equal(order[0].rm, path.join(wtPath('done'), 'node_modules'));
  assert.deepEqual(order[1].args.slice(0, 2), ['worktree', 'remove']);
  assert.deepEqual(order[2].args.slice(0, 2), ['worktree', 'prune']);
  for (const c of r.calls) assert.ok(!c.args?.includes('--force') && !c.args?.includes('-f'), 'no --force');
});

test('a worktree that cannot be removed is kept with the first line of the error, and the next one is still tried', async () => {
  const { h, r } = setup({ names: ['a', 'b'], failRemove: ['a'] });
  assert.equal(await run(['clean'], h.ctx), 0);
  assert.match(h.text(), new RegExp(`kept ${wtPath('a')}: could not remove: error: Permission denied`));
  assert.doesNotMatch(h.text(), /second line/);
  assert.match(h.text(), new RegExp(`removed ${wtPath('b')}`));
  assert.equal(r.gitCalls(['worktree', 'remove']).length, 2);
});

test('fetch runs once before judging; a failed fetch does not stop it; --no-fetch never fetches', async () => {
  const ok = setup();
  await run(['clean'], ok.h.ctx);
  assert.equal(ok.r.gitCalls(['fetch']).length, 1);
  const firstJudge = ok.r.calls.findIndex((c) => c.args?.[0] === 'merge-base');
  assert.ok(ok.r.calls.findIndex((c) => c.args?.[0] === 'fetch') < firstJudge, 'fetched before judging');

  const offline = setup({ failFetch: true });
  assert.equal(await run(['clean'], offline.h.ctx), 0);
  assert.match(offline.h.text(), /removed/);

  const skip = setup();
  await run(['clean', '--no-fetch'], skip.h.ctx);
  assert.deepEqual(skip.r.gitCalls(['fetch']), []);
});

test('the default branch of huddle.json is the base; with none resolvable, nothing is removed', async () => {
  const custom = setup({ base: 'origin/develop' }, { ...CONFIG, default_branch: 'develop' });
  await run(['clean'], custom.h.ctx);
  assert.match(custom.h.text(), /removed/);

  const none = setup({ base: 'origin/nothing' });
  assert.equal(await run(['clean'], none.h.ctx), 0);
  assert.match(none.h.text(), /default branch not found/);
  assert.deepEqual(none.r.gitCalls(['worktree', 'remove']), []);
});

test('the worktree the command runs in is kept', async () => {
  const { h, r } = setup();
  h.ctx.cwd = `${wtPath('done')}/lib`;
  await run(['clean'], h.ctx);
  assert.match(h.text(), new RegExp(`kept ${wtPath('done')}: current worktree`));
  assert.deepEqual(r.gitCalls(['worktree', 'remove']), []);
});

test('outside a git repo: an error for the person, silence with --quiet', async () => {
  const loud = setup({ notARepo: true });
  assert.equal(await run(['clean'], loud.h.ctx), 1);
  assert.match(loud.h.errText(), /huddle clean: .*not a git repository/);
  const quiet = setup({ notARepo: true });
  assert.equal(await run(['clean', '--quiet'], quiet.h.ctx), 0);
  assert.equal(quiet.h.errText() + quiet.h.text(), '');
});

test('clean refuses what it does not know', async () => {
  const { h } = setup();
  assert.equal(await run(['clean', '--force'], h.ctx), 2);
  assert.match(h.errText(), /Usage:.*clean/);
  const again = setup();
  assert.equal(await run(['clean', 'now'], again.h.ctx), 2);
});

test('the hook starts the clean process once, and not when clean_worktrees is false; its output does not change', async () => {
  const started = [];
  const on = harness();
  on.ctx.startClean = () => started.push('clean');
  assert.equal(await run(['hook'], on.ctx), 0);
  assert.deepEqual(started, ['clean']);
  assert.equal(on.text(), '', 'nothing pending: the hook stays silent as before');

  const off = harness({ config: { ...CONFIG, clean_worktrees: false } });
  off.ctx.startClean = () => started.push('again');
  assert.equal(await run(['hook'], off.ctx), 0);
  assert.deepEqual(started, ['clean']);
});

test('a clean process that cannot start never breaks the hook', async () => {
  const h = harness();
  h.ctx.startClean = () => { throw new Error('spawn failed'); };
  assert.equal(await run(['hook'], h.ctx), 0);
  assert.equal(h.errText(), '');
});

test('clean_worktrees in huddle.json is a boolean, and nothing else', () => {
  const read = (value) => () => JSON.stringify({ ...CONFIG, clean_worktrees: value });
  assert.equal(loadConfig('/repo', read(false)).clean_worktrees, false);
  assert.equal(loadConfig('/repo', read(true)).clean_worktrees, true);
  assert.throws(() => loadConfig('/repo', read('no')), /clean_worktrees/);
});

// --- real git, in a temporary folder: no network, no GitHub -----------------------------------------------------------------------------

const BIN = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'bin', 'huddle');
// An empty config file of our own (os.devNull is not a usable git config on Windows): the test never reads the machine's git settings.
const envFor = (tmp) => {
  const empty = path.join(tmp, 'empty.gitconfig');
  fs.writeFileSync(empty, '');
  return { ...process.env, GIT_AUTHOR_NAME: 'T', GIT_AUTHOR_EMAIL: 't@example.com', GIT_COMMITTER_NAME: 'T', GIT_COMMITTER_EMAIL: 't@example.com', GIT_CONFIG_GLOBAL: empty, GIT_CONFIG_NOSYSTEM: '1' };
};

test('real git: only the merged, clean and old worktree is removed, with its node_modules', () => {
  const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'huddle-clean-')));
  const ENV = envFor(tmp);
  const git = (cwd, ...args) => {
    const r = spawnSync('git', args, { cwd, env: ENV, encoding: 'utf8' });
    assert.equal(r.status, 0, `git ${args.join(' ')}: ${r.stderr}`);
    return r.stdout.trim();
  };
  try {
    const origin = path.join(tmp, 'origin.git');
    const app = path.join(tmp, 'app');
    fs.mkdirSync(origin);
    git(origin, 'init', '--bare', '-b', 'main');
    fs.mkdirSync(app);
    git(app, 'init', '-b', 'main');
    fs.writeFileSync(path.join(app, 'huddle.json'), JSON.stringify(CONFIG));
    fs.writeFileSync(path.join(app, '.gitignore'), 'node_modules/\n.claude/worktrees/\n');
    git(app, 'add', '-A');
    git(app, 'commit', '-m', 'first');
    git(app, 'remote', 'add', 'origin', origin);
    git(app, 'push', '-u', 'origin', 'main');

    const make = (name, { commit = true, merge = false } = {}) => {
      const dir = path.join(app, '.claude', 'worktrees', name);
      git(app, 'worktree', 'add', dir, '-b', name, 'main');
      fs.mkdirSync(path.join(dir, 'node_modules', 'dep'), { recursive: true });
      fs.writeFileSync(path.join(dir, 'node_modules', 'dep', 'index.js'), 'x');
      if (commit) { fs.writeFileSync(path.join(dir, `${name}.txt`), name); git(dir, 'add', '-A'); git(dir, 'commit', '-m', name); }
      if (merge) git(app, 'merge', '--no-ff', '-m', `merge ${name}`, name);
      return dir;
    };
    const old = (dir) => { // 3 days ago: the time of the worktree's own HEAD reflog is what counts
      const log = path.join(git(dir, 'rev-parse', '--absolute-git-dir'), 'logs', 'HEAD');
      const t = new Date(Date.now() - 72 * 3600 * 1000);
      fs.utimesSync(log, t, t);
    };
    const done = make('done', { merge: true });
    const unmerged = make('unmerged');
    const dirty = make('dirty', { merge: true });
    fs.writeFileSync(path.join(dirty, 'notes.txt'), 'not committed');
    const fresh = make('fresh', { commit: false });
    for (const d of [done, unmerged, dirty]) old(d);
    git(app, 'push', 'origin', 'main');

    const r = spawnSync(process.execPath, [BIN, 'clean'], { cwd: app, env: ENV, encoding: 'utf8' });
    assert.equal(r.status, 0, r.stderr);
    assert.ok(!fs.existsSync(done), 'the finished worktree is gone, with its node_modules');
    for (const kept of [unmerged, dirty, fresh]) assert.ok(fs.existsSync(path.join(kept, 'node_modules')), `${kept} stays`);
    assert.match(r.stdout, /kept .*unmerged: not merged/);
    assert.match(r.stdout, /kept .*dirty: uncommitted changes/);
    assert.match(r.stdout, /kept .*fresh: touched less than 24 hours ago/);
    assert.equal(git(app, 'worktree', 'list', '--porcelain').split('\n').filter((l) => l.startsWith('worktree ')).length, 4, 'main and three worktrees');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true, maxRetries: 5 });
  }
});
