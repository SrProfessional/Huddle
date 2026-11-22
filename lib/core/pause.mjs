// Huddle: the Coach pauses an Issue (Issue #291, docs/design.md §24). No label: a pause is a comment on the Issue, a visible line and a hidden marker,
// and a resume comment with its own marker ends it. The newest of the two wins, as the newest claim does for machines (machine.mjs).
const PAUSED = /<!--\s*huddle-paused\s*-->/;
const RESUMED = /<!--\s*huddle-resumed\s*-->/;
const LINE = /Paused by the Coach:[ \t]*([^\r\n<]*)/;

/** The comment that pauses an Issue. */
export const pauseBody = (reason) => `⏸️ Paused by the Coach: ${String(reason ?? '').trim() || 'no reason given'}\n\n<!-- huddle-paused -->\n`;

/** The comment that ends the pause. */
export const resumeBody = () => '▶️ Resumed by the Coach\n\n<!-- huddle-resumed -->\n';

/**
 * Where the pause of an Issue stands, from its comments: { paused: true, reason }, { paused: false, reason: null } (resumed), or null (never
 * paused). The newest marker wins; a tie goes to the later in the list. With `manager`, only that login's comments count.
 */
export function newestPause(comments, { manager = null } = {}) {
  let best = null;
  let at = '';
  for (const c of comments ?? []) {
    if (manager && String(c.author ?? '').toLowerCase() !== String(manager).toLowerCase()) continue;
    const text = String(c.body ?? '');
    const paused = PAUSED.test(text);
    if (!paused && !RESUMED.test(text)) continue;
    const when = String(c.createdAt ?? '');
    if (best === null || when >= at) { best = paused ? { paused: true, reason: LINE.exec(text)?.[1].trim() || 'no reason given' } : { paused: false, reason: null }; at = when; }
  }
  return best;
}
