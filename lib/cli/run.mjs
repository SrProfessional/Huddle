// Huddle: the commands of `bin/huddle` (docs/design.md §4, §6), all on the platform adapter. Ported from SocialCortex's issue-labels.mjs and review-watch.mjs.
//
// run(argv, ctx) -> exit code. `ctx` is everything that touches the outside, so tests replace it:
//   root, readFile(file) -> text|null, createPlatform(config) -> adapter, out(text), err(text), sleep(ms), hookTimeoutMs

import { assignments, closedCleanup, dependsOn, LABELS, loadOf, plan, requestLabels, statusOf, waitsForDecision } from '../core/issue-status.mjs';
import { lastWorkAt, requestState, pendingRequests, promptOf } from '../core/review-requests.mjs';
import { TITLE, findProgressIssue, issueBody, noAreaCount, progressOf, summaryLine, tableText, windowStart } from '../core/progress.mjs';
import { labelNames, loadConfig } from './config.mjs';

const USAGE = 'Usage: huddle labels [--dry-run] | wait <issue> [seconds] | take <issue> | pending [issue] | progress [--json] | hook | doctor';
const WATCHED = ['progress', 'review', 'changes', 'decision'];
const isNumber = (s) => /^\d+$/.test(String(s ?? ''));
const same = (a, b) => String(a).toLowerCase() === String(b).toLowerCase();

/** Translates between the names in huddle.json and the default names the core knows. */
function renamer(config) {
  const names = labelNames(config);
  const toCore = new Map(Object.keys(LABELS).map((k) => [names[k], LABELS[k].name]));
  const toConfig = new Map(Object.keys(LABELS).map((k) => [LABELS[k].name, names[k]]));
  return { names, toCore: (n) => toCore.get(n) ?? n, toConfig: (n) => toConfig.get(n) ?? n };
}

// --- labels ---------------------------------------------------------------------------------------------------------------------------

async function labels({ args, config, adapter, ctx }) {
  const dry = args.includes('--dry-run');
  const rn = renamer(config);
  const max = config.max_open_per_person ?? Infinity;
  const open = (await adapter.listOpenIssues()).map((i) => ({ ...i, labels: i.labels.map(rn.toCore), assignees: [...i.assignees] }));
  const openPrs = new Set(await adapter.openReviews());
  const issues = new Map();
  for (const n of new Set(open.flatMap((i) => dependsOn(i.body) ?? []))) issues.set(n, await adapter.issueState(n));
  const titleOf = (n) => open.find((i) => i.number === n)?.title ?? '';
  let count = 0;

  // 1. Assign what is ready.
  const ready = open.filter((it) => {
    const deps = dependsOn(it.body);
    return deps !== null && !waitsForDecision(it) && statusOf({ deps, assigned: it.assignees.length > 0, issues }).label === LABELS.ready.name;
  });
  for (const { number, to } of assignments({ ready, team: config.assignees, load: loadOf(open, openPrs), max })) {
    ctx.out(`#${number} assigned to ${to}  ${titleOf(number)}`);
    if (!dry) {
      try {
        await adapter.assign(number, to);
      } catch (e) {
        // For example, someone in the list who is not a collaborator yet: the Issue stays ready.
        ctx.out(`  could not assign #${number} to ${to}: ${String(e.message).split('\n')[0]}`);
        continue;
      }
    }
    open.find((i) => i.number === number).assignees.push(to);
  }

  // 2. Where the AI Manager's requests stand on each managed open Issue (requestState), from the comments of the Issue and its PRs/MRs and their commits.
  // Read before the status labels: a pending request takes «in review» off.
  const requests = new Map();
  for (const it of open.filter((i) => dependsOn(i.body) !== null)) {
    const comments = (await Promise.all([it.number, ...it.reviews].map((n) => adapter.comments(n)))).flat();
    const commits = (await Promise.all(it.reviews.map((n) => adapter.reviewCommits(n)))).flat();
    requests.set(it.number, requestState({ manager: config.ai_manager, comments, commits }));
  }

  // 3. Status labels.
  const changes = plan({ open, issues, openPrs, requests });
  const wanted = Object.keys(LABELS).map((k) => ({ ...LABELS[k], name: rn.names[k] }));
  const existing = new Set(await adapter.listLabels());
  const created = wanted.filter((l) => !existing.has(l.name)).length;
  if (!dry) await adapter.ensureLabels(wanted);
  for (const c of changes) {
    ctx.out(`#${c.number} → ${c.add ? rn.toConfig(c.add) : '(keeps its label)'}${c.waiting.length ? ` (waits for ${c.waiting.map((n) => `#${n}`).join(', ')})` : ''}  ${titleOf(c.number)}`);
    if (!dry) await adapter.setLabels(c.number, c.add ? [rn.toConfig(c.add)] : [], c.remove.map(rn.toConfig));
    count += 1;
  }

  // 4. The request labels: «changes requested» is on exactly while a request is pending (not taken), and an answered question loses «needs decision».
  // Nobody puts or removes them by hand.
  for (const it of open.filter((i) => requests.has(i.number))) {
    const change = requestLabels(it, requests.get(it.number));
    if (!change) continue;
    const [add, remove] = [change.add.map(rn.toConfig), change.remove.map(rn.toConfig)];
    ctx.out(`#${it.number}${add.length ? ` + ${add.join(', ')}` : ''}${remove.length ? ` − ${remove.join(', ')}` : ''}  ${titleOf(it.number)}`);
    if (!dry) await adapter.setLabels(it.number, add, remove);
    count += 1;
  }

  // 5. A closed Issue keeps no Huddle label (closing one used to leave «in review» or «needs decision» on it forever).
  const closed = (await adapter.listClosedIssues()).map((i) => ({ ...i, labels: i.labels.map(rn.toCore) }));
  for (const c of closedCleanup(closed)) {
    const remove = c.remove.map(rn.toConfig);
    ctx.out(`#${c.number} (closed) loses ${remove.join(', ')}`);
    if (!dry) await adapter.setLabels(c.number, [], remove);
    count += 1;
  }
  ctx.out(dry ? `${created} label${created === 1 ? '' : 's'} would be created (dry run).` : `${created} label${created === 1 ? '' : 's'} created.`);
  ctx.out(`${count} label change(s)${dry ? ' (dry run: nothing was changed)' : ''}.`);

  // 6. Progress by area, after the labels and best effort: whatever fails here, the labels above are already done.
  await syncProgressIssue({ adapter, config, ctx, open, dry });
  return 0;
}

