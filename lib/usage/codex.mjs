import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

const number = (value) => Number.isFinite(Number(value)) ? Number(value) : 0;
const samePath = (a, b) => path.resolve(a).toLowerCase() === path.resolve(b).toLowerCase();

function filesBelow(dir) {
  let entries;
  try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return []; }
  return entries.flatMap((entry) => {
    const file = path.join(dir, entry.name);
    return entry.isDirectory() ? filesBelow(file) : entry.isFile() && entry.name.endsWith('.jsonl') ? [file] : [];
  });
}

const usageOf = (item) => item?.payload?.info?.last_token_usage ?? item?.info?.last_token_usage ?? item?.token_count?.info?.last_token_usage ?? null;
const contextOf = (item) => item?.payload ?? item ?? {};

/** Reads Codex session transcripts, selecting only sessions whose cwd is one of this repo's worktrees. */
export function collectCodex({ roots, home, warn = () => {} }) {
  const records = [];
  const seen = new Set();
  for (const file of filesBelow(path.join(home, 'sessions'))) {
    let lines;
    try { lines = readFileSync(file, 'utf8').split(/\r?\n/); } catch { warn(`huddle usage: skipped unreadable Codex file ${file}`); continue; }
    let cwd = null;
    let model = null;
    for (const line of lines) {
      if (!line.trim()) continue;
      let item;
      try { item = JSON.parse(line); } catch { warn(`huddle usage: skipped a broken Codex line in ${file}`); continue; }
      const context = contextOf(item);
      cwd = context.cwd ?? item.cwd ?? cwd;
      model = context.model ?? item.model ?? model;
      const usage = usageOf(item);
      if (!usage || !cwd || !roots.some((root) => samePath(root, cwd))) continue;
      const key = `${file}\0${item.id ?? context.id ?? `${item.timestamp ?? ''}:${JSON.stringify(usage)}`}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const branch = context.gitBranch ?? item.gitBranch ?? roots.find((root) => samePath(root, cwd))?.split(/[\\/]/).at(-1) ?? null;
      records.push({
        day: String(item.timestamp ?? context.timestamp ?? '').slice(0, 10), tool: 'Codex', model: context.model ?? model ?? 'unknown', branch,
        input: number(usage.input_tokens), output: number(usage.output_tokens), cacheRead: number(usage.cached_input_tokens), cacheWrite: 0, reasoning: number(usage.reasoning_output_tokens),
      });
    }
  }
  return records.filter((r) => /^\d{4}-\d{2}-\d{2}$/.test(r.day));
}
