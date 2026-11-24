// Huddle: which of a Player's assigned Issues start now and which wait, by effort and capacity (Issue #164, docs/design.md §24). Pure: the
// caller gives the active Issues (in progress, or with changes requested) and the candidates (assigned, ready, no stop label, not a Design Issue).
import { effortOf, allowedFilesOf } from './effort.mjs';

/**
 * Issue #318: an interrupted Issue of this login (`interrupted`) does not wait for the active Issue of ANOTHER login (`forLogin`) that has a higher number: the other side
 * is read the same way, so it sees this lower number as the holder and waits. Without it each side would wait for the other and neither would resume. Pure.
 */
export const yields = (candidate, holder) => Boolean(candidate.interrupted && holder.forLogin && holder.number > candidate.number);

/**
 * Issue #318: the circles of interrupted Issues across logins that `yields` breaks, as texts: the interrupted Issue (`mine`, a list of Issues) and the foreign holders
 * (`foreign`, Issues with `forLogin`) that share an allowed file with it and have a higher number. Pure.
 */
export function crossLoginCircles({ mine = [], foreign = [], login = '' } = {}) {
  const out = [];
  for (const it of mine.filter((i) => i.interrupted)) {
    const files = allowedFilesOf(it.body);
    for (const f of foreign.filter((x) => yields(it, x))) {
      const file = allowedFilesOf(f.body).find((p) => files.includes(p));
      if (file) out.push(`interrupted in a circle across logins: #${it.number} (${login}) and #${f.number} (${f.forLogin}) share ${file}; #${it.number} goes first (the lower number), #${f.number} waits for it`);
    }
  }
  return out;
}

/**
 * { start: [Issue], wait: [{ issue, why }], used, capacity }. Order: blocking bugs first, then the oldest. An Issue goes in while the active
 * effort stays within the capacity; two Issues that share an allowed file never run at once; an Issue bigger than the whole capacity runs
 * alone when nothing else is active (work that runs on another machine does not count as active here: Issue #283). A wait for a shared file carries `clash: { with, file }` (Issue #250: the board shows it as `blocked` when `with` is active work).
 */
export function schedule({ active = [], candidates = [], capacity = 5, total = null }) {
  // Issue #283: an active Issue that runs on another machine (`elsewhere`: that machine's name) uses none of this machine's room, but its files still hold.
  // Issue #291: a parked Issue (paused, waiting for a decision or for a dependency) uses no room either; its files hold only when the caller says so (`holds`: it has a branch with commits). `total` is the one count the caller shows as «in use» (the sum of all active work, also the requests waiting to be resumed that this weighing does not add): the messages read it, so they say the same as the total.
  // Issue #313: an active Issue of ANOTHER login (`forLogin`: that login) holds its files against this one's candidates but uses none of this login's points.
  // Issue #303: an active Issue that waits only for a file (`fileWait`) uses no room either, and keeps holding its files and its place.
  const running = active.filter((i) => !i.parked || i.holds).map((i) => ({ number: i.number, effort: i.elsewhere || i.parked || i.fileWait || i.forLogin ? 0 : effortOf(i.body), files: allowedFilesOf(i.body), elsewhere: i.elsewhere ?? null, parked: i.parked ?? null, forLogin: i.forLogin ?? null }));
  let used = running.reduce((n, r) => n + r.effort, 0);
  const start = [];
  const wait = [];
  const ordered = [...candidates].sort((a, b) => (Number(Boolean(b.blocking)) - Number(Boolean(a.blocking))) || a.number - b.number);
  for (const it of ordered) {
    const effort = effortOf(it.body);
    const files = allowedFilesOf(it.body);
    if (used > capacity) {
      wait.push({ issue: it.number, why: `${total ?? used} of ${capacity} points in use: finish one first` });
      continue;
    }
    const clash = running.find((r) => !yields(it, r) && r.files.some((f) => files.includes(f)));
    if (clash) {
      const file = clash.files.find((f) => files.includes(f));
      wait.push({ issue: it.number, why: clash.forLogin ? `shares ${file} with #${clash.number}, which runs for ${clash.forLogin}${clash.parked ? ` (${clash.parked})` : ''}: it waits until that one is done` : clash.elsewhere ? `shares ${file} with #${clash.number}, which runs on ${clash.elsewhere}` : clash.parked ? `shares ${file} with #${clash.number}, which is ${clash.parked}: it waits until that one is done` : `shares ${file} with #${clash.number}: it waits until that one is done`, clash: { with: clash.number, file } });
      continue;
    }
    if (effort > capacity) {
      if (running.every((r) => r.elsewhere || r.forLogin)) {
        start.push(it);
        running.push({ number: it.number, effort, files });
        used += effort;
      } else wait.push({ issue: it.number, why: `bigger than the capacity (${effort} of ${capacity}): it runs alone, when nothing else is active` });
      continue;
    }
    if (used + effort <= capacity) {
      start.push(it);
      running.push({ number: it.number, effort, files });
      used += effort;
    } else wait.push({ issue: it.number, why: `no room: ${total ?? used} of ${capacity} points in use, it needs ${effort}` });
  }
  return { start, wait, used, capacity };
}

