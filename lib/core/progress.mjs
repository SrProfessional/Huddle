// Huddle: progress by area (docs/design.md §12). Pure logic, no network: milestones with their Issues go in, numbers and text come out.
//
// A milestone is { title, description, state, closedAt, issues: [{ number, open, merged }] } (what the adapter's listMilestones returns).
// An Issue that is closed but not merged («not planned», or closed by hand) counts in neither `merged` nor `total`.

export const MARKER = '<!-- huddle:progress -->';
export const TITLE = 'Huddle progress';
export const WINDOW_DAYS = 90;
const DASH = '—'; // what 0 ÷ 0 shows

/** The ISO date from which closed milestones still count: 90 days before `now`. */
export function windowStart(now = new Date()) {
  return new Date(now.getTime() - WINDOW_DAYS * 24 * 60 * 60 * 1000).toISOString();
}

/** The estimate in a milestone description: a line of its own, `Huddle remaining: N`. No line, or a value that is not a whole number, is 0 and «missing». */
export function remainingOf(description) {
  const line = String(description ?? '').replace(/\r\n/g, '\n').split('\n').map((l) => l.trim()).find((l) => /^huddle remaining:/i.test(l));
  if (line === undefined) return { remaining: 0, missing: true, malformed: false };
  const value = /^huddle remaining:[ \t]*(\d+)$/i.exec(line);
  return value ? { remaining: Number(value[1]), missing: false, malformed: false } : { remaining: 0, missing: true, malformed: true };
}

/** merged ÷ all, rounded down to a whole number; null (shown as «—») when there is nothing to divide by. Integer maths only, so 29 ÷ 100 is 29 and not 28. */
export function percentOf(merged, all) {
  return all > 0 ? Math.floor((merged * 100) / all) : null;
}

/** One area: { title, state, merged, total, remaining, percent, estimateMissing, malformed }. */
export function areaOf(milestone) {
  const issues = milestone.issues ?? [];
  const merged = issues.filter((i) => !i.open && i.merged).length;
  const total = merged + issues.filter((i) => i.open).length;
  const { remaining, missing, malformed } = remainingOf(milestone.description);
  return { title: milestone.title, state: milestone.state ?? 'open', merged, total, remaining, percent: percentOf(merged, total + remaining), estimateMissing: missing, malformed };
}

/** The areas and the total of the project: sum of merged ÷ sum of (total + remaining). `noArea` is the count of Issues with no milestone (left out of the %). */
export function progressOf({ milestones = [], noArea = 0 } = {}) {
  const areas = milestones.map(areaOf);
  const sum = (key) => areas.reduce((n, a) => n + a[key], 0);
  const total = { merged: sum('merged'), total: sum('total'), remaining: sum('remaining') };
  return { areas, total: { ...total, percent: percentOf(total.merged, total.total + total.remaining) }, noArea };
}

export const isProgressIssue = (issue) => String(issue?.body ?? '').includes(MARKER);

/** Open Issues with no milestone, not counting the progress Issue itself. */
export const noAreaCount = (openIssues) => openIssues.filter((i) => !i.milestone && !isProgressIssue(i)).length;

/** The progress Issue among the open Issues: the one whose body carries the marker. Never found by its title. */
export const findProgressIssue = (openIssues) => openIssues.find(isProgressIssue) ?? null;

const show = (percent) => (percent === null ? DASH : `${percent}%`);

/** Ten cells, one per ten percent: `[####......]`. */
export function bar(percent) {
  const filled = percent === null ? 0 : Math.min(10, Math.floor(percent / 10));
  return `[${'#'.repeat(filled)}${'.'.repeat(10 - filled)}]`;
}

const issuesWithout = (n) => `${n} open Issue${n === 1 ? '' : 's'} without a milestone`;

/** The table of `huddle progress`: area, merged/total +remaining, %, a text bar; then the total. */
export function tableText(result) {
  if (!result.areas.length) return `No milestones (areas) yet.${result.noArea ? ` ${issuesWithout(result.noArea)}.` : ''}`;
  const rows = [...result.areas, { title: 'Total', ...result.total }].map((a) => [a.title, `${a.merged}/${a.total} +${a.remaining}`, show(a.percent), bar(a.percent)]);
  const head = ['Area', 'Merged', '%', 'Progress'];
  const width = [0, 1, 2].map((c) => Math.max(...[head, ...rows].map((r) => r[c].length)));
  const line = (r) => `${r[0].padEnd(width[0])}  ${r[1].padEnd(width[1])}  ${r[2].padStart(width[2])}  ${r[3]}`.trimEnd();
  const out = [line(head), ...rows.slice(0, -1).map(line), line(['-'.repeat(width[0]), '-'.repeat(width[1]), '-'.repeat(width[2]), '']), line(rows.at(-1))];
  if (result.noArea) out.push('', `No area: ${issuesWithout(result.noArea)} (left out of the %).`);
  const missing = result.areas.filter((a) => a.estimateMissing).map((a) => a.title);
  if (missing.length) out.push('', `Estimate missing for: ${missing.join(', ')}. Write «Huddle remaining: N» on a line of the milestone description.`);
  return out.join('\n');
}

/** The one line of the SessionStart hook, or null when the project has no milestones. */
export function summaryLine(result) {
  if (!result.areas.length) return null;
  return `Progress: ${[...result.areas.map((a) => `${a.title} ${show(a.percent)}`), `Total ${show(result.total.percent)}`].join(' · ')}`;
}

/** The body of the «Huddle progress» Issue. It holds no date or time, so the same data gives the same text and an unchanged run writes nothing. */
export function issueBody(result) {
  const lines = [MARKER, `# ${TITLE}`, ''];
  if (!result.areas.length) lines.push('No milestones (areas) yet.');
  else {
    lines.push('| Area | Merged | % | Progress |', '|---|---|---:|---|');
    for (const a of [...result.areas, { title: '**Total**', ...result.total }]) lines.push(`| ${a.title} | ${a.merged}/${a.total} +${a.remaining} | ${show(a.percent)} | \`${bar(a.percent)}\` |`);
  }
  lines.push('', '`merged/total +remaining`: merged Issues, Issues of the area that are merged or open, and the Issues still to be written (the «Huddle remaining: N» line of the milestone description).');
  if (result.noArea) lines.push('', `No area: ${issuesWithout(result.noArea)} (left out of the %).`);
  const missing = result.areas.filter((a) => a.estimateMissing).map((a) => a.title);
  if (missing.length) lines.push('', `Estimate missing for: ${missing.join(', ')}.`);
  lines.push('', '_Written by `huddle labels`. Do not edit: it is rewritten when the numbers change._', '');
  return lines.join('\n');
}
