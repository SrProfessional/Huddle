// Huddle: the real wiring of `bin/huddle`: the folder of the repo, the files, the adapter, the clock and the terminal.
import { execFileSync, spawn, spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync, mkdirSync, realpathSync, statSync, readdirSync, unlinkSync, linkSync, copyFileSync } from 'node:fs';
import { rm } from 'node:fs/promises';
import { homedir, uptime } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as sleep } from 'node:timers/promises';
import { createPlatform } from '../platform/index.mjs';
import { run, labelsFiles } from './run.mjs';
import { setupStatus } from '../setup/update.mjs';
import { defaultBranchFile } from './config.mjs';

/** The nearest folder upward from `from` that holds a huddle.json; `from` itself when there is none (the error then names it). */
export function findRoot(from) {
  // Issue #179: the search never climbs out of the git repo. A worktree under .claude/worktrees/ of the main checkout is its own repo top-level:
  // it must not take the main checkout's huddle.json, and a branch with none (made before Huddle was set up) has the top-level as its root, where
  // the config is then read from the default branch.
  let top = null;
  try { top = execFileSync('git', ['rev-parse', '--show-toplevel'], { cwd: from, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], windowsHide: true }).trim() || null; } catch { top = null; }
  const stop = top ? path.resolve(top) : null;
  for (let dir = path.resolve(from); ; dir = path.dirname(dir)) {
    if (existsSync(path.join(dir, 'huddle.json'))) return dir;
    if (stop && sameDir(dir, stop)) return dir;
    if (path.dirname(dir) === dir) return path.resolve(from);
  }
}