/**
 * Issue #302: a circle of waits. `links` are `{ from, to, kind: 'dependency' | 'file', file? }` («from» waits for «to»). Returns the first circle
 * found, `{ path: [a, b, c, a], links: [...] }` in walking order, or null when no chain comes back to where it began. Pure.
 */
export function findCycle(links) {
  const next = new Map();
  for (const l of links) next.set(l.from, [...(next.get(l.from) ?? []), l]);
  const done = new Set();
  const walk = (node, trail) => {
    const at = trail.findIndex((l) => l.from === node);
    if (at >= 0) { const ring = trail.slice(at); return { path: [...ring.map((l) => l.from), node], links: ring }; }
    if (done.has(node)) return null;
    for (const l of next.get(node) ?? []) {
      const found = walk(l.to, [...trail, l]);
      if (found) return found;
    }
    done.add(node);
    return null;
  };
  for (const start of [...next.keys()].sort((a, b) => a - b)) {
    const found = walk(start, []);
    if (found) return found;
  }
  return null;
}

/** Issue #302: the circle in words and the link the Coach can break: a file link by pausing its holder (a pause frees its files), else a dependency. */
export function cycleText(cycle) {
  const ring = cycle.path.map((n) => `#${n}`).join(' → ');
  const file = cycle.links.find((l) => l.kind === 'file');
  const breakIt = file
    ? `pause #${file.to} (a paused Issue frees its files, so #${file.from} no longer waits for ${file.file}) or reorder the Issues`
    : `change the «Depends on» of #${cycle.links[0].from}, which waits for #${cycle.links[0].to}`;
  return { text: `circular wait: ${ring}`, breakIt: `to break it, ${breakIt}` };
}

/**
 * Issue #303: which active Issues really wait only for a file. `links` are `{ from, to, file }` («from» cannot go on because «to» holds `file`).
 * Returns `{ waiting: [link], circles: [text] }`. Two Issues never wait for each other: a circle is resolved by the order the scheduler already
 * uses (the older Issue number goes first, so its link in the circle is dropped) and `circles` says so. A holder that itself waits does not
 * count, so the Issue behind it is not a file wait. Pure.
 */
export function settleFileWaits(links) {
  let rest = [...links];
  const circles = [];
  const ringOf = () => findCycle(rest.map((l) => ({ ...l, kind: 'file' })));
  for (let ring = ringOf(); ring; ring = ringOf()) {
    const first = Math.min(...ring.links.map((l) => l.from));
    const at = ring.links.findIndex((l) => l.from === first);
    const order = [...ring.links.slice(at), ...ring.links.slice(0, at)].map((l) => l.from);
    circles.push(`file waits in a circle: ${[...order, first].map((n) => `#${n}`).join(' → ')}; #${first} goes first (the older Issue), the others wait for it`);
    const cut = ring.links[at];
    rest = rest.filter((l) => !(l.from === cut.from && l.to === cut.to && l.file === cut.file));
  }
  const waits = new Map();
  const isWaiting = (n) => {
    if (!waits.has(n)) waits.set(n, rest.some((l) => l.from === n && !isWaiting(l.to)));
    return waits.get(n);
  };
  return { waiting: rest.filter((l) => isWaiting(l.from) && !isWaiting(l.to)), circles };
}
