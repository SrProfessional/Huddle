// Huddle: which of the Coach's requests on an Issue (or its PR) are still to do. Pure: no network (the CLI is review-watch.mjs).
// A request is a comment by the Coach that ends with a «Prompt for Claude Code» text block (docs/equipo/README.md). It is pending
// until someone takes it (👀 reaction, put by `review-watch.mjs take`) or the work moves past it (a newer commit or «Ready for review again»).

import { dependsOn } from './issue-status.mjs';
import { allowedFilesOf } from './effort.mjs';

const HEADING = /^#{2,3}[^\n]*Prompt (?:for Claude Code|to continue)[^\n]*\n/im;
const BLOCK = /^```text[ \t]*\n([\s\S]*?)\n```/m;

/** The prompt of a request: the first ```text block after its «Prompt for Claude Code» heading, or null. */
export function promptOf(body) {
  const text = String(body ?? '').replace(/\r\n/g, '\n');
  const h = HEADING.exec(text);
  if (!h) return null;
  const b = BLOCK.exec(text.slice(h.index + h[0].length));
  return b ? b[1] : null;
}

/** Whether a comment was written by the Coach (logins ignore case). */
export const isManager = (c, manager) => String(c?.author ?? '').toLowerCase() === String(manager ?? '').toLowerCase() && !!manager;

const time = (s) => Date.parse(s) || 0;

/** Whether a comment is the session saying it finished: it starts with «Ready for review again» (after any emoji or heading marks) and is not a request. */
const saysReady = (c) => /^[^\p{L}\n]*Ready for review again/iu.test(String(c.body ?? '').trimStart()) && promptOf(c.body) === null;

/** When the work last moved: the newest commit on the PR or comment saying «Ready for review again» (ms, 0 when none). */
export function lastWorkAt({ commits = [], comments = [] }) {
  const ready = comments.filter(saysReady).map((c) => time(c.createdAt));
  return Math.max(0, ...commits.map(time), ...ready);
}

/** Whether a comment is a session's question to the Coach (CLAUDE.md, «When the Coach must decide»). */
const asksDecision = (c) => /^[^\p{L}\n]*Decision for the Coach/iu.test(String(c.body ?? '').trimStart());

/**
 * Where the Coach's requests on an Issue (and its PRs/MRs) stand, for the labels (`huddle labels`), so nobody has to remember to set them:
 *   'pending'  a request (a prompt by the Coach) newer than the last work (commit or «Ready for review again») and than the last question to the
 *              Coach, that no session took yet (no 👀): «changes requested from Coach», and not «in review».
 *   'taken'    every such request was taken (👀, put by `huddle take`): its session is on it, «in progress».
 *   null       nothing asked since the last work or question.
 * Ported from SocialCortex (PRs #139 and #140).
 */
export function requestState({ manager, comments = [], commits = [] }) {
  const after = Math.max(lastWorkAt({ commits, comments }), ...comments.filter(asksDecision).map((c) => time(c.createdAt)));
  const open = comments.filter((c) => isManager(c, manager) && promptOf(c.body) !== null && time(c.createdAt) > after);
  if (!open.length) return null;
  return open.some((c) => !c.taken) ? 'pending' : 'taken';
}

/**
 * The comments that could be a request, so an adapter that pays one call per comment for the 👀 mark asks only for these: by the Coach, with a
 * prompt, newer than the last work (commit or «Ready for review again») in the comments and commits it was given. A superset of what requestState and
 * pendingRequests look at, which also weigh the other PRs/MRs and the last question. Needs no `taken`.
 */
export function requestCandidates({ manager, comments = [], commits = [] }) {
  const after = lastWorkAt({ commits, comments });
  return comments.filter((c) => isManager(c, manager) && promptOf(c.body) !== null && time(c.createdAt) > after);
}

/** The Coach's requests still to do, oldest first: with a prompt, without 👀, newer than the last work. */
export function pendingRequests({ manager, comments = [], lastWork = 0 }) {
  return comments
    .filter((c) => isManager(c, manager) && promptOf(c.body) !== null && !c.taken && time(c.createdAt) > lastWork)
    .sort((a, b) => time(a.createdAt) - time(b.createdAt));
}

// --- decisions that wait (Issue #335, docs/design.md §19) ----------------------------------------------------------------------------
// A decision the Coach was asked and has not answered is asked again, and it holds only what depends on the answer.

/** Files that every Issue touches by habit (the change log): sharing one says nothing about the work depending on an answer. */
const SHARED_BY_HABIT = new Set(['CHANGELOG.md']);

/**
 * What each waiting decision holds: Map(decision Issue -> ascending numbers of the other open Issues that depend on it, through «Depends on» (and so on
 * down the chain) or share an allowed file with it. `open` are the open Issues ({ number, body }), `decisions` the numbers of the Issues that wait.
 */
export function heldByDecisions(open, decisions) {
  const out = new Map();
  for (const d of decisions) {
    const own = open.find((i) => i.number === d);
    const files = new Set(allowedFilesOf(own?.body).filter((f) => !SHARED_BY_HABIT.has(f)));
    const held = new Set();
    for (let grew = true; grew;) {
      grew = false;
      for (const i of open) {
        if (i.number === d || held.has(i.number)) continue;
        const deps = dependsOn(i.body) ?? [];
        if (deps.includes(d) || deps.some((n) => held.has(n)) || allowedFilesOf(i.body).some((f) => files.has(f))) { held.add(i.number); grew = true; }
      }
    }
    out.set(d, [...held].sort((a, b) => a - b));
  }
  return out;
}

/** The record of asked decisions after one more ask of `issue` at `atMs`: { [issue]: { count, at } }. Pure; records of Issues not in `waiting` are dropped. */
export function recordAsk(all, issue, atMs, waiting) {
  const keep = new Set(waiting.map(String));
  const next = Object.fromEntries(Object.entries(all ?? {}).filter(([n]) => keep.has(n)));
  const before = Number(next[issue]?.count) || 0;
  next[issue] = { count: before + 1, at: new Date(atMs).toISOString() };
  return next;
}

/** «2026-11-24 10:00Z» from an ISO time. */
export const askedTime = (iso) => `${new Date(iso).toISOString().slice(0, 16).replace('T', ' ')}Z`;

/** «asked 2 times, last at 2026-11-24 10:00Z». */
export const askedText = ({ count, at }) => `asked ${count} ${count === 1 ? 'time' : 'times'}, last at ${askedTime(at)}`;
