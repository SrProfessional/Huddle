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
