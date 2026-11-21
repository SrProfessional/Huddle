import { readdirSync, readFileSync, realpathSync } from 'node:fs';
import path from 'node:path';

const number = (value) => Number.isFinite(Number(value)) ? Number(value) : 0;
function realPath(value) {
  try { return realpathSync.native(value); } catch { return null; }
}

function filesBelow(dir) {
  let entries;
  try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return []; }
  return entries.flatMap((entry) => {
    const file = path.join(dir, entry.name);
    return entry.isDirectory() ? filesBelow(file) : entry.isFile() && entry.name.endsWith('.jsonl') ? [file] : [];
  });
}

const infoOf = (item) => item?.payload?.info ?? item?.info ?? item?.token_count?.info;
const contextOf = (item) => item?.payload ?? item ?? {};
const tokenFields = ['input_tokens', 'cached_input_tokens', 'output_tokens', 'reasoning_output_tokens', 'total_tokens'];
const snapshot = (usage) => tokenFields.map((field) => number(usage[field])).join(':');

/** Reads Codex session transcripts, selecting only sessions whose cwd is one of this repo's worktrees. */
export function collectCodex({ roots, checkoutBranches = new Map(), home, warn = () => {} }) {
  const records = [];
  const checkouts = new Set(roots.map((root) => path.resolve(root)));
  const folded = new Set([...checkouts].map((root) => root.toLowerCase()));
  const canonical = new Map([...checkouts].map((root) => [realPath(root), root]).filter(([key]) => key !== null));
  const paths = new Map();
  const keyFor = (value) => {
    if (!paths.has(value)) {
      const resolved = path.resolve(value);
      // Only probe spelling variants of known checkouts. The filesystem decides whether case matters.
      const key = checkouts.has(resolved) ? resolved : folded.has(resolved.toLowerCase()) ? canonical.get(realPath(resolved)) : undefined;
      paths.set(value, key);
    }
    return paths.get(value);
  };
  const branches = new Map([...checkoutBranches].map(([root, branch]) => [keyFor(root), branch]));
  // Issue #266: a session in a removed worktree (`<checkout>/.claude/worktrees/<name>`, docs/design.md §16) still counts, and its folder name is the branch.
  const removedWorktree = (value) => {
    const resolved = path.resolve(value);
    for (const checkout of checkouts) {
      const base = path.join(checkout, '.claude', 'worktrees') + path.sep;
      if (resolved.toLowerCase().startsWith(base.toLowerCase())) {
        const name = resolved.slice(base.length).split(path.sep)[0];
        if (name) { const key = path.join(base, name); branches.set(key, name); return key; }
      }
    }
    return undefined;
  };
  for (const file of filesBelow(path.join(home, 'sessions'))) {
    let lines;
    try { lines = readFileSync(file, 'utf8').split(/\r?\n/); } catch { warn(`huddle usage: skipped unreadable Codex file ${file}`); continue; }
    let cwd = null;
    let model = null;
    let lastSnapshot = null;
    const totals = new Set();
    const eventIds = new Set();
    for (const line of lines) {
      if (!line.trim()) continue;
      let item;
      try { item = JSON.parse(line); } catch { warn(`huddle usage: skipped a broken Codex line in ${file}`); continue; }
      const context = contextOf(item);
      if (item.type === 'turn_context' || item.type === 'session_meta' || context.type === 'task_started') lastSnapshot = null;
      cwd = context.cwd ?? item.cwd ?? cwd;
      model = context.model ?? item.model ?? model;
      const info = infoOf(item);
      const usage = info?.last_token_usage;
      if (!usage || typeof cwd !== 'string') continue;
      const checkout = keyFor(cwd) ?? removedWorktree(cwd);
      if (!checkout) continue;
      const day = String(item.timestamp ?? context.timestamp ?? '').slice(0, 10);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) continue;
      const total = info.total_token_usage ? snapshot(info.total_token_usage) : null;
      // When cumulative usage is absent, only collapse repeated snapshots within a turn.
      const current = JSON.stringify([checkout, model, snapshot(usage)]);
      const id = item.id;
      if ((id && eventIds.has(id)) || (total ? totals.has(total) : current === lastSnapshot)) continue;
      if (id) eventIds.add(id);
      if (total) totals.add(total);
      lastSnapshot = current;
      const branch = context.gitBranch ?? item.gitBranch ?? branches.get(checkout) ?? null;
      records.push({
        day, tool: 'Codex', model: model ?? 'unknown', branch,
        input: number(usage.input_tokens), output: number(usage.output_tokens), cacheRead: number(usage.cached_input_tokens), cacheWrite: 0, reasoning: number(usage.reasoning_output_tokens),
      });
    }
  }
  return records;
}
