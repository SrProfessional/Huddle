// Huddle: which of a Player's assigned Issues start now and which wait, by effort and capacity (Issue #164, docs/design.md §24). Pure: the
// caller gives the active Issues (in progress, or with changes requested) and the candidates (assigned, ready, no stop label, not a Design Issue).
import { effortOf, allowedFilesOf } from './effort.mjs';

/**
 * { start: [Issue], wait: [{ issue, why }], used, capacity }. Order: blocking bugs first, then the oldest. An Issue goes in while the active
 * effort stays within the capacity; two Issues that share an allowed file never run at once; an Issue bigger than the whole capacity runs
 * alone when nothing else is active.
 */
export function schedule({ active = [], candidates = [], capacity = 5 }) {
  const running = active.map((i) => ({ number: i.number, effort: effortOf(i.body), files: allowedFilesOf(i.body) }));
  let used = running.reduce((n, r) => n + r.effort, 0);
  const start = [];
  const wait = [];
  const ordered = [...candidates].sort((a, b) => (Number(Boolean(b.blocking)) - Number(Boolean(a.blocking))) || a.number - b.number);
  for (const it of ordered) {
    const effort = effortOf(it.body);
    const files = allowedFilesOf(it.body);
    const clash = running.find((r) => r.files.some((f) => files.includes(f)));
    if (clash) {
      wait.push({ issue: it.number, why: `shares ${clash.files.find((f) => files.includes(f))} with #${clash.number}: it waits until that one is done` });
      continue;
    }
    if (used > capacity) {
      wait.push({ issue: it.number, why: `${used} of ${capacity} points in use: finish one first` });
      continue;
    }
    if (effort > capacity) {
      if (running.length === 0) {
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
    } else wait.push({ issue: it.number, why: `no room: ${used} of ${capacity} points in use, it needs ${effort}` });
  }
  return { start, wait, used, capacity };
}
