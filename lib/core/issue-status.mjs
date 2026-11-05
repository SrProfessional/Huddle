// Huddle: which open Issues can start, from their «Depends on» section (docs/equipo/README.md). Pure: no network.
// Neutral shapes (lib/platform): an Issue has `assignees` and `labels` as plain strings and `reviews` as the numbers of the PRs/MRs that would close it.
// A dependency is satisfied only when `issueState` says it is closed and merged (a merged PR/MR closed it); closing it by hand does not count.

export const LABELS = {
  ready: { name: 'ready', color: '2da44e', description: 'Huddle: its dependencies are merged and nobody has it yet: can be assigned' },
  assigned: { name: 'assigned', color: '0969da', description: 'Huddle: its dependencies are merged and someone has it, but has not started it yet' },
  // Put by the developer's session when it starts (CLAUDE.md, «Before starting a task»); kept while the Issue stays assigned and unblocked.
  progress: { name: 'in progress', color: 'bf8700', description: 'Huddle: its session started the work' },
  review: { name: 'in review', color: '1b7c83', description: 'Huddle: its PR is open and waits for the AI Manager\'s review and merge' },
  blocked: { name: 'blocked', color: 'cf222e', description: 'Huddle: waits for an Issue in its «Depends on» to be merged' },
  // Put by the developer's session, removed by the AI Manager once answered (CLAUDE.md). Never changed by the status labels.
  decision: { name: 'needs decision', color: '8250df', description: 'Huddle: the work stopped for a question to the AI Manager, asked in a comment' },
  // Put by the AI Manager with a «🔁 Changes requested» comment, removed by the developer's session once the changes are pushed. Never changed by the status labels.
  changes: { name: 'changes requested from AI Manager', color: 'd93f0b', description: 'Huddle: the AI Manager asked for changes; the session removes it when they are pushed' },
};
const OURS = new Set([LABELS.ready, LABELS.assigned, LABELS.progress, LABELS.review, LABELS.blocked].map((l) => l.name));

/** True when one of the PRs/MRs that resolve the Issue is open and not a draft (`openPrs`: their numbers). A merged one closes the Issue itself. */
export const reviewing = (it, openPrs) => (it.reviews ?? []).some((n) => openPrs.has(n));

/** Open Issues per assignee for the cap. An Issue in review does not count: its person waits for the review and can take the next one. */
export function loadOf(open, openPrs = new Set()) {
  const load = new Map();
  for (const it of open) {
    if (reviewing(it, openPrs)) continue;
    for (const login of it.assignees ?? []) load.set(login, (load.get(login) ?? 0) + 1);
  }
  return load;
}

export const waitsForDecision = (it) => (it.labels ?? []).includes(LABELS.decision.name);

/** The Issue numbers listed under «## Depends on», or null when the Issue has no such section (it is not managed). */
export function dependsOn(body) {
  const text = String(body ?? '').replace(/\r\n/g, '\n');
  const m = /^## Depends on[ \t]*\n([\s\S]*?)(?=^## |(?![\s\S]))/m.exec(text);
  if (!m) return null;
  const numbers = [...m[1].matchAll(/#(\d+)/g)].map((x) => Number(x[1]));
  return [...new Set(numbers)];
}

export function statusOf({ deps, assigned, started = false, review = false, issues }) {
  const waiting = deps.filter((n) => {
    const it = issues.get(n);
    return !(it && !it.open && it.merged);
  });
  if (waiting.length) return { label: LABELS.blocked.name, waiting };
  if (review) return { label: LABELS.review.name, waiting };
  if (!assigned) return { label: LABELS.ready.name, waiting };
  return { label: started ? LABELS.progress.name : LABELS.assigned.name, waiting };
}

/** The label changes needed: one entry per Issue whose label is wrong. Labels that are not Huddle's are never touched. */
export function plan({ open, issues, openPrs = new Set() }) {
  const out = [];
  for (const it of open) {
    const deps = dependsOn(it.body);
    if (deps === null) continue;
    const started = (it.labels ?? []).includes(LABELS.progress.name);
    const { label, waiting } = statusOf({ deps, assigned: (it.assignees ?? []).length > 0, started, review: reviewing(it, openPrs), issues });
    const have = (it.labels ?? []).filter((n) => OURS.has(n));
    const remove = have.filter((n) => n !== label);
    if (have.includes(label) && remove.length === 0) continue;
    out.push({ number: it.number, add: have.includes(label) ? null : label, remove, waiting });
  }
  return out;
}

/** Who gets each ready Issue (Santiago, 2026-11-03): the person in the team list with the fewest open Issues, oldest Issue first, a tie
 *  going to whoever comes first in the list. Nobody gets more than `max` open Issues: what does not fit stays ready until someone finishes one.
 *  `load`: open Issues per login, counted on all open Issues. An empty team assigns nothing. */
export function assignments({ ready, team, load, max = Infinity }) {
  const count = new Map(team.map((login) => [login, load.get(login) ?? 0]));
  const out = [];
  for (const { number } of [...ready].sort((a, b) => a.number - b.number)) {
    const free = team.filter((login) => count.get(login) < max);
    if (!free.length) break;
    const to = free.reduce((best, login) => (count.get(login) < count.get(best) ? login : best), free[0]);
    count.set(to, count.get(to) + 1);
    out.push({ number, to });
  }
  return out;
}
