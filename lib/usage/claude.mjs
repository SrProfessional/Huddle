import { readdirSync, readFileSync, realpathSync } from 'node:fs';
import path from 'node:path';

/** The directory name Claude Code derives from a checkout path. */
export const projectFolder = (root) => path.resolve(root).replace(/[^a-zA-Z0-9-]/g, '-');

const number = (value) => Number.isFinite(Number(value)) ? Number(value) : 0;

function cacheWrite(usage) {
  if (usage.cache_creation_input_tokens != null) return number(usage.cache_creation_input_tokens);
  return number(usage.cache_creation?.ephemeral_5m_input_tokens) + number(usage.cache_creation?.ephemeral_1h_input_tokens);
}

/** Reads Claude Code project transcripts without retaining their message text. */
/**
 * Issue #266: the name of the removed worktree `<checkout>/.claude/worktrees/<name>` that `value` is in, or null. Case counts as it does on the
 * filesystem: a path that differs only in case is that worktree only when both resolve to the same real folder.
 */
export function removedWorktreeName(value, checkouts) {
  if (typeof value !== 'string' || !value) return null;
  const resolved = path.resolve(value);
  for (const checkout of checkouts) {
    const base = path.join(path.resolve(checkout), '.claude', 'worktrees') + path.sep;
    const head = resolved.slice(0, base.length);
    if (head !== base) {
      if (head.toLowerCase() !== base.toLowerCase()) continue;
      let same = false;
      try { same = realpathSync.native(head) === realpathSync.native(base); } catch { /* one of them does not exist: not the same folder */ }
      if (!same) continue;
    }
    const name = resolved.slice(base.length).split(path.sep)[0];
    if (name) return name;
  }
  return null;
}

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
        // A folder name is ambiguous (`repo--claude-worktrees-x` is also the encoded `repo/.claude/worktrees/x`): when the line says where it ran, it must
        // be inside one of this checkout's worktrees.
        if (folderBranch !== null && typeof item.cwd === 'string' && removedWorktreeName(item.cwd, roots) === null) continue;
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
