import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

/** The directory name Claude Code derives from a checkout path. */
export const projectFolder = (root) => path.resolve(root).replace(/[^a-zA-Z0-9-]/g, '-');

const number = (value) => Number.isFinite(Number(value)) ? Number(value) : 0;

function cacheWrite(usage) {
  if (usage.cache_creation_input_tokens != null) return number(usage.cache_creation_input_tokens);
  return number(usage.cache_creation?.ephemeral_5m_input_tokens) + number(usage.cache_creation?.ephemeral_1h_input_tokens);
}

/** Reads Claude Code project transcripts without retaining their message text. */
export function collectClaude({ roots, configDir, warn = () => {} }) {
  const records = [];
  const seen = new Set();
  const known = new Set(roots.map((root) => projectFolder(root)));
  // Issue #266: a finished worktree is removed (docs/design.md §16), but its transcripts stay under `<checkout>/.claude/worktrees/<branch>`'s own folder.
  // Those folders are read too; the folder name stands in for the branch when a line carries none.
  const prefixes = [...new Set(roots.map((root) => `${projectFolder(root)}--claude-worktrees-`))];
  let removed = [];
  try { removed = readdirSync(path.join(configDir, 'projects'), { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name); } catch { /* no projects folder yet */ }
  const sources = [
    ...roots.map((root) => ({ folder: projectFolder(root), branch: null })),
    ...removed.flatMap((name) => {
      const prefix = prefixes.find((p) => name.startsWith(p));
      return prefix && name.length > prefix.length && !known.has(name) ? [{ folder: name, branch: name.slice(prefix.length) }] : [];
    }),
  ];
  for (const { folder, branch: folderBranch } of sources) {
    const project = path.join(configDir, 'projects', folder);
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
          day: String(item.timestamp ?? '').slice(0, 10), tool: 'Claude Code', model: item.message?.model ?? 'unknown', branch: item.gitBranch ?? folderBranch,
          input: number(usage.input_tokens), output: number(usage.output_tokens), cacheRead: number(usage.cache_read_input_tokens),
          cacheWrite: cacheWrite(usage), reasoning: 0,
        });
      }
    }
  }
  return records.filter((r) => /^\d{4}-\d{2}-\d{2}$/.test(r.day));
}
