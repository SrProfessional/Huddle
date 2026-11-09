// Huddle: the mechanics of `huddle areas` (Issue #42, docs/design.md §12). Pure logic, no network.
// The judgment (which areas, which area an Issue belongs to, how many remain) is the skill's job; this file only does what is the same every time:
// writing the «Huddle remaining: N» line, counting Issues per area, and finding what the check-up reports.

import { areaOf, isProgressIssue } from './progress.mjs';

const REMAINING_LINE = /^huddle remaining:/i;

/**
 * The description of a milestone once its estimate is `remaining`.
 *  - new milestone (`existing` null): the purpose, a blank line, the remaining line;
 *  - no `purpose`: only the remaining line changes (the one the progress code reads, so the first), and every other line stays;
 *    with no such line yet, one is added after the text;
 *  - an explicit `purpose` replaces the other text.
 * The line endings of `existing` stay: CRLF stays CRLF.
 */
export function describeMilestone({ existing, remaining, purpose }) {
  const text = existing ?? '';
  const eol = text.includes('\r\n') ? '\r\n' : '\n';
  const line = `Huddle remaining: ${remaining}`;
  if (purpose !== undefined) return purpose.trim() ? `${purpose.trim()}${eol}${eol}${line}` : line;
  if (!text.trim()) return line;
  const lines = text.split(/\r?\n/);
  const at = lines.findIndex((l) => REMAINING_LINE.test(l.trim()));
  if (at >= 0) {
    lines[at] = line;
    return lines.join(eol);
  }
  return `${text.trimEnd()}${eol}${eol}${line}`;
}

const brief = (i) => ({ number: i.number, title: i.title ?? '' });

/**
 * The areas of the project and the Issues with none. `milestones` is what listMilestones gives, `openIssues` what listOpenIssues gives and
 * `closedIssues` what listClosedIssues gives. The «Huddle progress» Issue is never counted. Each area is
 * { title, state, open, merged, remaining, estimateMissing, malformed }.
 */
export function areasList({ milestones = [], openIssues = [], closedIssues = [] } = {}) {
  const areas = milestones.map((m) => {
    const a = areaOf(m);
    return { title: a.title, state: a.state, open: m.issues.filter((i) => i.open).length, merged: a.merged, remaining: a.remaining, estimateMissing: a.estimateMissing, malformed: a.malformed };
  });
  return {
    areas,
    noArea: {
      open: openIssues.filter((i) => !i.milestone && !isProgressIssue(i)).map(brief),
      closed: closedIssues.filter((i) => !i.milestone).map(brief),
    },
  };
}

/**
 * The check-up as data (point 5 of the Issue). Only open areas are checked for an estimate: a closed one is finished.
 *   noArea            Issues with no milestone, open and closed
 *   missingEstimate   areas with no «Huddle remaining» line
 *   malformedEstimate areas whose line is not a whole number
 *   zeroRemaining     areas with an estimate of 0: the skill compares them with the open specs, because only reading the specs says if 0 is stale
 *   empty             areas with no Issue at all and an estimate of 0 (an area with no estimate line is in missingEstimate, not here)
 */
export function checkOf(list) {
  const live = list.areas.filter((a) => a.state === 'open');
  const titles = (pick) => live.filter(pick).map((a) => a.title);
  const check = {
    noArea: list.noArea,
    missingEstimate: titles((a) => a.estimateMissing && !a.malformed),
    malformedEstimate: titles((a) => a.malformed),
    zeroRemaining: titles((a) => !a.estimateMissing && a.remaining === 0),
    empty: titles((a) => a.open + a.merged === 0 && a.remaining === 0 && !a.estimateMissing), // a missing estimate is already listed above: once is enough
  };
  const found = check.noArea.open.length + check.noArea.closed.length + check.missingEstimate.length + check.malformedEstimate.length + check.zeroRemaining.length;
  return { ...check, ok: found === 0 };
}

const issueList = (items) => items.map((i) => `#${i.number}${i.title ? ` ${i.title}` : ''}`).join(', ');

/** The table of `huddle areas list`: each area with its open and merged Issues and its remaining line («missing» when it has none), then the no-area counts. */
export function listText(list) {
  const lines = [];
  if (!list.areas.length) lines.push('No areas yet. Define them with the skill /huddle-areas, or create one: huddle areas set <title> --remaining N');
  else {
    const rows = list.areas.map((a) => [a.state === 'open' ? a.title : `${a.title} (closed)`, String(a.open), String(a.merged), a.estimateMissing ? (a.malformed ? 'invalid' : 'missing') : String(a.remaining)]);
    const head = ['Area', 'Open', 'Merged', 'Remaining'];
    const width = [0, 1, 2, 3].map((c) => Math.max(...[head, ...rows].map((r) => r[c].length)));
    const line = (r) => `${r[0].padEnd(width[0])}  ${r[1].padStart(width[1])}  ${r[2].padStart(width[2])}  ${r[3].padStart(width[3])}`;
    lines.push(line(head), ...rows.map(line));
  }
  const { open, closed } = list.noArea;
  if (open.length || closed.length) lines.push('', `No area: ${open.length} open, ${closed.length} closed (huddle areas check lists them).`);
  return lines.join('\n');
}

/** The report of `huddle areas check`: one line per kind of finding, nothing for a kind with none. */
export function checkText(check) {
  if (check.ok && !check.empty.length) return 'Check-up: nothing to fix.';
  const lines = [];
  if (check.noArea.open.length) lines.push(`No area (open): ${issueList(check.noArea.open)}`);
  if (check.noArea.closed.length) lines.push(`No area (closed): ${issueList(check.noArea.closed)}`);
  if (check.missingEstimate.length) lines.push(`No «Huddle remaining» line: ${check.missingEstimate.join(', ')}`);
  if (check.malformedEstimate.length) lines.push(`Not a whole number: ${check.malformedEstimate.join(', ')}`);
  if (check.zeroRemaining.length) lines.push(`Remaining is 0: ${check.zeroRemaining.join(', ')} (is 0 still true? compare with the open specs and plans)`);
  if (check.empty.length) lines.push(`No Issue and remaining 0: ${check.empty.join(', ')}`);
  return lines.join('\n');
}