// --- progress ---------------------------------------------------------------------------------------------------------------------------

const firstLine = (e) => String(e?.message ?? e).split('\n')[0];
const sameText = (a, b) => String(a).replace(/\r\n/g, '\n').trimEnd() === String(b).replace(/\r\n/g, '\n').trimEnd();

/** The areas and the total of the project: its milestones (open, or closed in the last 90 days) and how many open Issues have none. */
async function readProgress({ adapter, ctx }, open) {
  const milestones = await adapter.listMilestones({ since: windowStart(ctx.now?.() ?? new Date()) });
  return { milestones, result: progressOf({ milestones, noArea: open ? noAreaCount(open) : 0 }) };
}

/**
 * Creates the «Huddle progress» Issue once and rewrites it when its text changes (docs/design.md §12). Found by its marker, never by its title.
 * `open` is the list of open Issues the labels run already read, so finding it costs no call. A project with no milestones gets no Issue.
 */
async function syncProgressIssue({ adapter, config, ctx, open, dry }) {
  if (config.progress_issue === false) return;
  try {
    const { milestones, result } = await readProgress({ adapter, ctx }, open);
    const body = issueBody(result);
    const existing = findProgressIssue(open);
    if (existing) {
      if (sameText(existing.body, body)) return;
      ctx.out(dry ? `Progress: would update Issue #${existing.number}.` : `Progress: updated Issue #${existing.number}.`);
      if (!dry) await adapter.updateIssue(existing.number, { body });
      return;
    }
    if (!milestones.length) return;
    if (dry) return void ctx.out('Progress: would create the «Huddle progress» Issue.');
    const created = await adapter.createIssue({ title: TITLE, body });
    ctx.out(`Progress: created Issue #${created.number}.`);
    try {
      await adapter.pinIssue(created);
    } catch (e) {
      ctx.out(`Progress: Issue #${created.number} created, but not pinned: ${firstLine(e)}`);
    }
  } catch (e) {
    ctx.out(`Progress not updated: ${firstLine(e)}`);
  }
}

async function progress({ args, adapter, ctx }) {
  const { result } = await readProgress({ adapter, ctx }, await adapter.listOpenIssues());
  ctx.out(args.includes('--json') ? JSON.stringify(result, null, 2) : tableText(result));
  return 0;
}

// --- review requests -------------------------------------------------------------------------------------------------------------------

