// Huddle: the effort of an Issue in points, 1 small, 2 medium, 3 large (Issue #162, docs/design.md §24). An Issue larger than 3 is a sign to
// split it, not a bigger number. Pure functions: they read an Issue body and never touch the platform.
import { severityOf } from './issue-status.mjs';

const WORDS = { 1: 1, 2: 2, 3: 3, s: 1, m: 2, l: 3, small: 1, medium: 2, large: 3 };
export const DEFAULT_EFFORT = 2;

/** The text of the `## <name>` section, without HTML comments; '' when it is missing. */
function section(body, name) {
  const text = String(body ?? '').replace(/\r\n/g, '\n');
  const m = new RegExp(`^## ${name}[ \\t]*\\n([\\s\\S]*?)(?=^## |(?![\\s\\S]))`, 'm').exec(text);
  return m ? m[1].replace(/<!--[\s\S]*?-->/g, '') : '';
}

/** The effort written under «## Effort»: 1, 2 or 3, and 2 when the section is missing or unreadable (old Issues keep working). */
export function effortOf(body) {
  const word = section(body, 'Effort').trim().split(/\s+/)[0]?.toLowerCase() ?? '';
  return WORDS[word] ?? DEFAULT_EFFORT;
}

/** The list items of a section («- x»), with empty ones left out. */
const items = (text) => text.split('\n').map((l) => /^\s*[-*]\s+(.*\S)/.exec(l)?.[1]).filter(Boolean);

/** The path in one allowed-files item: the first `code` span, else the first word. */
const pathOf = (item) => (/`([^`]+)`/.exec(item)?.[1] ?? item.split(/\s+/)[0]).replace(/^\.\//, '');

/** Points per signal (the thresholds of docs/design.md §24). */
export const filesPoints = (n) => (n <= 2 ? 0 : n <= 6 ? 1 : n <= 12 ? 2 : 4);
export const testsPoints = (n) => (n <= 2 ? 0 : n <= 5 ? 1 : 2);
export const foldersPoints = (n) => (n <= 2 ? 0 : n <= 4 ? 1 : 2);

/**
 * A suggested effort from what the Issue already says: { effort, reasons, split }. Points: allowed files, tests that must pass, a migration,
 * how many top-level folders the files span; 0-1 points is 1, 2-3 is 2, 4-5 is 3, 6 or more is 3 with `split: true`. A blocking bug never
 * changes the effort (it only goes first); it is said in the reasons.
 */
export function suggestEffort(body) {
  const files = items(section(body, 'Allowed files')).map(pathOf);
  const tests = items(section(body, 'Tests that must pass'));
  const folders = new Set(files.map((f) => f.split('/')[0]).filter(Boolean));
  const migration = files.some((f) => /(^|\/)migrations?\//i.test(f) || /migration/i.test(f)) || /\bmigration\b/i.test(section(body, 'Goal'));
  const reasons = [];
  let points = 0;
  const add = (p, why) => { if (p) { points += p; reasons.push(`${why} (+${p})`); } };
  add(filesPoints(files.length), `${files.length} allowed files`);
  add(testsPoints(tests.length), `${tests.length} tests that must pass`);
  add(migration ? 1 : 0, 'a migration');
  add(foldersPoints(folders.size), `${folders.size} top-level folders`);
  if (severityOf(body) === 'blocking') reasons.push('a blocking bug: it goes first, its effort does not change');
  const split = points >= 6;
  if (split) reasons.push('clearly larger than «large»: split it into parts with «Depends on» between them');
  const effort = points <= 1 ? 1 : points <= 3 ? 2 : 3;
  if (!reasons.length) reasons.push('few files and tests, one area');
  return { effort, reasons, split };
}
