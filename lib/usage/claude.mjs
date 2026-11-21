import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

/** The directory name Claude Code derives from a checkout path. */
export const projectFolder = (root) => path.resolve(root).replace(/[\\/:]/g, '-');

const number = (value) => Number.isFinite(Number(value)) ? Number(value) : 0;

/** Reads Claude Code project transcripts without retaining their message text. */
export function collectClaude({ roots, configDir, warn = () => {} }) {
  const records = [];
  const seen = new Set();
  for (const root of roots) {
    const project = path.join(configDir, 'projects', projectFolder(root));
    let names;
    try { names = readdirSync(project, { withFileTypes: true }); } catch { continue; }
    for (const entry of names) {
      if (!entry.isFile() || !entry.name.endsWith('.jsonl')) continue;
      const file = path.join(project, entry.name);
      let lines;
      try { lines = readFileSync(file, 'utf8').split(/\r?\n/); } catch { warn(`huddle usage: skipped unreadable Claude Code file ${file}`); continue; }
      for (const line of lines) {
        if (!line.trim()) continue;
        let item;
        try { item = JSON.parse(line); } catch { warn(`huddle usage: skipped a broken Claude Code line in ${file}`); continue; }
        const usage = item?.message?.usage;
        if (!usage || (item.type && item.type !== 'assistant')) continue;
        const id = item.requestId ?? item.message?.id;
        const key = `${file}\0${id ? `id:${id}` : `line:${item.timestamp ?? ''}:${JSON.stringify(usage)}`}`;
        if (seen.has(key)) continue;
        seen.add(key);
        records.push({
          day: String(item.timestamp ?? '').slice(0, 10), tool: 'Claude Code', model: item.message?.model ?? 'unknown', branch: item.gitBranch ?? null,
          input: number(usage.input_tokens), output: number(usage.output_tokens), cacheRead: number(usage.cache_read_input_tokens),
          cacheWrite: number(usage.cache_creation_input_tokens), reasoning: 0,
        });
      }
    }
  }
  return records.filter((r) => /^\d{4}-\d{2}-\d{2}$/.test(r.day));
}