/** Everything about one Issue: its state, its PRs/MRs, every comment on them, and the AI Manager's pending requests. */
async function gather({ adapter, config }, issue) {
  const [state, reviews] = await Promise.all([adapter.issueState(issue), adapter.reviewsClosing(issue)]);
  // `on`: the Issue or PR/MR a comment was read from, which the adapter needs to mark it (markTaken).
  const all = (await Promise.all([issue, ...reviews].map(async (n) => (await adapter.comments(n)).map((c) => ({ ...c, on: n }))))).flat();
  // The work moved past a request when a commit is newer than it, or a «Ready for review again» comment is.
  const commits = (await Promise.all(reviews.map((n) => adapter.reviewCommits(n)))).flat();
  const pending = pendingRequests({ manager: config.ai_manager, comments: all, lastWork: lastWorkAt({ commits, comments: all }) });
  return { issue, reviews, pending, done: !state.open };
}

const where = (g) => (g.reviews.length ? `PR #${g.reviews.join(', #')} (Issue #${g.issue})` : `Issue #${g.issue}`);

/** The open Issues of the login of the token that carry a label of a session in progress. */
async function myIssues({ adapter, config }) {
  const rn = renamer(config);
  const watched = new Set(WATCHED.map((k) => rn.names[k]));
  const me = await adapter.me();
  return (await adapter.listOpenIssues())
    .filter((i) => i.assignees.some((a) => same(a, me)) && i.labels.some((l) => watched.has(l)))
    .map((i) => i.number);
}

async function take({ args, ctx, ...rest }) {
  const g = await gather(rest, Number(args[0]));
  if (!g.pending.length) return 0;
  for (const c of g.pending) await rest.adapter.markTaken(c.on, c.id);
  const newest = g.pending.at(-1);
  ctx.out(`Request from the AI Manager on ${where(g)}: ${newest.url}\nIt is now marked 👀. Follow this prompt as if the developer had pasted it:\n\n${promptOf(newest.body)}`);
  return 0;
}

/** The Issue to look at when none is named: the one the open PR/MR of the current branch resolves (inside an Issue's worktree), or null. */
async function issueOfBranch({ adapter }, ctx) {
  const branch = await ctx.currentBranch?.();
  return branch ? adapter.issueForBranch(branch) : null;
}

async function findPending(rest, ctx, arg) {
  const found = [];
  const own = arg ? null : await issueOfBranch(rest, ctx);
  for (const n of arg ? [Number(arg)] : own !== null ? [own] : await myIssues(rest)) {
    const g = await gather(rest, n);
    if (g.pending.length) found.push({ n, where: where(g), url: g.pending.at(-1).url });
  }
  return found;
}

async function pending({ args, ctx, ...rest }) {
  const found = await findPending(rest, ctx, args[0]);
  ctx.out(found.length ? found.map((f) => `${f.where}: ${f.url}`).join('\n') : 'Nothing pending.');
  return 0;
}

async function wait({ args, ctx, ...rest }) {
  const every = Math.max(30, Number(args[1]) || 120) * 1000;
  for (;;) {
    try {
      const g = await gather(rest, Number(args[0]));
      if (g.pending.length) {
        ctx.out(`The AI Manager left a request on ${where(g)}: ${g.pending.at(-1).url}\nRun: huddle take ${args[0]} and follow the prompt it prints.`);
        return 0;
      }
      if (g.done) {
        ctx.out(`Issue #${args[0]} is finished (its PR was merged or the Issue was closed). Nothing more to wait for.`);
        return 0;
      }
    } catch {} // offline or the platform busy: try again on the next round
    await ctx.sleep(every);
  }
}

/** `job` or null: after `ms` milliseconds, or when it fails. The timer never keeps the process alive. */
function within(job, ms) {
  let timer;
  const late = new Promise((resolve) => { timer = setTimeout(() => resolve(null), ms); timer.unref?.(); });
  return Promise.race([job.catch(() => null), late]).finally(() => clearTimeout(timer));
}

/** The one-line progress summary for the session start, or null (no milestones, offline, too slow). Costs the milestone query only. */
const progressLine = ({ adapter, ctx }) => within(readProgress({ adapter, ctx }).then(({ result }) => summaryLine(result)), ctx.hookProgressMs ?? 20000);

async function hook({ ctx, ...rest }) {
  // Both reads run at once; each may fail on its own (offline gives neither, and the hook stays silent).
  const [found, line] = await Promise.all([findPending(rest, ctx).catch(() => []), progressLine({ adapter: rest.adapter, ctx })]);
  if (!found.length) {
    if (line) ctx.out(JSON.stringify({ systemMessage: line }));
    return 0;
  }
  const context = [
    'Huddle: the AI Manager left requests that no session has done yet:',
    ...found.map((f) => `- ${f.where}: ${f.url}`),
    'Before anything else, tell the developer in their language, for example: «There is a comment from the AI Manager on PR #N (Issue #M) that we have not done yet. Do you want me to continue?».',
    'Only if they say yes: run `huddle take <issue>` and follow the prompt it prints. If they pasted that prompt themselves, also run `huddle take <issue>` first so it is marked.',
  ].join('\n');
  // `systemMessage` is what the developer sees; `additionalContext` reaches only Claude, who speaks after the developer types.
  const pendingLine = `Huddle: the AI Manager left ${found.length} request${found.length === 1 ? '' : 's'} not done yet (${found.map((f) => f.where).join('; ')}). Say hello and Claude will ask to continue.`;
  const visible = line ? `${pendingLine}\n${line}` : pendingLine;
  ctx.out(JSON.stringify({ systemMessage: visible, hookSpecificOutput: { hookEventName: 'SessionStart', additionalContext: context } }));
  return 0;
}

