// docs/design.md §16: which worktrees are finished. Pure logic: git and the file system are replaced by plain functions.
import test from 'node:test';
import assert from 'node:assert/strict';
import { GRACE_MS, normalizePath, parseWorktrees, planClean } from '../../lib/core/worktrees.mjs';

const HOUR = 3600 * 1000;
const NOW = Date.parse('2026-11-11T12:00:00Z');
const MAIN = '/home/ana/app';
const wt = (name, extra = {}) => ({ path: `${MAIN}/.claude/worktrees/${name}`, head: `sha-${name}`, branch: name, detached: false, locked: false, bare: false, prunable: false, ...extra });
const main = { path: MAIN, head: 'sha-main', branch: 'main', detached: false, locked: false, bare: false, prunable: false };

/** A world where everything is finished; a test breaks one thing. */
function plan(worktrees, over = {}) {
  return planClean({
    worktrees: [main, ...worktrees], cwd: MAIN, platform: 'linux', now: NOW, baseFound: true,
    isClean: () => true, isMerged: () => true, touchedAt: () => NOW - 48 * HOUR, ...over,
  });
}
const byPath = (result) => Object.fromEntries(result.map((r) => [r.path, r]));

test('parseWorktrees reads branches, detached heads, locks, bare and prunable entries, paths with spaces and CRLF', () => {
  const text = [
    'worktree D:/My Projects/app', 'HEAD aaa', 'branch refs/heads/main', '',
    'worktree D:/My Projects/app/.claude/worktrees/h1', 'HEAD bbb', 'branch refs/heads/h1', 'locked', '',
    'worktree D:/My Projects/app/.claude/worktrees/rev-h1', 'HEAD ccc', 'detached', '',
    'worktree D:/My Projects/app/.claude/worktrees/gone', 'HEAD ddd', 'branch refs/heads/gone', 'prunable gitdir file points to non-existent location', '',
    'worktree D:/bare.git', 'bare', '',
  ].join('\r\n');
  const list = parseWorktrees(text);
  assert.equal(list.length, 5);
  assert.deepEqual(list[0], { path: 'D:/My Projects/app', head: 'aaa', branch: 'main', detached: false, locked: false, bare: false, prunable: false });
  assert.equal(list[1].locked, true);
  assert.equal(list[2].detached, true);
  assert.equal(list[2].branch, null);
  assert.equal(list[3].prunable, true);
  assert.equal(list[4].bare, true);
});

test('parseWorktrees on an empty text gives no worktrees', () => {
  assert.deepEqual(parseWorktrees(''), []);
});

test('a finished worktree (merged, clean, old, inside .claude/worktrees) is removed', () => {
  const [r] = plan([wt('h1')]);
  assert.equal(r.remove, true);
});

test('the main worktree is never listed for removal', () => {
  const result = plan([wt('h1')]);
  assert.ok(!result.some((r) => r.path === MAIN), 'only candidates are reported');
});

test('each check alone keeps the worktree, with its reason', () => {
  const cases = [
    ['uncommitted changes', { isClean: () => false }],
    ['not merged', { isMerged: () => false }],
    ['touched less than 24 hours ago', { touchedAt: () => NOW - 2 * HOUR }],
  ];
  for (const [reason, over] of cases) {
    const [r] = plan([wt('h1')], over);
    assert.equal(r.remove, false, reason);
    assert.match(r.reason, new RegExp(reason), reason);
  }
  const [locked] = plan([wt('h1', { locked: true })]);
  assert.match(locked.reason, /locked/);
  const [bare] = plan([wt('h1', { bare: true })]);
  assert.equal(bare.remove, false);
});

test('a worktree outside <main>/.claude/worktrees is never touched', () => {
  const other = { ...wt('x'), path: '/home/ana/elsewhere/x' };
  const nested = { ...wt('x'), path: `${MAIN}/.claude/worktrees/a/b` };
  const sibling = { ...wt('x'), path: `${MAIN}/.claude/worktrees-old/x` };
  for (const w of [other, nested, sibling]) {
    const [r] = plan([w]);
    assert.equal(r.remove, false, w.path);
    assert.match(r.reason, /outside/);
  }
});

