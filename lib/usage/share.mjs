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
export function pushUsage({ run, person, rows: given, remote = 'origin' }) {
  const rows = (given ?? []).filter((r) => r && typeof r === 'object' && r.day); // a row with no day has no file to go to
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

/** Every push URL of `remote` (`git remote get-url --push --all`: a pushurl wins over the url, and there may be several). */
export function remotePushUrls(run, remote = 'origin') {
  try { return run(['remote', 'get-url', '--push', '--all', remote]).split(/\r?\n/).map((l) => l.trim()).filter(Boolean); } catch { return []; }
}

const DEFAULT_PORT = { https: 443, http: 80, ssh: 22, git: 9418, scp: 22 };

/** `{ scheme, host, port, path }` of a git URL (https, ssh:// or scp-like git@host:path); the port is the explicit one, else the scheme's
 * default; path without `.git`, lower case. Null when it is none of those. */
export function urlProject(url) {
  const s = String(url).trim();
  const full = /^(https?|ssh|git):\/\/(?:[^@/]+@)?([^/:]+)(?::(\d+))?\/(.+?)(?:\.git)?\/?$/i.exec(s);
  if (full) { const scheme = full[1].toLowerCase(); return { scheme, host: full[2].toLowerCase(), port: full[3] ? Number(full[3]) : DEFAULT_PORT[scheme], path: full[4].toLowerCase() }; }
  // The scp-like SSH form only when it is unambiguous (third review of PR #245): a plain user name, a host with a dot, a relative path;
  // never a local path (a backslash, a leading / or ., a Windows drive) dressed as user@host:path.
  if (/[\\]/.test(s) || /^[./]/.test(s) || /^[A-Za-z]:/.test(s)) return null;
  const scp = /^(?:([A-Za-z0-9._-]+)@)?([A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+):(?![/\\])([A-Za-z0-9._~-]+(?:\/[A-Za-z0-9._~-]+)*)\/?$/.exec(s);
  return scp ? { scheme: 'scp', host: scp[2].toLowerCase(), port: DEFAULT_PORT.scp, path: scp[3].replace(/\.git$/i, '').toLowerCase() } : null;
}

/** Review of PR #245: true only when there is at least one push URL and every one of them is the configured project on its host and
 * port. A configured host may name a port (`gitlab.example.com:8443`); without one, only the scheme's default port can be verified. */
export function pushGoesTo(urls, config) {
  const [host, port] = String(config.host || (config.platform === 'gitlab' ? 'gitlab.com' : 'github.com')).toLowerCase().split(':');
  const project = String(config.project ?? '').toLowerCase();
  return urls.length > 0 && urls.every((u) => {
    const p = urlProject(u);
    if (!p || p.host !== host || p.path !== project) return false;
    return port ? p.port === Number(port) : p.port === DEFAULT_PORT[p.scheme];
  });
}

/** A remote row reduced to the summary fields, or null when it is not one (no object, no real day); bad numbers count as 0. */
/** True for a real calendar day written YYYY-MM-DD (2026-02-31 is not). */
const realDay = (d) => {
  if (typeof d !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(d)) return false;
  const [y, m, day] = d.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, day));
  return t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === day;
};

/** Second review of PR #245: types are checked before any conversion; a row that is not one is dropped, never the whole file. */
function projectRow(r) {
  if (!r || typeof r !== 'object' || Array.isArray(r) || !realDay(r.day)) return null;
  if (typeof r.tool !== 'string' || typeof r.model !== 'string') return null;
  const issue = (typeof r.issue === 'number' && Number.isInteger(r.issue)) || typeof r.issue === 'string' ? r.issue : (r.issue === undefined ? 'no Issue' : null);
  if (issue === null) return null;
  const n = (v) => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : 0);
  return { day: r.day, tool: r.tool, model: r.model, issue, ...Object.fromEntries(FIELDS.map((f) => [f, n(r[f])])) };
}

/** Every valid row of `rows`, projected; one bad row never stops the others. */
export function projectRows(rows) {
  const out = [];
  for (const r of Array.isArray(rows) ? rows : []) {
    try { const p = projectRow(r); if (p) out.push(p); } catch { /* a row that throws is not a row */ }
  }
  return out;
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
      const rows = projectRows(data?.rows); // review of PR #245: only valid summary rows
      if (rows.length) people[login] = [...(people[login] ?? []), ...rows];
    } catch { /* one bad file never hides the rest */ }
  }
  return { team: sumRows(Object.values(people).flat()), people };
}
