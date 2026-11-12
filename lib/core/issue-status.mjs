// Huddle: which open Issues can start, from their «Depends on» section (docs/equipo/README.md). Pure: no network.
// Neutral shapes (lib/platform): an Issue has `assignees` and `labels` as plain strings and `reviews` as the numbers of the PRs/MRs that would close it.
// A dependency is satisfied only when `issueState` says it is closed and merged: the last close was done by a merged PR/MR. Closing it by hand does not count, even as «completed» (GitHub gives that reason to a hand close too).

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
// The two labels of the Bug flow (Issue #55). Not status labels and not renamable: the status rules never add or remove them, and a closed Issue keeps them.
export const BUG_LABELS = {
  bug: { name: 'bug', color: 'd73a4a', description: 'Huddle: a bug, not a new task' },
  triage: { name: 'needs triage', color: 'fbca04', description: 'Huddle: a raw report; the AI Manager turns it into a Bug Issue with /huddle-bug' },
};
// The type label of a Design Issue (templates/*/design.md, Issue #58). Not a status label: `huddle labels` only makes sure it exists, and never puts it on
// or takes it off an Issue. A Design Issue has the same «## Depends on» section as a task, so the status labels treat it like one.
export const DESIGN_LABEL = { name: 'design', color: 'c5def5', description: 'Huddle: a design task, worked in a Claude Code session with Claude Design' };
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

/** A raw report waits for the AI Manager's triage: it never gets `ready` or an assignee, and the status rules leave it alone. */
export const needsTriage = (it) => (it.labels ?? []).includes(BUG_LABELS.triage.name);

/** The severity written under «## Severity» of a Bug Issue: `blocking`, `normal` or `minor` (the first of them found outside HTML comments); `normal` when missing. */
export function severityOf(body) {
  const text = String(body ?? '').replace(/\r\n/g, '\n');
  const m = /^#{2,3} Severity[ \t]*\n([\s\S]*?)(?=^#{1,6} |(?![\s\S]))/m.exec(text);
  const found = m && /\b(blocking|normal|minor)\b/i.exec(m[1].replace(/<!--[\s\S]*?-->/g, ''));
  return found ? found[1].toLowerCase() : 'normal';
}

/** A blocking Bug: the label `bug` and severity `blocking`. The labels job assigns it before every other ready Issue. */
export const isBlockingBug = (it) => (it.labels ?? []).includes(BUG_LABELS.bug.name) && severityOf(it.body) === 'blocking';

