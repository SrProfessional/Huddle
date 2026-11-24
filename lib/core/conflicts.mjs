// Huddle: planned file conflicts between open Issues and the order that settles them (Issue #312, docs/design.md §22). `huddle labels` blocks an Issue for a file
// only when an ACTIVE Issue holds it; this reads the Allowed files of the open Issues that have not started, so the Coach can settle the order once, in «Depends on».
// Pure functions on Issue bodies: no network.
import { allowedFilesOf } from './effort.mjs';
import { dependsOn, isBlockingBug, needsTriage } from './issue-status.mjs';
import { findCycle, cycleText } from './schedule.mjs';

/** Files every Issue touches by rule: they never make a conflict. */
const BY_RULE = new Set(['CHANGELOG.md']);
const docsOnly = (files) => files.length > 0 && files.every((f) => f.startsWith('docs/'));
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
  const m = /^## Depends on[ \t]*\r?\n([\s\S]*?)(?=^## |(?![\s\S]))/m.exec(text);
  if (!m) return null;
  if ((dependsOn(text) ?? []).includes(n)) return text;
  const lines = m[1].split(/\r?\n/).filter((l) => l.trim() && !/^\s*[-*]\s*None\s*$/i.test(l));
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
export function conflictReport(issues) {
  const list = issues.filter((i) => dependsOn(i.body) !== null && !needsTriage(i)).map((i) => ({ ...i, files: allowedFilesOf(i.body) })).sort((a, b) => a.number - b.number);
  const deps = new Map(list.map((i) => [i.number, dependsOn(i.body)]));
  const rows = [];
  for (let x = 0; x < list.length; x += 1) {
    for (let y = x + 1; y < list.length; y += 1) {
      const [a, b] = [list[x], list[y]];
      const files = sharedFiles(a.files, b.files).filter((f) => !(docsOnly(a.files) && docsOnly(b.files) && f.startsWith('docs/')));
      if (!files.length) continue;
      const aFirst = reaches(deps, b.number, a.number) ? true : reaches(deps, a.number, b.number) ? false : isBlockingBug(a) !== isBlockingBug(b) ? isBlockingBug(a) : true;
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
 * would close a circle with `{ first, then, text, breakIt }`. A circle is checked against the dependencies in the open Issues and the links added before it.
 */
export function planApply(issues) {
  const { rows } = conflictReport(issues);
  const byNumber = new Map(issues.map((i) => [i.number, i]));
  const links = [...new Map(issues.map((i) => [i.number, dependsOn(i.body) ?? []])).entries()].flatMap(([from, tos]) => tos.filter((to) => byNumber.has(to)).map((to) => ({ from, to, kind: 'dependency' })));
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
