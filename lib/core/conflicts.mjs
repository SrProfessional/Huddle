// Huddle: planned file conflicts between open Issues and the order that settles them (Issue #312, docs/design.md §22). `huddle labels` blocks an Issue for a file
// only when an ACTIVE Issue holds it; this reads the Allowed files of the open Issues that have not started, so the Coach can settle the order once, in «Depends on».
// Pure functions on Issue bodies: no network.
import { allowedFilesOf } from './effort.mjs';
import { dependsOn, isBlockingBug, needsTriage } from './issue-status.mjs';
import { findCycle, cycleText } from './schedule.mjs';

/** Files every Issue touches by rule: they never make a conflict. */
const BY_RULE = new Set(['CHANGELOG.md']);
/** Docs-only: it lists at least one docs file and nothing else but the files every Issue touches by rule (Issue #315: CHANGELOG.md does not make an Issue code). */
const docsOnly = (files) => { const own = files.filter((f) => !BY_RULE.has(f)); return own.length > 0 && own.every((f) => f.startsWith('docs/')); };
/** `None`, `(none)`, `(None).`: the way an «Allowed files» section says it lists no file (Issue #315). */
const NO_FILE = /^\(?none\)?\.?$/i;
/** The allowed files of an Issue body, with a «None» line left out. Local on purpose: the shared reader (effort.mjs) is not in this Issue's allowed files. */
const filesOf = (body) => allowedFilesOf(body).filter((f) => !NO_FILE.test(f));
/** The body with every fenced code block blanked to spaces (same length, same lines), so a heading inside a fence is not read as a section. */
const unfenced = (body) => String(body ?? '').replace(/^[ \t]*(```|~~~)[^\n]*\n[\s\S]*?(?:^[ \t]*\1[^\n]*(?:\n|$)|(?![\s\S]))/gm, (m) => m.replace(/[^\r\n]/g, ' '));
const covers = (a, b) => a === b || (a.endsWith('/') && b.startsWith(a));

/** The paths two lists of allowed files share, sorted: the same path, or a folder (a path ending in «/») and what is under it (the more specific path is named). */
export function sharedFiles(a, b) {
  const out = new Set();
  for (const x of a.filter((f) => !BY_RULE.has(f))) {
    for (const y of b.filter((f) => !BY_RULE.has(f))) {
      if (covers(x, y)) out.add(y);
      else if (covers(y, x)) out.add(x);
    }
  }
  return [...out].sort();
}

/** The body with `- #n` under «Depends on» (a «- None» line removed), or null when the section is missing. The same body when `n` is already listed. */
export function addDependency(body, n) {
  const text = String(body ?? '');
  const nl = text.includes('\r\n') ? '\r\n' : '\n';
  const m = /^## Depends on[ \t]*\r?\n([\s\S]*?)(?=^## |(?![\s\S]))/m.exec(unfenced(text));
  if (!m) return null;
  if ((dependsOn(unfenced(text)) ?? []).includes(n)) return text;
  const lines = text.slice(m.index + m[0].length - m[1].length, m.index + m[0].length).split(/\r?\n/).filter((l) => l.trim() && !/^\s*[-*]\s*None\s*$/i.test(l));
  const section = `${nl}${[...lines, `- #${n}`].join(nl)}${nl}${nl}`;
  return text.slice(0, m.index + m[0].length - m[1].length) + section.replace(/^\r?\n/, nl) + text.slice(m.index + m[0].length);
}

/** `a` waits for `b` through «Depends on», directly or through other Issues. */
function reaches(deps, a, b, seen = new Set()) {
  if (seen.has(a)) return false;
  seen.add(a);
  return (deps.get(a) ?? []).some((d) => d === b || reaches(deps, d, b, seen));
}

/**
 * The open Issues that share an allowed file, as `rows` of `{ first, then, files, settled }` (settled: «then» already waits for «first» through «Depends on»), and `free`,
 * the Issues with no conflict with anyone. The suggested order: an Issue the other depends on first, then a blocking bug, then the lower number. Issues with no «Depends on»
 * section (not managed) or waiting for triage are left out; two docs-only Issues never conflict on a doc.
 */
export function conflictReport(issues, { order = [] } = {}) {
  const list = issues.filter((i) => dependsOn(unfenced(i.body)) !== null && !needsTriage(i)).map((i) => ({ ...i, files: filesOf(i.body) })).sort((a, b) => a.number - b.number);
  const deps = new Map(list.map((i) => [i.number, dependsOn(unfenced(i.body))]));
  const rows = [];
  for (let x = 0; x < list.length; x += 1) {
    for (let y = x + 1; y < list.length; y += 1) {
      const [a, b] = [list[x], list[y]];
      const files = sharedFiles(a.files, b.files).filter((f) => !(docsOnly(a.files) && docsOnly(b.files) && f.startsWith('docs/')));
      if (!files.length) continue;
      const [ia, ib] = [order.indexOf(a.number), order.indexOf(b.number)];
      // The Coach's order (Issue #315) wins between two named Issues; everything else follows the rule.
      const aFirst = ia >= 0 && ib >= 0 ? ia < ib : reaches(deps, b.number, a.number) ? true : reaches(deps, a.number, b.number) ? false : isBlockingBug(a) !== isBlockingBug(b) ? isBlockingBug(a) : true;
      const [first, then] = aFirst ? [a, b] : [b, a];
      rows.push({ first: first.number, then: then.number, files, settled: reaches(deps, then.number, first.number) });
    }
  }
  rows.sort((p, q) => p.first - q.first || p.then - q.then);
  const involved = new Set(rows.flatMap((r) => [r.first, r.then]));
  return { rows, free: list.map((i) => i.number).filter((n) => !involved.has(n)) };
}

/**
 * What `huddle conflicts --apply` writes: `changes` of `{ issue, add: [first...], body }` (one per «then» Issue, never a link already there) and `refused`, the links that
 * would close a circle with `{ first, then, text, breakIt }`. `order` (Issue #315): the Coach's order for the Issues named, applied between the pairs of them that share a file. A circle is checked against the dependencies in the open Issues and the links added before it.
 */
export function planApply(issues, { order = [] } = {}) {
  const { rows } = conflictReport(issues, { order });
  const byNumber = new Map(issues.map((i) => [i.number, i]));
  const links = [...new Map(issues.map((i) => [i.number, dependsOn(unfenced(i.body)) ?? []])).entries()].flatMap(([from, tos]) => tos.filter((to) => byNumber.has(to)).map((to) => ({ from, to, kind: 'dependency' })));
  const bodies = new Map();
  const added = new Map();
  const refused = [];
  for (const r of rows.filter((x) => !x.settled)) {
    const trial = [...links, { from: r.then, to: r.first, kind: 'dependency' }];
    const cycle = findCycle(trial);
    if (cycle) { refused.push({ first: r.first, then: r.then, ...cycleText(cycle) }); continue; }
    const next = addDependency(bodies.get(r.then) ?? byNumber.get(r.then).body, r.first);
    if (next === null) continue;
    bodies.set(r.then, next);
    added.set(r.then, [...(added.get(r.then) ?? []), r.first]);
    links.push({ from: r.then, to: r.first, kind: 'dependency' });
  }
  return { changes: [...added.keys()].sort((a, b) => a - b).map((issue) => ({ issue, add: added.get(issue), body: bodies.get(issue) })), refused };
}
