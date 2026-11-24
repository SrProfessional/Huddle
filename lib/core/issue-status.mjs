// Huddle: which open Issues can start, from their «Depends on» section (docs/equipo/README.md). Pure: no network.
// Neutral shapes (lib/platform): an Issue has `assignees` and `labels` as plain strings and `reviews` as the numbers of the PRs/MRs that would close it.
// A dependency is satisfied only when `issueState` says it is closed and merged: the last close was done by a merged PR/MR. Closing it by hand does not count, even as «completed» (GitHub gives that reason to a hand close too).

import { schedule } from './schedule.mjs';

export const LABELS = {
  ready: { name: 'ready', color: '2da44e', description: 'Huddle: its dependencies are merged and nobody has it yet: can be assigned' },
  assigned: { name: 'assigned', color: '0969da', description: 'Huddle: its dependencies are merged and someone has it, but has not started it yet' },
  // Put by the Player's session when it starts (CLAUDE.md, «Before starting a task»); kept while the Issue stays assigned and unblocked.
  progress: { name: 'in progress', color: 'bf8700', description: 'Huddle: its session started the work' },
  review: { name: 'in review', color: '1b7c83', description: 'Huddle: its PR is open and waits for the Coach\'s review and merge' },
  blocked: { name: 'blocked', color: 'cf222e', description: 'Huddle: waits for a «Depends on» Issue to be merged, or for a file shared with active work' },
  // Put by the Player's session, removed by the Coach once answered (CLAUDE.md). Never changed by the status labels.
  decision: { name: 'needs decision', color: '8250df', description: 'Huddle: the work stopped for a question to the Coach, asked in a comment' },
  // Put by the Coach with a «🔁 Changes requested» comment, removed by the Player's session once the changes are pushed. Never changed by the status labels.
  changes: { name: 'changes requested from Coach', color: 'd93f0b', description: 'Huddle: the Coach asked for changes; the session removes it when they are pushed' },
};
// The two labels of the Bug flow (Issue #55). Not status labels and not renamable: the status rules never add or remove them, and a closed Issue keeps them.
export const BUG_LABELS = {
  bug: { name: 'bug', color: 'd73a4a', description: 'Huddle: a bug, not a new task' },
  triage: { name: 'needs triage', color: 'fbca04', description: 'Huddle: a raw report; the Coach turns it into a Bug Issue with /huddle-bug' },
};
// The type label of a Design Issue (templates/*/design.md, Issue #58). Not a status label: `huddle labels` only makes sure it exists, and never puts it on
// or takes it off an Issue. A Design Issue has the same «## Depends on» section as a task, so the status labels treat it like one.
export const DESIGN_LABEL = { name: 'design', color: 'c5def5', description: 'Huddle: a design task, worked in a Claude Code session with Claude Design' };
// The «tested in staging» marker (docs/design.md §21, H49), only with `staging_branch` set. A separate constant on purpose, not one of `LABELS`: `closedCleanup` must not strip it
// from the closed Issues it lives on, and it is not renamable. The evidence is a comment (lib/core/staging.mjs); the label is only its visible projection.
export const TESTED_LABEL = { name: 'tested in staging', color: '0e8a16', description: 'Huddle: tested in staging (the Coach\'s comment is the evidence; this label only shows it)' };
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

/** A raw report waits for the Coach's triage: it never gets `ready` or an assignee, and the status rules leave it alone. */
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

/** The body with every fenced code block blanked to spaces (same length, same lines), so a heading inside a fence is not read as a section (Issue #318: one rule for every reader).
 *  A fence closes on a line of at least as many of the same marker as its opening (four backticks need four: Issue #326). An unclosed fence hides only up to the
 *  next line that starts with «## » (Issue #326), so the sections after it are still read. A closed fence is tried first, so a heading inside it stays hidden. */
