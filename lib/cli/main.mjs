// Huddle: the real wiring of `bin/huddle`: the folder of the repo, the files, the adapter, the clock and the terminal.
import { execFileSync, spawn } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync, mkdirSync, realpathSync, statSync } from 'node:fs';
import { rm } from 'node:fs/promises';
import { homedir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as sleep } from 'node:timers/promises';
import { createPlatform } from '../platform/index.mjs';
import { run } from './run.mjs';

/** The nearest folder upward from `from` that holds a huddle.json; `from` itself when there is none (the error then names it). */
export function findRoot(from) {
  for (let dir = path.resolve(from); ; dir = path.dirname(dir)) {
    if (existsSync(path.join(dir, 'huddle.json'))) return dir;
    if (path.dirname(dir) === dir) return path.resolve(from);
  }
}

/** The branch checked out in `cwd`, or null (not a git repo, detached HEAD, git missing). */
export function currentBranch(cwd) {
  try {
    const name = execFileSync('git', ['symbolic-ref', '--short', '-q', 'HEAD'], { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], windowsHide: true }).trim();
    return name || null;
  } catch {
    return null;
  }
}

/** Runs git in `cwd` and returns its output; throws when git fails (the error keeps git's message). No shell, so the same call works on Windows, macOS and Linux. */
export function git(args, { cwd, timeoutMs } = {}) {
  return execFileSync('git', args, { cwd, encoding: 'utf8', timeout: timeoutMs, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true, maxBuffer: 64 * 1024 * 1024 });
}

/** The real path of `p` (symlinks resolved: /var is /private/var on macOS), or `p` itself when it cannot be resolved. */
export function realpath(p) {
  try { return realpathSync.native(p); } catch { return p; }
}

/** When a worktree was last touched, in ms: its own HEAD reflog (checkout, commit, merge). null when it cannot be read, which counts as «recent». */
export function touchedAt(worktree, run = git) {
  try {
    const dir = path.resolve(worktree, run(['rev-parse', '--absolute-git-dir'], { cwd: worktree }).trim());
    for (const file of ['logs/HEAD', 'HEAD']) {
      try { return statSync(path.join(dir, file)).mtimeMs; } catch { /* try the next */ }
    }
  } catch { /* not readable */ }
  return null;
}

/** Starts `huddle clean --quiet` as a process of its own that outlives the hook (docs/design.md §16). Never throws and never waits. */
export function startClean(cwd, root = pluginRoot()) {
  const child = spawn(process.execPath, [path.join(root, 'bin', 'huddle'), 'clean', '--quiet'], { cwd, detached: true, stdio: 'ignore', windowsHide: true });
  child.on('error', () => {}); // a failed start is no reason to break the session
  child.unref();
}

/** True when this CLI runs from an installed plugin (Claude Code's plugin cache or marketplaces folder, or CLAUDE_PLUGIN_ROOT set). No network. */
export function isInstalledPlugin(file = fileURLToPath(import.meta.url), env = process.env) {
  if (env.CLAUDE_PLUGIN_ROOT) return true;
  return /[\\/]plugins[\\/](cache|marketplaces)[\\/]/.test(file);
}

/** The folder of the running plugin: CLAUDE_PLUGIN_ROOT, else the folder this file sits in (a clone). */
export function pluginRoot(env = process.env, file = fileURLToPath(import.meta.url)) {
  return env.CLAUDE_PLUGIN_ROOT || path.resolve(path.dirname(file), '..', '..');
}

/** The update cache: in the plugin's own data folder when Claude Code gives one, else under the Claude Code config folder. Never in the repo. */
export function updateCachePath(env = process.env, home = homedir()) {
  const dir = env.CLAUDE_PLUGIN_DATA || env.CLAUDE_CONFIG_DIR || path.join(home, '.claude');
  return path.join(dir, 'huddle-update.json');
}

/**
 * The hook ends the process as soon as its output is flushed: a `gh`/`glab` child that is still running (a slow progress read that was dropped)
 * must not keep Node alive past the hook timeout. Other commands end by themselves.
 */
export function endProcess(argv, code, proc = process) {
  if (argv[0] !== 'hook') return;
  proc.stdout.write('', () => proc.exit(code));
}

/**
 * The real `ctx` every command gets. Exported so a test can check it has the same shape as the fakes (Issue #69).
 * `now()` returns a Date: progress reads it as a Date, the update notice reads its milliseconds.
 */
export function realContext(cwd, out) {
  return {
    pluginInstalled: isInstalledPlugin(),
    platform: process.platform,
    root: findRoot(cwd),
    readFile: (file) => { try { return readFileSync(file, 'utf8'); } catch { return null; } },
    writeFile: (file, text) => { mkdirSync(path.dirname(file), { recursive: true }); writeFileSync(file, text); },
    fetch: (url, opts) => fetch(url, opts),
    now: () => new Date(),
    pluginRoot: pluginRoot(),
    updateCachePath: updateCachePath(),
    createPlatform,
    out: (s) => out.push(s),
    err: (s) => process.stderr.write(`${s}\n`),
    sleep,
    currentBranch: () => currentBranch(cwd),
    cwd,
    git,
    realpath,
    touchedAt,
    rm: (dir) => rm(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }), // retries: Windows holds files a moment after a process ends
    startClean: () => startClean(cwd),
  };
}

export async function main(argv, cwd = process.cwd()) {
  const out = [];
  const ctx = realContext(cwd, out);
  // `wait` must show its answer when it ends, and every other command prints at the end too: flush once, in order.
  const code = await run(argv, ctx);
  if (out.length) process.stdout.write(`${out.join('\n')}\n`);
  return code;
}
