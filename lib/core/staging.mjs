// Huddle: the «tested in staging» marker and the staged list (docs/design.md §21, H49). Pure: no network and no git; the CLI reads them and passes the answers in.
import { closesIn } from './closes.mjs';

/** The comment that is the evidence. The label `tested in staging` is only its visible projection; the gate never reads the label. */
export const TESTED_COMMENT = '✅ Tested in staging';

const same = (a, b) => String(a).toLowerCase() === String(b).toLowerCase();
const time = (iso) => { const t = Date.parse(iso ?? ''); return Number.isNaN(t) ? -Infinity : t; };

/** A comment counts only when its author is the AI Manager or one of `testers`, and it says the marker (surrounding spaces ignored). */
export function isTestedComment(c, { aiManager, testers = [] }) {
  return String(c.body ?? '').trim() === TESTED_COMMENT && [aiManager, ...testers].some((login) => same(login, c.author));
}

/**
 * An Issue is tested iff a valid comment is **newer than `landedAt`**, the `mergedAt` of the latest merged staging PR that closes it. A fix after the test
 * (reopen, new PR, land) moves `landedAt` past the comment, so it invalidates the test by itself. `comments`: the neutral shape, any order.
 * Returns the newest valid comment: { tested, by, at }.
 */
export function testedState({ comments, landedAt, aiManager, testers = [] }) {
  const valid = (comments ?? []).filter((c) => isTestedComment(c, { aiManager, testers }) && time(c.createdAt) > time(landedAt));
  if (!valid.length) return { tested: false, by: null, at: null };
  const newest = valid.reduce((a, b) => (time(b.createdAt) >= time(a.createdAt) ? b : a));
  return { tested: true, by: newest.author, at: newest.createdAt };
}

/**
 * What is in staging and not yet released, computed and never stored: the merged PRs into staging whose merge commit is **not** an ancestor of the default
 * branch. `isReleased(sha)` is that git question. A PR with no merge commit cannot be proven released, so it stays. This needs the release PR to be a merge commit.
 */
export const unreleasedPrs = (merged, isReleased) => merged.filter((p) => !p.mergeSha || !isReleased(p.mergeSha));

/** The Issues those PRs close, ascending: { issue, pr, mergedAt, mergeSha }, where `pr` is the newest merge that closes it (`prs` come newest first). */
export function stagedIssues(prs, project) {
  const found = new Map();
  for (const p of prs) for (const n of closesIn(p.body, project)) if (!found.has(n)) found.set(n, { issue: n, pr: p.number, mergedAt: p.mergedAt ?? null, mergeSha: p.mergeSha ?? null });
  return [...found.values()].sort((a, b) => a.issue - b.issue);
}

/**
 * Warning 1: commits that staging received and that belong to no listed PR, after the newest test (`since`; null when nothing is tested: every one counts).
 * `commits`: [{ sha, at }], the first-parent history of staging that the default branch lacks. A hotfix or a back-merge shows up here.
 */
export function strayCommits({ commits, prs, since }) {
  const known = new Set(prs.map((p) => p.mergeSha).filter(Boolean));
  return commits.filter((c) => !known.has(c.sha) && (since === null || since === undefined || time(c.at) > time(since))).map((c) => c.sha);
}

/** The two warnings of `huddle release`, as { code, message }: the default branch ahead of staging first (it blocks the release PR), then the stray commits. */
export function releaseWarnings({ stray = [], defaultAhead = false, staging = 'staging', defaultBranch = 'main' }) {
  const out = [];
  if (defaultAhead) out.push({ code: 'default-ahead', message: `${defaultBranch} is ahead of ${staging} (a hotfix went straight to it): a back-merge PR from ${defaultBranch} into ${staging} must be merged first` });
  if (stray.length) out.push({ code: 'stray-commits', message: `${staging} received commits that belong to no listed Issue after the newest test (${stray.map((s) => s.slice(0, 7)).join(', ')}): a hotfix or a back-merge, so the AI Manager must confirm them` });
  return out;
}
