// Huddle: the real wiring of `bin/huddle`: the folder of the repo, the files, the adapter, the clock and the terminal.
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
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

/** True when this CLI runs from an installed plugin (Claude Code's plugin cache or marketplaces folder, or CLAUDE_PLUGIN_ROOT set). No network. */
export function isInstalledPlugin(file = fileURLToPath(import.meta.url), env = process.env) {
  if (env.CLAUDE_PLUGIN_ROOT) return true;
  return /[\\/]plugins[\\/](cache|marketplaces)[\\/]/.test(file);
}

/**
 * The hook ends the process as soon as its output is flushed: a `gh`/`glab` child that is still running (a slow progress read that was dropped)
 * must not keep Node alive past the hook timeout. Other commands end by themselves.
 */
export function endProcess(argv, code, proc = process) {
  if (argv[0] !== 'hook') return;
  proc.stdout.write('', () => proc.exit(code));
}

export async function main(argv, cwd = process.cwd()) {
  const out = [];
  const ctx = {
    pluginInstalled: isInstalledPlugin(),
    root: findRoot(cwd),
    readFile: (file) => { try { return readFileSync(file, 'utf8'); } catch { return null; } },
    writeFile: (file, text) => writeFileSync(file, text),
    createPlatform,
    out: (s) => out.push(s),
    err: (s) => process.stderr.write(`${s}\n`),
    sleep,
    currentBranch: () => currentBranch(cwd),
  };
  // `wait` must show its answer when it ends, and every other command prints at the end too: flush once, in order.
  const code = await run(argv, ctx);
  if (out.length) process.stdout.write(`${out.join('\n')}\n`);
  return code;
}
