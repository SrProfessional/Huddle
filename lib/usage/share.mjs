// Huddle: each person's token summary on the orphan branch huddle-usage (Issue #230, docs/design.md §26). Numbers only, never text.
// Written with git plumbing and a private index file, so the working tree, the real index and the current branch are never touched.
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

export const USAGE_BRANCH = 'huddle-usage';
const FIELDS = ['input', 'output', 'cacheRead', 'cacheWrite', 'reasoning'];

/** A git runner for the repo at `cwd`: (args, { input, env }) -> stdout. No shell. */
export function gitRunner(cwd) {
  return (args, { input, env } = {}) => execFileSync('git', args, {
    cwd, input, encoding: 'utf8', windowsHide: true, maxBuffer: 64 * 1024 * 1024,
    stdio: [input === undefined ? 'ignore' : 'pipe', 'pipe', 'pipe'], env: env ? { ...process.env, ...env } : process.env,
  });
}

/** The commit of origin/huddle-usage after a fetch, or null when the branch does not exist yet. */
function fetchTip(run, remote) {
  try { run(['fetch', '-q', remote, `+refs/heads/${USAGE_BRANCH}:refs/remotes/${remote}/${USAGE_BRANCH}`]); } catch { /* no branch yet, or offline */ }
  try { return run(['rev-parse', '-q', '--verify', `refs/remotes/${remote}/${USAGE_BRANCH}^{commit}`]).trim() || null; } catch { return null; }
}

/** One commit on top of `parent` (or an orphan) with this person's day files replaced. */
function buildCommit(run, parent, person, rows) {
  const dir = mkdtempSync(path.join(tmpdir(), 'huddle-usage-index-'));
  const env = { GIT_INDEX_FILE: path.join(dir, 'index') };
  try {
    if (parent) run(['read-tree', parent], { env });
    const byDay = new Map();
    for (const r of rows) byDay.set(r.day, [...(byDay.get(r.day) ?? []), r]);
    for (const [day, dayRows] of byDay) {
      const blob = run(['hash-object', '-w', '--stdin'], { input: `${JSON.stringify({ person, day, rows: dayRows }, null, 2)}\n` }).trim();
      run(['update-index', '--add', '--cacheinfo', `100644,${blob},usage/${person}/${day}.json`], { env });
    }
    const tree = run(['write-tree'], { env }).trim();
    const args = ['commit-tree', tree, '-m', `usage: ${person} (${[...byDay.keys()].join(', ')})`];
    if (parent) args.splice(2, 0, '-p', parent);
    return run(args, { env: { GIT_AUTHOR_NAME: 'Huddle', GIT_AUTHOR_EMAIL: 'huddle@localhost', GIT_COMMITTER_NAME: 'Huddle', GIT_COMMITTER_EMAIL: 'huddle@localhost' } }).trim();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/** Pushes `rows` (the person's usage rows, any days) to huddle-usage; a push rejected because someone pushed meanwhile is retried once. */
export function pushUsage({ run, person, rows, remote = 'origin' }) {
  if (!person || !rows.length) return { pushed: false };
  for (let attempt = 0; attempt < 2; attempt++) {
    const parent = fetchTip(run, remote);
    const commit = buildCommit(run, parent, person, rows);
    try {
      run(['push', '-q', remote, `${commit}:refs/heads/${USAGE_BRANCH}`]);
      return { pushed: true, commit };
    } catch (e) {
      if (attempt === 1) throw e;
    }
  }
  return { pushed: false };
}

/** Rows of the same day, tool, model and Issue added up. */
export function sumRows(rows) {
  const out = new Map();
  for (const r of rows) {
    const key = [r.day, r.tool, r.model, r.issue].join('\0');
    const acc = out.get(key) ?? { day: r.day, tool: r.tool, model: r.model, issue: r.issue, ...Object.fromEntries(FIELDS.map((f) => [f, 0])) };
    for (const f of FIELDS) acc[f] += Number(r[f]) || 0;
    out.set(key, acc);
  }
  return [...out.values()].sort((a, b) => a.day.localeCompare(b.day) || a.tool.localeCompare(b.tool) || a.model.localeCompare(b.model) || String(a.issue).localeCompare(String(b.issue)));
}

/** Everybody's rows from huddle-usage: { team: summed rows, people: { login: rows } }. No branch yet: an empty team. */
export function readTeamUsage({ run, remote = 'origin' }) {
  const tip = fetchTip(run, remote);
  if (!tip) return { team: [], people: {} };
  const people = {};
  const files = run(['ls-tree', '-r', '--name-only', tip, 'usage/']).split('\n').filter((f) => /^usage\/[^/]+\/\d{4}-\d{2}-\d{2}\.json$/.test(f));
  for (const file of files) {
    try {
      const data = JSON.parse(run(['show', `${tip}:${file}`]));
      const login = file.split('/')[1];
      people[login] = [...(people[login] ?? []), ...(Array.isArray(data.rows) ? data.rows : [])];
    } catch { /* one bad file never hides the rest */ }
  }
  return { team: sumRows(Object.values(people).flat()), people };
}
