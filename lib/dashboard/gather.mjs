// Huddle: what the dashboard reads from the platform for its pace and its cost per Issue (docs/design.md §26, Issue #232).
// Only the adapter's own reads: merged PRs/MRs, their commits and comments, the text of an Issue. Read-only.
import { closesIn } from '../core/closes.mjs';
import { effortOf } from '../core/effort.mjs';
import { isManager, promptOf } from '../core/review-requests.mjs';

export const MERGED_LIMIT = 60; // the merged PRs/MRs whose pace is read: calls grow with them, and 60 is a few weeks of a busy team
export const EFFORT_LIMIT = 80; // the Issues whose effort is read for the cost per point

/** `fn` over `list`, at most `n` at a time, in order. */
async function mapLimit(list, n, fn) {
  const out = new Array(list.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(n, list.length) }, async () => {
    while (next < list.length) { const i = next++; out[i] = await fn(list[i]); }
  }));
  return out;
}

const time = (iso) => Date.parse(iso ?? '') || 0;

/**
 * The review rounds in the comments of a PR/MR and its Issues (one list of comments per target). The standard workflow posts the same request on the
 * PR/MR and on the Issue, so a request is counted once per distinct prompt text, as many times as the busiest target has it: a mirrored pair is one round,
 * and a later request with the same text on the same target is another.
 */
export function roundsOf(targets, manager, mergedAt) {
  const perText = new Map();
  for (const comments of targets) {
    const here = new Map();
    for (const c of comments) {
      const prompt = isManager(c, manager) ? promptOf(c.body) : null;
      if (prompt === null || time(c.createdAt) > time(mergedAt)) continue;
      const key = prompt.replace(/s+/g, ' ').trim();
      here.set(key, (here.get(key) ?? 0) + 1);
    }
    for (const [key, n] of here) perText.set(key, Math.max(perText.get(key) ?? 0, n));
  }
  return [...perText.values()].reduce((a, b) => a + b, 0);
}

/**
 * The merged PRs/MRs into `base` that close Issues: { pr, issues, mergedAt, startedAt, rounds }. The work started at the PR/MR's first commit; a review
 * round is a request for changes (a comment of the Coach with a «Prompt for Claude Code» block) on the PR/MR or its Issues before the merge.
 * A read that fails leaves that one number out (null, 0), never the page.
 */
export async function readMerged({ adapter, config, base, limit = MERGED_LIMIT }) {
  const prs = (await adapter.mergedReviews(base, { limit })).filter((pr) => pr.mergedAt);
  const read = await mapLimit(prs, 6, async (pr) => {
    const issues = closesIn(pr.body, config.project);
    if (!issues.length) return null;
    let startedAt = null;
    let rounds = 0;
    try {
      const dates = (await adapter.reviewCommits(pr.number)).map(time).filter(Boolean);
      if (dates.length) startedAt = new Date(Math.min(...dates)).toISOString();
    } catch { /* no start: this PR is left out of the median time */ }
    try {
      const targets = [await adapter.comments(pr.number, { review: true }), ...(await Promise.all(issues.map((n) => adapter.comments(n))))];
      rounds = roundsOf(targets, config.ai_manager, pr.mergedAt);
    } catch { /* no rounds known: counted as none */ }
    return { pr: pr.number, issues, mergedAt: pr.mergedAt, startedAt, rounds };
  });
  return read.filter(Boolean);
}

/** The effort of each Issue in `numbers` (a plain object, Issue number -> points): from the open Issues already read, else from the Issue's text. */
export async function readEfforts({ adapter, numbers, open = [], limit = EFFORT_LIMIT }) {
  const efforts = {};
  const bodies = new Map(open.map((i) => [i.number, i.body]));
  const wanted = [...new Set(numbers)].filter((n) => Number.isInteger(n)).slice(0, limit);
  await mapLimit(wanted, 6, async (n) => {
    try { efforts[n] = effortOf(bodies.has(n) ? bodies.get(n) : await adapter.issueBody(n)); } catch { /* unknown: no cost per point */ }
  });
  return efforts;
}
