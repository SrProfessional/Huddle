// Huddle: knowing when a newer release exists (Issue #65). Everything that touches the outside comes in `ctx`, so tests fake it:
//   fetch(url, opts) (Node's fetch), now() -> ms, readFile(file) -> text|null, writeFile(file, text),
//   pluginRoot (folder of the running plugin), updateCachePath (the cache file), updateTimeoutMs (default 3000).
// Nothing here ever throws to the caller: every failure is «no answer» (null).

export const RELEASE_URL = 'https://api.github.com/repos/SrProfessional/Huddle/releases/latest';
export const RELEASE_PAGE = 'https://github.com/SrProfessional/Huddle/releases/tag/';
const DAY_MS = 24 * 60 * 60 * 1000;

/** `{ core: [major, minor, patch], pre }` from «0.4.0», «v0.4.0» or «0.5.0-rc.1»; null when it is not a version. */
export function parseVersion(text) {
  const m = /^v?(\d+)\.(\d+)\.(\d+)(-[0-9A-Za-z.-]+)?(\+[0-9A-Za-z.-]+)?$/.exec(String(text ?? '').trim());
  return m ? { core: [Number(m[1]), Number(m[2]), Number(m[3])], pre: Boolean(m[4]) } : null;
}

/** True only when `latest` is a release (never a pre-release) with a higher number than `installed`. Anything unreadable is false. */
export function isNewer(latest, installed) {
  const a = parseVersion(latest);
  const b = parseVersion(installed);
  if (!a || !b || a.pre) return false;
  for (let i = 0; i < 3; i++) if (a.core[i] !== b.core[i]) return a.core[i] > b.core[i];
  return false;
}

const bare = (v) => String(v).trim().replace(/^v/, '');

/** `job` or null: after `ms` milliseconds, or when it fails. The timer never keeps the process alive. */
function within(job, ms) {
  let timer;
  const late = new Promise((resolve) => { timer = setTimeout(() => resolve(null), ms); timer.unref?.(); });
  return Promise.race([Promise.resolve().then(() => job()).catch(() => null), late]).finally(() => clearTimeout(timer));
}

/** The version in `<pluginRoot>/.claude-plugin/plugin.json`, or null. */
export function installedVersion(ctx) {
  if (!ctx.pluginRoot) return null;
  try {
    const text = ctx.readFile(`${String(ctx.pluginRoot).replace(/[\\/]+$/, '')}/.claude-plugin/plugin.json`);
    const v = JSON.parse(text)?.version;
    return parseVersion(v) ? bare(v) : null;
  } catch {
    return null;
  }
}

/** True when the pieces needed to check are wired (tests that do not care leave them out and nothing happens). */
export const canCheck = (ctx) => Boolean(ctx.fetch && ctx.now && ctx.updateCachePath);

export function readCache(ctx) {
  try {
    const c = JSON.parse(ctx.readFile(ctx.updateCachePath));
    return c && typeof c === 'object' && !Array.isArray(c) ? c : {};
  } catch {
    return {};
  }
}

function saveCache(ctx, patch) {
  try { ctx.writeFile(ctx.updateCachePath, JSON.stringify({ ...readCache(ctx), ...patch })); } catch {} // a cache that cannot be written only costs one more lookup
}

async function fetchLatest(ctx) {
  const res = await ctx.fetch(RELEASE_URL, { headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'huddle-update-check' }, signal: AbortSignal.timeout(ctx.updateTimeoutMs ?? 3000) });
  if (!res?.ok) return null;
  const body = await res.json();
  if (!body || body.prerelease === true || body.draft === true) return null;
  const v = parseVersion(body.tag_name);
  return v && !v.pre ? bare(body.tag_name) : null;
}

/**
 * The newest release number («0.4.0») or null. Looks GitHub up at most once a day (the answer is cached with the time it was read);
 * when the lookup fails, the older cached answer is used, and without one the answer is null.
 */
export async function latestRelease(ctx) {
  if (!canCheck(ctx)) return null;
  const cache = readCache(ctx);
  const age = ctx.now() - Number(cache.checkedAt);
  if (parseVersion(cache.latest) && age >= 0 && age < DAY_MS) return bare(cache.latest);
  const latest = await within(() => fetchLatest(ctx), ctx.updateTimeoutMs ?? 3000);
  if (latest) { saveCache(ctx, { checkedAt: ctx.now(), latest }); return latest; }
  return parseVersion(cache.latest) ? bare(cache.latest) : null;
}

/** True when the notice has not been shown in the last 24 h. */
export const noticeDue = (ctx) => {
  const age = ctx.now() - Number(readCache(ctx).shownAt);
  return !(age >= 0 && age < DAY_MS);
};
export const markShown = (ctx) => saveCache(ctx, { shownAt: ctx.now() });

/** The two ways to update, as one sentence for a person. A clone has no plugin cache to update: it is pulled. */
export const updateSteps = (clone) => (clone
  ? 'Pull your clone (git pull) and open a new session.'
  : 'In a terminal, run:\n  claude plugin marketplace update huddle\n  claude plugin update huddle@huddle\nthen open a new session.');

/** The notice. `manager`: add the AI Manager's extra line. */
export function noticeText({ latest, installed, clone, manager }) {
  return [
    `Huddle ${latest} is available (you have ${installed}). ${updateSteps(clone)} What changed: ${RELEASE_PAGE}v${latest}`,
    manager ? 'After updating, run /huddle-setup on a branch in each repo to get the new templates.' : null,
  ].filter(Boolean).join('\n');
}

/**
 * What the hook adds at session start: `{ visible, context }` or null (nothing newer, already shown today, no answer).
 * `isManager()` is asked only when there is something to show.
 */
export async function sessionNotice(ctx, isManager) {
  if (!canCheck(ctx) || !noticeDue(ctx)) return null;
  const installed = installedVersion(ctx);
  if (!installed) return null;
  const latest = await latestRelease(ctx);
  if (!latest || !isNewer(latest, installed)) return null;
  const clone = !ctx.pluginInstalled;
  const manager = Boolean(await within(async () => isManager(), 5000));
  const text = noticeText({ latest, installed, clone, manager });
  markShown(ctx);
  return {
    visible: text,
    context: `${text}\nTell the person this in their language, as the first thing in your first answer, before anything else.`,
  };
}

/** The doctor line: `{ mark, detail }`. A failed lookup or an unreadable version is a warning, never a failure. */
export async function versionCheck(ctx) {
  const installed = installedVersion(ctx);
  if (!installed) return { mark: '⚠', detail: 'could not read the installed version' };
  const latest = await latestRelease(ctx);
  if (!latest) return { mark: '⚠', detail: 'could not check the latest release' };
  if (!isNewer(latest, installed)) return { mark: '✔', detail: `huddle ${installed} (latest)` };
  const how = ctx.pluginInstalled ? 'run claude plugin marketplace update huddle and claude plugin update huddle@huddle, then open a new session' : 'pull your clone';
  return { mark: '⚠', detail: `huddle ${installed}, latest is ${latest}: ${how}` };
}