// --- doctor ---------------------------------------------------------------------------------------------------------------------------

async function doctor(ctx) {
  const lines = [];
  let failed = false;
  const report = (mark, name, detail) => { lines.push(`${mark} ${name}: ${detail}`); if (mark === '✖') failed = true; };
  const flush = () => { ctx.out(lines.join('\n')); return failed ? 1 : 0; };

  if (ctx.pluginInstalled) report('✔', 'plugin', 'running from an installed plugin');
  else report('⚠', 'plugin', 'not running from an installed plugin. Install it once on this machine, in a terminal: claude plugin marketplace add SrProfessional/Huddle and claude plugin install huddle@huddle, then open a new session');

  let config;
  try {
    config = loadConfig(ctx.root, ctx.readFile);
    report('✔', 'huddle.json', `valid (${config.platform}, ${config.project}${config.host ? ` on ${config.host}` : ''})`);
  } catch (e) {
    report('✖', 'huddle.json', e.message.replaceAll('\n', '; '));
    return flush();
  }
  let adapter;
  try {
    adapter = await ctx.createPlatform(config);
  } catch (e) {
    report('✖', 'adapter', e.message);
    return flush();
  }
  let me;
  try {
    me = await adapter.me();
    report('✔', 'login', `${config.platform === 'gitlab' ? 'glab' : 'gh'} is logged in${config.host ? ` to ${config.host}` : ''} as ${me}`);
  } catch (e) {
    report('✖', 'login', `${config.platform === 'gitlab' ? 'glab' : 'gh'} is not usable: ${String(e.message).split('\n')[0]}`);
  }
  const who = me && !same(me, config.ai_manager) ? `${config.ai_manager} (you are ${me}: a developer session)` : config.ai_manager + (me ? ' (you)' : '');
  try {
    if (await adapter.findUser(config.ai_manager)) report('✔', 'ai_manager', who);
    else report('✖', 'ai_manager', `${config.ai_manager} not found on ${config.platform}${config.host ? ` (${config.host})` : ''}: check "ai_manager" in huddle.json`);
  } catch (e) {
    report('⚠', 'ai_manager', `${who}; not checked: ${String(e.message).split('\n')[0]}`); // a failed lookup (offline) says nothing about the login
  }
  try {
    const have = new Set(await adapter.listLabels());
    const missing = Object.values(labelNames(config)).filter((n) => !have.has(n));
    if (missing.length) report('✖', 'labels', `missing: ${missing.join(', ')} (run: huddle labels)`);
    else report('✔', 'labels', 'all seven exist');
  } catch (e) {
    report('✖', 'labels', String(e.message).split('\n')[0]);
  }
  return flush();
}

// --- entry ----------------------------------------------------------------------------------------------------------------------------

const COMMANDS = { labels, wait, take, pending, progress, hook };
const NEEDS_ISSUE = new Set(['wait', 'take']);

export async function run(argv, ctx) {
  const [name, ...args] = argv;
  if (name === 'doctor') return doctor(ctx);
  const command = COMMANDS[name];
  if (!command || (NEEDS_ISSUE.has(name) && !isNumber(args[0])) || (name === 'pending' && args[0] !== undefined && !isNumber(args[0])) || (name === 'progress' && args.some((a) => a !== '--json'))) {
    ctx.err(USAGE);
    return 2;
  }
  const quiet = name === 'hook'; // never get in the way of a session starting
  try {
    const config = loadConfig(ctx.root, ctx.readFile);
    const adapter = await ctx.createPlatform(config);
    const job = command({ args, config, adapter, ctx });
    if (!quiet) return await job;
    let timer;
    const timeout = new Promise((resolve) => { timer = setTimeout(() => resolve(0), ctx.hookTimeoutMs ?? 45000); });
    // Output is buffered until the job ends, so a timeout never leaves half a JSON behind.
    return await Promise.race([job, timeout]).finally(() => clearTimeout(timer));
  } catch (e) {
    if (quiet) return 0;
    ctx.err(`huddle ${name}: ${e.message}`);
    return 1;
  }
}
