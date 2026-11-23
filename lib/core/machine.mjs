// Huddle: which machine of a login works on an Issue (Issue #283, docs/design.md §24). The id is made once and kept in the shared folder
// (~/.huddle), never in the repo; a session leaves a claim comment on the Issue it starts or takes, and the newest claim is the owner.
import path from 'node:path';
import { hostname } from 'node:os';
import { randomUUID } from 'node:crypto';

const MARKER = /<!--\s*huddle-machine:\s*([^\s>]+)\s*-->/;
const LINE = /Working on this from ([^\r\n<]+)/;

/** The file that holds this machine's { id, name }: the shared folder, or the folder of the update cache when a context has none. */
const fileOf = (ctx) => path.join(ctx.sharedDir ?? path.dirname(ctx.updateCachePath ?? path.join('.', 'x')), 'machine.json');

function read(ctx) {
  try {
    const v = JSON.parse(ctx.readFile(fileOf(ctx)) ?? '');
    return v && typeof v.id === 'string' && v.id ? { id: v.id, name: typeof v.name === 'string' && v.name ? v.name : null } : null;
  } catch { return null; }
}

/** This machine: { id, name }. The id is random, made the first time and kept; the name is the host name until someone sets one. */
export function machineOf(ctx) {
  const saved = read(ctx);
  const host = () => (ctx.hostName?.() ?? hostname()) || 'this machine';
  if (saved) return { id: saved.id, name: saved.name ?? host() };
  const made = { id: ctx.newMachineId?.() ?? randomUUID(), name: null };
  ctx.writeFile(fileOf(ctx), JSON.stringify(made));
  return { id: made.id, name: host() };
}

/** Sets the name of this machine and returns { id, name }. */
export function setMachineName(ctx, name) {
  const { id } = machineOf(ctx);
  ctx.writeFile(fileOf(ctx), JSON.stringify({ id, name }));
  return { id, name };
}

/** The comment a session leaves on an Issue: a visible line and the hidden marker with the machine id. */
export const claimBody = ({ id, name }) => `🖥️ Working on this from ${name}\n\n<!-- huddle-machine: ${id} -->\n`;

/** The newest claim among the comments of an Issue: { id, name }, or null when none. The last one wins; a tie goes to the later in the list. */
export function newestClaim(comments) {
  let best = null;
  let at = '';
  for (const c of comments ?? []) {
    const m = MARKER.exec(String(c.body ?? ''));
    if (!m) continue;
    const when = String(c.createdAt ?? '');
    if (best === null || when >= at) { best = { id: m[1], name: LINE.exec(c.body)?.[1].trim() ?? m[1] }; at = when; }
  }
  return best;
}

// --- worker marks (Issue #304, docs/design.md §24) -------------------------------------------------------------------------------------
// `labels --started` and `take` leave a mark per Issue in the shared folder: which session works on it and since when. `huddle next` reads it, with
// the Issue's own activity, to tell an Issue whose worker is gone (a closed chat, a computer turned off) from one that is being worked.

/** How long an Issue must show no activity, in a session other than the marked one, before its worker counts as gone. */
export const IDLE_MS = 15 * 60 * 1000;

/** The marks of a repo: { [issue]: { session, tool, at } }. A missing or broken file is no marks. */
export function readWorkers(ctx, file) {
  try {
    const v = JSON.parse(ctx.readFile(file) ?? '');
    return v && typeof v === 'object' && !Array.isArray(v) ? v : {};
  } catch { return {}; }
}

/** Marks that `issue` is worked on by `mark` ({ session, tool, at }). Marks older than 30 days are dropped on the way. */
export function markWorker(ctx, file, issue, mark) {
  const all = readWorkers(ctx, file);
  for (const [n, m] of Object.entries(all)) if (!(Number(m?.at) > mark.at - 30 * 24 * 3600 * 1000)) delete all[n];
  all[issue] = mark;
  ctx.writeFile(file, JSON.stringify(all));
}

/** Ends the mark of `issue` (its PR/MR was opened, it was paused or stopped). */
export function clearWorker(ctx, file, issue) {
  const all = readWorkers(ctx, file);
  if (!(issue in all)) return;
  delete all[issue];
  ctx.writeFile(file, JSON.stringify(all));
}

/**
 * Whether nobody works on an active Issue now. `mark` is its worker mark (or null), `session` the id of the session that asks, `activityAt` the newest
 * sign of work on its branch (a commit, a touched worktree; ms or null), `bootAt` when the machine last started (ms or null). Pure.
 * Gone when: all the signs are older than the last boot (a restart ends every session, so the session id proves nothing); or, in a session other
 * than the marked one, the Issue shows no activity for IDLE_MS. The marked session itself is the worker, so it is never gone for its own check.
 */
export function workerGone({ mark = null, session = null, activityAt = null, bootAt = null, now, idleMs = IDLE_MS }) {
  const seen = [Number(mark?.at), Number(activityAt)].filter((n) => Number.isFinite(n) && n > 0);
  if (!seen.length) return true;
  const last = Math.max(...seen);
  if (bootAt && last < bootAt) return true;
  if (session && mark?.session === session) return false;
  return now - last >= idleMs;
}
