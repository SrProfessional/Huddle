// Huddle: which worktrees are finished (docs/design.md §16). Pure logic: git and the file system come in as plain functions, so it runs the same
// on Windows, macOS and Linux and tests need no process.

/** A worktree must be untouched this long before it can be removed: a branch just made from main is clean and «merged» too. */
export const GRACE_MS = 24 * 3600 * 1000;

/** The entries of `git worktree list --porcelain`: { path, head, branch (null when detached), detached, locked, bare, prunable }. */
export function parseWorktrees(text) {
  const list = [];
  let current = null;
  for (const line of String(text ?? '').split(/\r?\n/)) {
    if (line.startsWith('worktree ')) {
      current = { path: line.slice('worktree '.length), head: null, branch: null, detached: false, locked: false, bare: false, prunable: false };
      list.push(current);
    } else if (current) {
      if (line.startsWith('HEAD ')) current.head = line.slice('HEAD '.length);
      else if (line.startsWith('branch ')) current.branch = line.slice('branch '.length).replace(/^refs\/heads\//, '');
      else if (line === 'detached') current.detached = true;
      else if (line === 'bare') current.bare = true;
      else if (line === 'locked' || line.startsWith('locked ')) current.locked = true;
      else if (line === 'prunable' || line.startsWith('prunable ')) current.prunable = true;
    }
  }
  return list;
}

/**
 * One form for a path, to compare what git prints (`D:/x`) with what Node gives (`D:\x`): forward slashes, no trailing slash, and lower case on
 * Windows and macOS, whose default file systems ignore case. Linux keeps the case.
 */
export function normalizePath(p, { platform = process.platform } = {}) {
  let n = String(p).replaceAll('\\', '/');
  if (n.length > 1) n = n.replace(/\/+$/, '');
  return platform === 'win32' || platform === 'darwin' ? n.toLowerCase() : n;
}

/**
 * Decides every worktree but the main one (the first entry). Returns [{ path, remove, reason }]; `reason` says why a worktree stays.
 *   worktrees   parseWorktrees() of the repo; the first is the main worktree
 *   cwd         where the command runs: that worktree stays
 *   platform    process.platform
 *   canonical   path -> real path (fs.realpathSync, falling back to the path itself); default: as is
 *   baseFound   false when no default branch could be resolved: then nothing is removed
 *   isClean(path), isMerged(head), touchedAt(path) -> ms | null, now (ms)
 * The cheap checks come first, so git is not asked about a worktree that stays anyway.
 */
export function planClean({ worktrees, cwd, platform = process.platform, canonical = (p) => p, baseFound, isClean, isMerged, touchedAt, now }) {
  const norm = (p) => normalizePath(canonical(p), { platform });
  const [main, ...rest] = worktrees;
  if (!main) return [];
  const base = `${norm(main.path)}/.claude/worktrees/`;
  const here = norm(cwd);
  const inside = (child, parent) => child === parent || child.startsWith(parent.endsWith('/') ? parent : `${parent}/`);
  return rest.map((w) => {
    const keep = (reason) => ({ path: w.path, remove: false, reason });
    const at = norm(w.path);
    if (w.bare) return keep('bare');
    if (!at.startsWith(base) || at.slice(base.length).includes('/')) return keep('outside .claude/worktrees');
    if (inside(here, at)) return keep('current worktree');
    if (w.locked) return keep('locked');
    if (w.prunable) return keep('its folder is missing (git worktree prune clears it)');
    if (!baseFound) return keep('default branch not found, so nothing can be called merged');
    const touched = touchedAt(w.path);
    if (touched === null || touched === undefined || now - touched < GRACE_MS) return keep('touched less than 24 hours ago');
    if (!isClean(w.path)) return keep('uncommitted changes');
    if (!w.head || !isMerged(w.head)) return keep('not merged');
    return { path: w.path, remove: true };
  });
}
