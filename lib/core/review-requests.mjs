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

/** Whether a comment was written by the AI Manager (GitHub logins ignore case). */
export const isManager = (c, manager) => String(c?.user?.login ?? '').toLowerCase() === String(manager ?? '').toLowerCase() && !!manager;

const time = (s) => Date.parse(s) || 0;

/** Whether a comment is the session saying it finished: it starts with «Ready for review again» (after any emoji or heading marks) and is not a request. */
const saysReady = (c) => /^[^\p{L}\n]*Ready for review again/iu.test(String(c.body ?? '').trimStart()) && promptOf(c.body) === null;

/** When the work last moved: the newest commit on the PR or comment saying «Ready for review again» (ms, 0 when none). */
export function lastWorkAt({ commits = [], comments = [] }) {
  const ready = comments.filter(saysReady).map((c) => time(c.created_at));
  return Math.max(0, ...commits.map(time), ...ready);
}

/** The AI Manager's requests still to do, oldest first: with a prompt, without 👀, newer than the last work. */
export function pendingRequests({ manager, comments = [], lastWork = 0 }) {
  return comments
    .filter((c) => isManager(c, manager) && promptOf(c.body) !== null && !(c.reactions?.eyes > 0) && time(c.created_at) > lastWork)
    .sort((a, b) => time(a.created_at) - time(b.created_at));
}