/** The Issue numbers listed under «## Depends on», or null when the Issue has no such section (it is not managed). */
export function dependsOn(body) {
  const text = String(body ?? '').replace(/\r\n/g, '\n');
  const m = /^## Depends on[ \t]*\n([\s\S]*?)(?=^## |(?![\s\S]))/m.exec(text);
  if (!m) return null;
  // A line means the Issues it starts with: an optional bullet, then `#N` tokens separated only by spaces, commas or «and». The rest is a note, and a `#N` in it
  // (a PR, an example) is not a dependency.
  const run = /^[ \t]*(?:[-*][ \t]*)?(#\d+(?:(?:[ \t]*,[ \t]*(?:and[ \t]+)?|[ \t]+and[ \t]+|[ \t]+)#\d+)*)/;
  const numbers = m[1].split('\n').flatMap((line) => [...(run.exec(line)?.[1] ?? '').matchAll(/#(\d+)/g)].map((x) => Number(x[1])));
  return [...new Set(numbers)];
}

/** `request`: where the AI Manager's requests stand (review-requests.mjs requestState). With one pending, the Issue has no status label until its session takes it
 *  (the changes label says it, with or without a PR); once taken, «in progress»; once the work is done, «in review» again. `decision`: it waits for the AI Manager's
 *  answer (Issue #85): no status label either, since «in progress» and «in review» never sit next to a stop label. Ported from SocialCortex (PR #140). */
export function statusOf({ deps, assigned, started = false, review = false, request = null, decision = false, issues }) {
  const waiting = deps.filter((n) => {
    const it = issues.get(n);
    return !(it && !it.open && it.merged);
  });
  if (waiting.length) return { label: LABELS.blocked.name, waiting };
  if (decision) return { label: null, waiting }; // stopped for a question: the stop label says it, and neither «in progress» nor «in review» sits next to it
  if (review) return { label: request === 'pending' ? null : request === 'taken' ? LABELS.progress.name : LABELS.review.name, waiting };
  if (!assigned) return { label: LABELS.ready.name, waiting };
  if (request === 'pending') return { label: null, waiting }; // a request waits for its session: the changes label says it, not «in progress» or «assigned»
  return { label: started || request === 'taken' ? LABELS.progress.name : LABELS.assigned.name, waiting };
}

/** The label changes needed: one entry per Issue whose label is wrong. Labels that are not Huddle's are never touched. */
export function plan({ open, issues, openPrs = new Set(), requests = new Map() }) {
  const out = [];
  for (const it of open) {
    const deps = dependsOn(it.body);
    if (deps === null || needsTriage(it)) continue;
    const started = (it.labels ?? []).includes(LABELS.progress.name);
    // «needs decision» stops the work until the AI Manager answers; an answer (a request state) takes the label off and the usual status comes back.
    const decision = waitsForDecision(it) && (requests.get(it.number) ?? null) === null;
    const { label, waiting } = statusOf({ deps, assigned: (it.assignees ?? []).length > 0, started, review: reviewing(it, openPrs), request: requests.get(it.number) ?? null, decision, issues });
    const have = (it.labels ?? []).filter((n) => OURS.has(n));
    // A started Issue that waits again (a decision added a dependency) keeps «in progress» next to «blocked»: it is the only sign that its session started,
    // so once the dependency is merged it goes back to «in progress» and not to «assigned». Ported from SocialCortex (PR #138).
    const keep = label === LABELS.blocked.name && started && (it.assignees ?? []).length > 0 ? LABELS.progress.name : null;
    const remove = have.filter((n) => n !== label && n !== keep);
    const add = label === null || have.includes(label) ? null : label;
    if (add === null && remove.length === 0) continue;
    out.push({ number: it.number, add, remove, waiting });
  }
  return out;
}

/** The two request labels of one open Issue, from where its requests stand (review-requests.mjs requestState): «changes requested from AI Manager» is
 *  on exactly while one is pending (not taken yet), and an answer to a question, taken or not, takes «needs decision» off. Null when nothing changes.
 *  Automatic: nobody puts or removes them by hand. `it.labels`: plain names. Ported from SocialCortex (PRs #139 and #140). */
export function requestLabels(it, state) {
  const have = new Set(it.labels ?? []);
  const pending = state === 'pending';
  const add = pending && !have.has(LABELS.changes.name) ? [LABELS.changes.name] : [];
  const remove = [];
  if (!pending && have.has(LABELS.changes.name)) remove.push(LABELS.changes.name);
  if (state !== null && have.has(LABELS.decision.name)) remove.push(LABELS.decision.name);
  return add.length || remove.length ? { add, remove } : null;
}

/** A closed Issue (merged, or closed by hand) carries no Huddle label: no status, and neither of the two set by hand («needs decision», «changes requested»).
 *  Without this the labels it had on the day it closed stay forever and the board lies. Other labels (bug, topics) are kept.
 *  `closed`: [{ number, labels: [name] }] (neutral shape). Ported from SocialCortex (PR #132). */
export function closedCleanup(closed) {
  const huddle = new Set(Object.values(LABELS).map((l) => l.name));
  const out = [];
  for (const it of closed) {
    const remove = (it.labels ?? []).filter((n) => huddle.has(n));
    if (remove.length) out.push({ number: it.number, remove });
  }
  return out;
}

/** Who gets each ready Issue (Santiago, 2026-11-03): the person in the team list with the fewest open Issues, oldest Issue first (blocking Bugs before all), a tie
 *  going to whoever comes first in the list. Nobody gets more than `max` open Issues: what does not fit stays ready until someone finishes one.
 *  `load`: open Issues per login, counted on all open Issues. An empty team assigns nothing. */
export function assignments({ ready, team, load, max = Infinity }) {
  const count = new Map(team.map((login) => [login, load.get(login) ?? 0]));
  const out = [];
  // A blocking Bug (`blocking: true`) goes before every other ready Issue, then the oldest first.
  for (const { number } of [...ready].sort((a, b) => Number(!!b.blocking) - Number(!!a.blocking) || a.number - b.number)) {
    const free = team.filter((login) => count.get(login) < max);
    if (!free.length) break;
    const to = free.reduce((best, login) => (count.get(login) < count.get(best) ? login : best), free[0]);
    count.set(to, count.get(to) + 1);
    out.push({ number, to });
  }
  return out;
}