export const unfenced = (body) => String(body ?? '').replace(/^[ \t]*([\x60~])(\1{2,})[^\n]*\n(?:[\s\S]*?^[ \t]*\1\2\1*[^\n]*(?:\n|$)|[\s\S]*?(?=^## )|[\s\S]*)/gm, (m) => m.replace(/[^\r\n]/g, ' '));

/** The Issue numbers listed under «## Depends on», or null when the Issue has no such section (it is not managed). */
export function dependsOn(body) {
  const text = unfenced(body).replace(/\r\n/g, '\n');
  const m = /^## Depends on[ \t]*\n([\s\S]*?)(?=^## |(?![\s\S]))/m.exec(text);
  if (!m) return null;
  // A line means the Issues it starts with: an optional bullet, then `#N` tokens separated only by spaces, commas or «and». The rest is a note, and a `#N` in it
  // (a PR, an example) is not a dependency.
  const run = /^[ \t]*(?:[-*][ \t]*)?(#\d+(?:(?:[ \t]*,[ \t]*(?:and[ \t]+)?|[ \t]+and[ \t]+|[ \t]+)#\d+)*)/;
  const numbers = m[1].split('\n').flatMap((line) => [...(run.exec(line)?.[1] ?? '').matchAll(/#(\d+)/g)].map((x) => Number(x[1])));
  return [...new Set(numbers)];
}

/** `request`: where the Coach's requests stand (review-requests.mjs requestState). With one pending, the Issue has no status label until its session takes it
 *  (the changes label says it, with or without a PR); once taken, «in progress»; once the work is done, «in review» again. `decision`: it waits for the Coach's
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

const isDesign = (it) => (it.labels ?? []).includes(DESIGN_LABEL.name) || /^## Screens\b/m.test(String(it.body ?? '').replace(/\r\n/g, '\n'));

/**
 * Whether an Issue's work holds points and files now, from its status (`statusOf`) and where the Coach's requests stand: in progress (its dependencies met), or a request
 * that came back (pending) with no open dependency. A taken request is «in progress»; an Issue only awaiting review, stopped for a decision or waiting for a dependency holds
 * nothing. The one rule of the board (`fileWaits`) and of `huddle next` (Issues #240 and #250), so they cannot disagree.
 */
export const holdsFiles = ({ label, request = null, waiting = [], decision = false }) => !decision && (label === LABELS.progress.name || (request === 'pending' && !waiting.length));

/**
 * Issue #250: the assigned Issues whose start the scheduler holds for a shared allowed file with ACTIVE work, per person, by the same `schedule` that `huddle next` uses:
 * Map(number -> { with, file }). A wait for capacity alone is not in it (it is the Player's own load), and neither is a clash with another candidate that has not started.
 * `all`: every open Issue (the holders and the other candidates may lie outside the scope of a scoped run); `requests`: where the Coach's requests stand (requestState) on the
 * Issues that have one; `issues`: the state of their dependencies; `capacityFor(login)`: the points the Coach allows.
 * Issue #294: `parked` (number -> { kind: 'paused' | 'parked', holds }) is the pause and parking rule of `huddle next` (Issue #291): a parked Issue is never a candidate,
 * and its files hold another Issue only when `holds` says it has commits or a pushed branch. The caller decides `holds`, as `huddle next` does; this stays pure.
 */
export function fileWaits({ logins, all, issues, openPrs = new Set(), requests = new Map(), capacityFor = () => 5, parked = new Map() }) {
  const out = new Map();
  const statusFor = (i) => {
    const request = requests.get(i.number) ?? null;
    const decision = waitsForDecision(i) && request === null;
    const s = statusOf({ deps: dependsOn(i.body), assigned: true, started: (i.labels ?? []).includes(LABELS.progress.name), review: reviewing(i, openPrs), request, decision, issues });
    return { ...s, request, decision };
  };
  for (const login of logins) {
    const mine = all.filter((i) => (i.assignees ?? []).includes(login) && dependsOn(i.body) !== null && !needsTriage(i)).map((i) => ({ i, s: statusFor(i) }));
    const active = mine.filter(({ i, s }) => (parked.has(i.number) ? parked.get(i.number).holds : holdsFiles(s))).map(({ i }) => (parked.has(i.number) ? { ...i, parked: parked.get(i.number).kind, holds: true } : i));
    const candidates = mine.filter(({ i, s }) => s.label === LABELS.assigned.name && !isDesign(i) && !parked.has(i.number)).map(({ i }) => ({ ...i, blocking: isBlockingBug(i) }));
    // Issue #313: the active work of every OTHER login holds its files too, but never uses this login's points (`forLogin`); candidates and capacity stay per login.
    const foreign = all.filter((i) => (i.assignees ?? []).length > 0 && !(i.assignees ?? []).includes(login) && dependsOn(i.body) !== null && !needsTriage(i))
      .map((i) => ({ i, s: statusFor(i) }))
      .filter(({ i, s }) => (parked.has(i.number) ? parked.get(i.number).holds : holdsFiles(s)))
      .map(({ i }) => ({ ...i, forLogin: i.assignees[0], ...(parked.has(i.number) && { parked: parked.get(i.number).kind, holds: true }) }));
    for (const w of schedule({ active: [...active, ...foreign], candidates, capacity: capacityFor(login) }).wait) {
      if (!w.clash) continue;
      const other = foreign.find((a) => a.number === w.clash.with);
      if (other) out.set(w.issue, { ...w.clash, forLogin: other.forLogin });
      else if (active.some((a) => a.number === w.clash.with)) out.set(w.issue, w.clash);
    }
  }
  return out;
}

/** The label changes needed: one entry per Issue whose label is wrong. Labels that are not Huddle's are never touched. `all` and `capacityFor` let an assigned Issue
 *  that waits for a shared file show `blocked` (Issue #250); without them only the dependencies block. */
export function plan({ open, issues, openPrs = new Set(), requests = new Map(), all = open, capacityFor = () => 5, parked = new Map() }) {
  const rows = [];
  for (const it of open) {
    const deps = dependsOn(it.body);
    if (deps === null || needsTriage(it)) continue;
    const started = (it.labels ?? []).includes(LABELS.progress.name);
    // «needs decision» stops the work until the Coach answers; an answer (a request state) takes the label off and the usual status comes back.
    const decision = waitsForDecision(it) && (requests.get(it.number) ?? null) === null;
    rows.push({ it, started, ...statusOf({ deps, assigned: (it.assignees ?? []).length > 0, started, review: reviewing(it, openPrs), request: requests.get(it.number) ?? null, decision, issues }) });
  }
  const logins = new Set(rows.filter((r) => r.label === LABELS.assigned.name).flatMap((r) => r.it.assignees ?? []));
  const files = logins.size ? fileWaits({ logins, all, issues, openPrs, requests, capacityFor, parked }) : new Map();
  const out = [];
  for (const { it, started, label: base, waiting: depsWaiting } of rows) {
    const clash = base === LABELS.assigned.name ? files.get(it.number) : undefined;
    const label = clash ? LABELS.blocked.name : base;
    const waiting = clash ? [clash.with] : depsWaiting;
    // Issue #294: a dependency must be merged, so a paused one still blocks; the reason says it is paused.
    const pausedDeps = clash ? [] : depsWaiting.filter((n) => parked.get(n)?.kind === 'paused');
    const have = (it.labels ?? []).filter((n) => OURS.has(n));
    // A started Issue that waits again (a decision added a dependency) keeps «in progress» next to «blocked»: it is the only sign that its session started,
    // so once the dependency is merged it goes back to «in progress» and not to «assigned». Ported from SocialCortex (PR #138).
    const keep = label === LABELS.blocked.name && started && (it.assignees ?? []).length > 0 ? LABELS.progress.name : null;
    const remove = have.filter((n) => n !== label && n !== keep);
    const add = label === null || have.includes(label) ? null : label;
    if (add === null && remove.length === 0) continue;
    out.push({ number: it.number, add, remove, waiting, ...(clash ? { why: `shares ${clash.file} with #${clash.with}${clash.forLogin ? `, which runs for ${clash.forLogin}` : ''}${parked.has(clash.with) ? `, which is ${parked.get(clash.with).kind}` : ''}` } : pausedDeps.length ? { why: `waits for ${depsWaiting.map((n) => `#${n}${pausedDeps.includes(n) ? ', which is paused' : ''}`).join(', ')}` } : {}) });
  }
  return out;
}

/** The two request labels of one open Issue, from where its requests stand (review-requests.mjs requestState): «changes requested from Coach» is
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

/** The open Issues that carry the «tested in staging» label: an open Issue is not tested (it was reopened), so the labels job takes the label off. Their numbers. */
export const testedCleanup = (open) => open.filter((it) => (it.labels ?? []).includes(TESTED_LABEL.name)).map((it) => it.number);

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
