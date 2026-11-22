// Huddle: which of a Player's assigned Issues start now and which wait, by effort and capacity (Issue #164, docs/design.md §24). Pure: the
// caller gives the active Issues (in progress, or with changes requested) and the candidates (assigned, ready, no stop label, not a Design Issue).
import { effortOf, allowedFilesOf } from './effort.mjs';

/**
 * { start: [Issue], wait: [{ issue, why }], used, capacity }. Order: blocking bugs first, then the oldest. An Issue goes in while the active
 * effort stays within the capacity; two Issues that share an allowed file never run at once; an Issue bigger than the whole capacity runs
 * alone when nothing else is active (work that runs on another machine does not count as active here: Issue #283). A wait for a shared file carries `clash: { with, file }` (Issue #250: the board shows it as `blocked` when `with` is active work).
 */
export function schedule({ active = [], candidates = [], capacity = 5, total = null }) {
  // Issue #283: an active Issue that runs on another machine (`elsewhere`: that machine's name) uses none of this machine's room, but its files still hold.
  // Issue #291: a parked Issue (paused, waiting for a decision or for a dependency) uses no room either; its files hold only when the caller says so (`holds`: it has a branch with commits). `total` is the one count the caller shows as «in use» (the sum of all active work, also the requests waiting to be resumed that this weighing does not add): the messages read it, so they say the same as the total.
  const running = active.filter((i) => !i.parked || i.holds).map((i) => ({ number: i.number, effort: i.elsewhere || i.parked ? 0 : effortOf(i.body), files: allowedFilesOf(i.body), elsewhere: i.elsewhere ?? null, parked: i.parked ?? null }));
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
    const clash = running.find((r) => r.files.some((f) => files.includes(f)));
    if (clash) {
      const file = clash.files.find((f) => files.includes(f));
      wait.push({ issue: it.number, why: clash.elsewhere ? `shares ${file} with #${clash.number}, which runs on ${clash.elsewhere}` : clash.parked ? `shares ${file} with #${clash.number}, which is ${clash.parked}: it waits until that one is done` : `shares ${file} with #${clash.number}: it waits until that one is done`, clash: { with: clash.number, file } });
      continue;
    }
    if (effort > capacity) {
      if (running.every((r) => r.elsewhere)) {
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
