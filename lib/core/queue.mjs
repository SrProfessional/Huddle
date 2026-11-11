// Huddle: what waits for the AI Manager (docs/design.md §19). Pure: no network. Neutral shapes as in issue-status.mjs.
import { dependsOn, needsTriage, reviewing, waitsForDecision } from './issue-status.mjs';

/**
 * The open Issues that wait for the AI Manager, sorted by Issue number, one item each:
 *   triage    the label `needs triage` (a raw report);
 *   decision  the label `needs decision` and no answer yet (request state null);
 *   review    an open non-draft PR/MR (`openPrs`: their numbers) and request state null. Like `plan`, only for a managed Issue (one with a «Depends on» section).
 * An Issue is listed once, in that order. A pending or taken request is the developer's turn. `requests`: Issue number -> requestState (missing = null).
 * Labels are the core names (the CLI translates renames first). A `review` item carries `pr`, the first open PR/MR that resolves the Issue.
 */
export function waitingFor({ open = [], openPrs = new Set(), requests = new Map() } = {}) {
  const out = [];
  for (const it of open) {
    const base = { issue: it.number, title: it.title ?? '' };
    const request = requests.get(it.number) ?? null;
    if (needsTriage(it)) out.push({ ...base, waits: 'triage' });
    else if (waitsForDecision(it) && request === null) out.push({ ...base, waits: 'decision' });
    else if (waitsForDecision(it)) continue; // answered: the developer's turn
    else if (request === null && dependsOn(it.body) !== null && reviewing(it, openPrs)) out.push({ ...base, waits: 'review', pr: it.reviews.find((n) => openPrs.has(n)) });
  }
  return out.sort((a, b) => a.issue - b.issue);
}
