// Huddle: the real wiring of `bin/huddle`: the folder of the repo, the files, the adapter, the clock and the terminal.
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
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

export async function main(argv, cwd = process.cwd()) {
  const out = [];
  const ctx = {
    root: findRoot(cwd),
    readFile: (file) => { try { return readFileSync(file, 'utf8'); } catch { return null; } },
    createPlatform,
    out: (s) => out.push(s),
    err: (s) => process.stderr.write(`${s}\n`),
    sleep,
  };
  // `wait` must show its answer when it ends, and every other command prints at the end too: flush once, in order.
  const code = await run(argv, ctx);
  if (out.length) process.stdout.write(`${out.join('\n')}\n`);
  return code;
}