/** Whether two folders are the same, whatever the case or the short (8.3) form on Windows. */
function sameDir(a, b) {
  const real = (p) => { try { return realpathSync.native(p); } catch { return path.resolve(p); } };
  return real(a).toLowerCase() === real(b).toLowerCase();
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

/**
 * Opens `file` with the system's program (Issue #232: the dashboard in the browser): `explorer.exe` on Windows, `open` on macOS, `xdg-open` elsewhere.
 * The path is one argument of a program, never text for a shell (cmd.exe would read an `&` in a folder name as a second command). Never throws and never
 * waits; a machine with no program to open it only misses the window, the path was printed.
 */
export function openFile(file, platform = process.platform, start = spawn) {
  try {
    const [command, args] = platform === 'win32' ? ['explorer.exe', [file]] : platform === 'darwin' ? ['open', [file]] : ['xdg-open', [file]];
    const child = start(command, args, { detached: true, stdio: 'ignore', windowsHide: true });
    child.on('error', () => {});
    child.unref();
  } catch { /* no program to open it */ }
}

/** Starts `huddle clean --quiet` as a process of its own that outlives the hook (docs/design.md §16). Never throws and never waits. */
export function startClean(cwd, root = pluginRoot()) {
  const child = spawn(process.execPath, [path.join(root, 'bin', 'huddle'), 'clean', '--quiet'], { cwd, detached: true, stdio: 'ignore', windowsHide: true });
  child.on('error', () => {}); // a failed start is no reason to break the session
  child.unref();
}

/**
 * Reserves `now` if at least `ms` passed since the last reservation in `file` (Issue #230), atomically across processes and with no lock
 * (fifth review of PR #245). Reservations form a chain of files `<file>.<n>`, each holding its time: the next one is published under the
 * name the last one determines (`<file>.<n+1>`), written in full to a file of this caller's first and then hard-linked into place, which
 * fails for every caller but one. So exactly one caller reserves each step, a loser then reads the winner's time, no caller ever moves or
 * deletes another's reservation, and a full `ms` always separates two reservations, whatever the clock hour. Links older than the one
 * before the last are removed, best effort. True only for the caller that published the new link.
 */
export function reserveWindow(file, now, ms, { beforeLink = () => {} } = {}) {
  const dir = path.dirname(file);
  const base = path.basename(file);
  mkdirSync(dir, { recursive: true });
  const chain = () => readdirSync(dir).map((name) => (name.startsWith(`${base}.`) ? name.slice(base.length + 1) : '')).filter((x) => /^\d+$/.test(x)).map(Number);
  let last = 0;
  try { last = Math.max(0, ...chain()); } catch { return false; } // a folder that cannot be read: nobody pushes, the safe side
  if (last > 0) {
    let at = NaN;
    try { at = Number(readFileSync(path.join(dir, `${base}.${last}`), 'utf8')); } catch { return false; }
    if (!Number.isFinite(at) || now - at < ms) return false;
  }
  const temp = path.join(dir, `${base}.tmp-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  try {
    writeFileSync(temp, String(now));
    beforeLink(); // a test pauses the caller here (sixth review of PR #245)
    linkSync(temp, path.join(dir, `${base}.${last + 1}`)); // fails (EEXIST) for every caller but one
  } catch {
    return false; // another caller published this step first: its time holds
  } finally {
    try { unlinkSync(temp); } catch { /* already gone */ }
  }
  // Sixth review of PR #245: a caller suspended between choosing and publishing its step may find that name free again (the cleanup
  // below removed it after others moved on). Its link then sits under a newer one: it did not reserve, and the newer one holds.
  try { if (Math.max(...chain()) > last + 1) return false; } catch { return false; }
  try {
    for (const n of chain()) if (n < last) unlinkSync(path.join(dir, `${base}.${n}`));
  } catch { /* an old link left behind costs nothing */ }
  return true;
}

/**
 * Starts `huddle <args>` as a process of its own that outlives this one (Issue #201: the Codex wait). Never throws and never waits.
 * Returns the child's pid (the Player's watch records it as the owner of its claim, Issue #248), or null when it could not start.
 */
export function startDetached(cwd, args, root = pluginRoot()) {
  try {
    const child = spawn(process.execPath, [path.join(root, 'bin', 'huddle'), ...args], { cwd, detached: true, stdio: 'ignore', windowsHide: true });
    child.on('error', () => {});
    child.unref();
    return Number.isInteger(child.pid) ? child.pid : null;
  } catch { return null; }
}

/** Whether process `pid` still runs on this machine. A process of another user (EPERM) runs too. */
export function isAlive(pid) {
  try { process.kill(pid, 0); return true; } catch (e) { return e?.code === 'EPERM'; }
}

/**
 * The `codex` command (Issue #201): the one on the PATH (not an npm shim), else the newest one bundled with the OpenAI VS Code extension
 * (`<home>/.vscode*\/extensions/openai.chatgpt-<version>/bin/<platform>/codex[.exe]`), else null.
 */
export function findCodex({
  home = homedir(), platform = process.platform,
  onPath = () => { try { const r = spawnSync(platform === 'win32' ? 'where.exe' : 'which', ['codex'], { windowsHide: true, timeout: 10000, encoding: 'utf8' }); return r.status === 0 ? r.stdout.split(/\r?\n/).map((l) => l.trim()).filter(Boolean) : null; } catch { return null; } },
  readdir = (d) => readdirSync(d), exists = (f) => existsSync(f),
} = {}) {
  // A program on the PATH, but not an npm shim (.cmd/.ps1): those need a shell, and a shell would not quote the message.
  const found = [onPath() ?? []].flat().find((f) => !/\.(cmd|bat|ps1)$/i.test(f));
  if (found) return found;
  const exe = platform === 'win32' ? 'codex.exe' : 'codex';
  const version = (name) => (name.match(/-(\d+(?:\.\d+)*)/)?.[1] ?? '0').split('.').map(Number);
  const newer = (a, b) => { const x = version(a); const y = version(b); for (let i = 0; i < Math.max(x.length, y.length); i++) if ((x[i] ?? 0) !== (y[i] ?? 0)) return (y[i] ?? 0) - (x[i] ?? 0); return 0; };
  for (const editor of ['.vscode', '.vscode-insiders', '.cursor']) {
    const dir = `${home}/${editor}/extensions`;
    let names = [];
    try { names = readdir(dir).filter((n) => n.startsWith('openai.chatgpt-')).sort(newer); } catch { continue; }
    for (const name of names) {
      let plats = [];
      try { plats = readdir(`${dir}/${name}/bin`); } catch { continue; }
      for (const p of plats) { const f = `${dir}/${name}/bin/${p}/${exe}`; if (exists(f)) return f; }
    }
  }
  return null;
}

/**
 * Queues `message` into Codex session `thread` (`codex queue`); an open Codex chat takes it and answers by itself. Best effort: never throws.
 * Returns { queued, resumed, warning | error }: `codex queue --resume` exits 0 when the message is queued even if it could not resume the
 * session (it warns «could not resume thread…»), so «queued» and «woken» are told apart from its output (Issue #248).
 */
export function codexQueue(thread, message) {
  const bin = findCodex();
  if (!bin) return { queued: false, resumed: false, error: 'the codex command was not found' };
  try {
    const r = spawnSync(bin, ['queue', '--thread', thread, '--message', message, '--resume'], { windowsHide: true, timeout: 60000, encoding: 'utf8' });
    const lines = [r.stderr ?? '', r.stdout ?? ''].join('\n').split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    if (r.status !== 0) return { queued: false, resumed: false, error: lines[0] || `codex queue ended with ${r.status ?? r.signal ?? r.error?.code}` };
    const warning = lines.find((l) => /could not resume/i.test(l));
    return warning ? { queued: true, resumed: false, warning } : { queued: true, resumed: true };
  } catch (e) { return { queued: false, resumed: false, error: String(e?.message ?? e) }; }
}

/**
 * Starts the labels pass of the session start (docs/design.md §22) as a process of its own that outlives the hook. Its count goes to `countFile`, which the next
 * hook or notice reads. Never throws and never waits.
 */
export function startLabels(cwd, args, countFile, root = pluginRoot()) {
  const child = spawn(process.execPath, [path.join(root, 'bin', 'huddle'), ...args], { cwd, detached: true, stdio: 'ignore', windowsHide: true, env: { ...process.env, HUDDLE_LABELS_COUNT_FILE: countFile } });
  child.on('error', () => {});
  child.unref();
}

/** True when this CLI runs from an installed plugin (Claude Code's plugin cache or marketplaces folder, or CLAUDE_PLUGIN_ROOT set). No network. */
export function isInstalledPlugin(file = fileURLToPath(import.meta.url), env = process.env) {
  if (env.CLAUDE_PLUGIN_ROOT) return true;
  return /[\\/]plugins[\\/](cache|marketplaces)[\\/]/.test(file);
}

/** Which tool runs Huddle (Issue #199): OpenAI Codex sets its own PLUGIN_ROOT (and CLAUDE_PLUGIN_ROOT too, for compatibility); Claude Code only the second. */
export const toolOf = (env = process.env) => (env.PLUGIN_ROOT ? 'codex' : 'claude');

/** The folder of the running plugin: CLAUDE_PLUGIN_ROOT, else the folder this file sits in (a clone). */
export function pluginRoot(env = process.env, file = fileURLToPath(import.meta.url)) {
  return env.CLAUDE_PLUGIN_ROOT || path.resolve(path.dirname(file), '..', '..');
}

/** The update cache: in the plugin's own data folder when Claude Code gives one, else under the Claude Code config folder. Never in the repo. */
export function updateCachePath(env = process.env, home = homedir()) {
  const dir = env.CLAUDE_PLUGIN_DATA || env.CLAUDE_CONFIG_DIR || path.join(home, '.claude');
  return path.join(dir, 'huddle-update.json');
}

/** Claude Code's list of installed plugins (Issue #143): where the update notice reads the scope Huddle is installed in. */
export function installedPluginsPath(env = process.env, home = homedir()) {
  return path.join(env.CLAUDE_CONFIG_DIR || path.join(home, '.claude'), 'plugins', 'installed_plugins.json');
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
    // An exclusive create (the Player's watch lock, Issue #248): false when the file already exists, so only one caller gets it.
    createExclusive: (file, text) => { mkdirSync(path.dirname(file), { recursive: true }); try { writeFileSync(file, text, { flag: 'wx' }); return true; } catch (e) { if (e?.code === 'EEXIST') return false; throw e; } },
    copyFile: (from, to) => { mkdirSync(path.dirname(to), { recursive: true }); copyFileSync(from, to); }, // Issue #232: the dashboard's scripts
    openFile: (file) => openFile(file),
    removeFile: (file) => { try { unlinkSync(file); } catch { /* already gone */ } },
    fetch: (url, opts) => fetch(url, opts),
    now: () => new Date(),
    pluginRoot: pluginRoot(),
    tool: toolOf(),
    updateCachePath: updateCachePath(),
    installedPluginsPath: installedPluginsPath(),
    createPlatform,
    out: (s) => out.push(s),
    err: (s) => process.stderr.write(`${s}\n`),
    sleep,
    currentBranch: () => currentBranch(cwd),
    cwd,
    git,
    // Issue #179: the default branch's copy of a file, read from git, for a branch that has none (huddle.json, the CLAUDE.md block).
    fileFallback: (name) => defaultBranchFile(name, (args) => git(args, { cwd, timeoutMs: 5000 })),
    configFallback: () => defaultBranchFile('huddle.json', (args) => git(args, { cwd, timeoutMs: 5000 })),
    realpath,
    touchedAt,
    rm: (dir) => rm(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }), // retries: Windows holds files a moment after a process ends
    startClean: () => startClean(cwd),
    startDetached: (args) => startDetached(cwd, args),
    pid: process.pid, // the Player's watch records it as the owner of its claim (Issue #248)
    isAlive,
    bootTime: () => Date.now() - uptime() * 1000, // Issue #304: a session or a pid older than this is gone with the restart
    reserveWindow: (file, now, ms) => reserveWindow(file, now, ms),
    codexThread: process.env.CODEX_THREAD_ID || null, // set by OpenAI Codex for the commands its agent runs (Issue #201)
    // Issue #211: the watch's files in one tool-neutral folder, and the session that runs this command (Codex first: a Codex launched from
    // Claude Code inherits CLAUDE_CODE_SESSION_ID).
    sharedDir: path.join(homedir(), '.huddle'),
    // Issue #215: is there a Codex on this machine, and is Huddle installed in it (its plugin cache under CODEX_HOME)?
    codexState: () => {
      const codex = findCodex();
      if (!codex) return { codex: null, installed: false };
      const home = process.env.CODEX_HOME || path.join(homedir(), '.codex');
      return { codex, installed: existsSync(path.join(home, 'plugins', 'cache', 'huddle')) };
    },
    session: process.env.CODEX_THREAD_ID ? { tool: 'codex', id: process.env.CODEX_THREAD_ID } : { tool: 'claude', id: process.env.CLAUDE_CODE_SESSION_ID || null },
    // Issue #209: the person's language. A tool-neutral file (Claude Code and Codex read the same one), Claude Code's own setting, the locale.
    languageFile: path.join(homedir(), '.huddle', 'language.json'),
    claudeSettingsPath: path.join(process.env.CLAUDE_CONFIG_DIR || path.join(homedir(), '.claude'), 'settings.json'),
    locale: (() => { try { return Intl.DateTimeFormat().resolvedOptions().locale; } catch { return null; } })(),
    codexNoNetwork: process.env.CODEX_SANDBOX_NETWORK_DISABLED === '1', // Codex's sandbox with no network (Issue #202)
    codexQueue: (thread, message) => codexQueue(thread, message),
    startLabels: (args) => startLabels(cwd, args, labelsFiles({ updateCachePath: updateCachePath(), root: findRoot(cwd) }).count),
    labelsCountFile: process.env.HUDDLE_LABELS_COUNT_FILE || null, // set only for the pass the hook started
    setupStatus: (root) => setupStatus(root),
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