test('the worktree the command runs in is kept, also from a folder inside it', () => {
  const here = wt('h1');
  for (const cwd of [here.path, `${here.path}/lib/cli`]) {
    const [r] = plan([here], { cwd });
    assert.equal(r.remove, false);
    assert.match(r.reason, /current/);
  }
});

test('a prefix of a name is not the worktree: h1 does not protect h10', () => {
  const result = byPath(plan([wt('h1'), wt('h10')], { cwd: wt('h1').path }));
  assert.equal(result[wt('h1').path].remove, false);
  assert.equal(result[wt('h10').path].remove, true);
});

test('no default branch to compare with: nothing is removed', () => {
  const [r] = plan([wt('h1')], { baseFound: false });
  assert.equal(r.remove, false);
  assert.match(r.reason, /default branch/);
});

test('the cheap checks run first: git is not asked about a worktree that is kept anyway', () => {
  const asked = [];
  plan([wt('h1', { locked: true })], { isClean: (p) => { asked.push(p); return true; }, isMerged: (h) => { asked.push(h); return true; } });
  assert.deepEqual(asked, []);
});

test('a detached review worktree is judged by its commit', () => {
  const rev = wt('rev-h1', { branch: null, detached: true });
  const seen = [];
  const [r] = plan([rev], { isMerged: (head) => { seen.push(head); return true; } });
  assert.equal(r.remove, true);
  assert.deepEqual(seen, ['sha-rev-h1']);
});

test('the grace period is 24 hours', () => {
  assert.equal(GRACE_MS, 24 * HOUR);
  assert.equal(plan([wt('h1')], { touchedAt: () => NOW - 24 * HOUR })[0].remove, true);
  assert.equal(plan([wt('h1')], { touchedAt: () => NOW - 24 * HOUR + 1000 })[0].remove, false);
  assert.equal(plan([wt('h1')], { touchedAt: () => null })[0].remove, false, 'an unknown time is not old');
});

test('Windows: git gives D:/x and Node gives D:\\x in another case, and they are the same place', () => {
  const winMain = 'D:/GitHub/huddle';
  const w = { ...wt('h1'), path: 'D:/GitHub/huddle/.claude/worktrees/h1' };
  const result = planClean({
    worktrees: [{ ...main, path: winMain }, w], cwd: 'd:\\github\\huddle\\.claude\\worktrees\\h1\\lib', platform: 'win32', now: NOW, baseFound: true,
    isClean: () => true, isMerged: () => true, touchedAt: () => 0,
  });
  assert.match(result[0].reason, /current/);
  const other = planClean({
    worktrees: [{ ...main, path: winMain }, w], cwd: 'D:\\GitHub\\huddle', platform: 'win32', now: NOW, baseFound: true,
    isClean: () => true, isMerged: () => true, touchedAt: () => 0,
  });
  assert.equal(other[0].remove, true);
});

test('macOS: /var and /private/var are the same place once resolved, and case does not matter', () => {
  const canonical = (p) => p.replace(/^\/var\//, '/private/var/');
  const m = { ...main, path: '/private/var/folders/x/App' };
  const w = { ...wt('h1'), path: '/private/var/folders/x/App/.claude/worktrees/h1' };
  const result = planClean({
    worktrees: [m, w], cwd: '/var/folders/x/app/.claude/worktrees/h1', platform: 'darwin', canonical, now: NOW, baseFound: true,
    isClean: () => true, isMerged: () => true, touchedAt: () => 0,
  });
  assert.match(result[0].reason, /current/);
});

test('Linux: case counts, so Foo and foo are two places', () => {
  const w = wt('H1');
  const result = plan([w], { cwd: `${MAIN}/.claude/worktrees/h1` });
  assert.equal(result[0].remove, true, 'the current folder is h1, the worktree is H1');
});

test('normalizePath: separators, trailing slash, drive letter and case by platform', () => {
  assert.equal(normalizePath('D:\\A\\B\\', { platform: 'win32' }), 'd:/a/b');
  assert.equal(normalizePath('/Users/Ana/App/', { platform: 'darwin' }), '/users/ana/app');
  assert.equal(normalizePath('/home/Ana/App/', { platform: 'linux' }), '/home/Ana/App');
  assert.equal(normalizePath('/', { platform: 'linux' }), '/');
});
