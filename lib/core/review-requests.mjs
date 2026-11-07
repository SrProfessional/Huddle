// Huddle: which of the AI Manager's requests on an Issue (or its PR) are still to do. Pure: no network (the CLI is review-watch.mjs).
// A request is a comment by the AI Manager that ends with a «Prompt for Claude Code» text block (docs/equipo/README.md). It is pending
// until someone takes it (👀 reaction, put by `review-watch.mjs take`) or the work moves past it (a newer commit or «Ready for review again»).

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

/** Whether a comment was written by the AI Manager (logins ignore case). */
export const isManager = (c, manager) => String(c?.author ?? '').toLowerCase() === String(manager ?? '').toLowerCase() && !!manager;

const time = (s) => Date.parse(s) || 0;

/** Whether a comment is the session saying it finished: it starts with «Ready for review again» (after any emoji or heading marks) and is not a request. */
const saysReady = (c) => /^[^\p{L}\n]*Ready for review again/iu.test(String(c.body ?? '').trimStart()) && promptOf(c.body) === null;

/** When the work last moved: the newest commit on the PR or comment saying «Ready for review again» (ms, 0 when none). */
export function lastWorkAt({ commits = [], comments = [] }) {
  const ready = comments.filter(saysReady).map((c) => time(c.createdAt));
  return Math.max(0, ...commits.map(time), ...ready);
}

/** Whether a comment is a session's question to the AI Manager (CLAUDE.md, «When the AI Manager must decide»). */
const asksDecision = (c) => /^[^\p{L}\n]*Decision for the AI Manager/iu.test(String(c.body ?? '').trimStart());

/**
 * Where the AI Manager's requests on an Issue (and its PRs/MRs) stand, for the labels (`huddle labels`), so nobody has to remember to set them:
 *   'pending'  a request (a prompt by the AI Manager) newer than the last work (commit or «Ready for review again») and than the last question to the
 *              AI Manager, that no session took yet (no 👀): «changes requested from AI Manager», and not «in review».
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
 * The comments that could be a request, so an adapter that pays one call per comment for the 👀 mark asks only for these: by the AI Manager, with a
 * prompt, newer than the last work (commit or «Ready for review again») in the comments and commits it was given. A superset of what requestState and
 * pendingRequests look at, which also weigh the other PRs/MRs and the last question. Needs no `taken`.
 */
export function requestCandidates({ manager, comments = [], commits = [] }) {
  const after = lastWorkAt({ commits, comments });
  return comments.filter((c) => isManager(c, manager) && promptOf(c.body) !== null && time(c.createdAt) > after);
}

/** The AI Manager's requests still to do, oldest first: with a prompt, without 👀, newer than the last work. */
export function pendingRequests({ manager, comments = [], lastWork = 0 }) {
  return comments
    .filter((c) => isManager(c, manager) && promptOf(c.body) !== null && !c.taken && time(c.createdAt) > lastWork)
    .sort((a, b) => time(a.createdAt) - time(b.createdAt));
}
