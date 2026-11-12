// Huddle: the commands of `bin/huddle` (docs/design.md §4, §6), all on the platform adapter. Ported from SocialCortex's issue-labels.mjs and review-watch.mjs.
//
// run(argv, ctx) -> exit code. `ctx` is everything that touches the outside, so tests replace it:
//   platform (process.platform, for doctor's install hint), root, readFile(file) -> text|null, createPlatform(config) -> adapter, out(text), err(text), sleep(ms), hookTimeoutMs

import path from 'node:path';
import { assignments, BUG_LABELS, closedCleanup, dependsOn, DESIGN_LABEL, isBlockingBug, LABELS, loadOf, needsTriage, plan, requestLabels, reviewing, statusOf, waitsForDecision } from '../core/issue-status.mjs';
import { waitingFor } from '../core/queue.mjs';
import { lastWorkAt, requestState, pendingRequests, promptOf } from '../core/review-requests.mjs';
import { TITLE, findProgressIssues, issueBody, noAreaCount, progressOf, summaryLine, tableText, windowStart } from '../core/progress.mjs';
import { assignStep, withAssignees } from '../core/team.mjs';
import { areasList, checkOf, checkText, describeMilestone, listText } from '../core/areas.mjs';
import { remainingOf } from '../core/progress.mjs';
import { sessionNotice, skillNotice, versionCheck } from '../core/update.mjs';
import { update as updateRepo } from '../setup/update.mjs';
import { parseWorktrees, planClean } from '../core/worktrees.mjs';
import { labelNames, loadConfig } from './config.mjs';

const USAGE = 'Usage: huddle labels [--dry-run] | wait <issue> [seconds] | take <issue> | pending [issue] | queue [--json] | progress [--json] | areas [list | set <title> --remaining N | assign <issue> <title|none> | check] | team [add <login> [--anyway] | remove <login>] | clean [--dry-run] [--no-fetch] [--quiet] | update [--check] [--dry-run] [--json] [--answer key=value...] | notice [--json] | hook | doctor';
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

/** One run reads the same data once where the adapter can (GitLab: closed_by per Issue); the adapter forgets it when the run ends. */
async function labels(request) {
  request.adapter.beginRun?.();
  try {
    return await labelsRun(request);
  } finally {
    request.adapter.endRun?.();
  }
}

async function labelsRun({ args, config, adapter, ctx }) {
  const dry = args.includes('--dry-run');
  const rn = renamer(config);
  const max = config.max_open_per_person ?? Infinity;
  const open = (await adapter.listOpenIssues()).map((i) => ({ ...i, labels: i.labels.map(rn.toCore), assignees: [...i.assignees] }));
  const openPrs = new Set(await adapter.openReviews());
  const issues = new Map();
  const missing = new Set(); // dependencies that are not an Issue: a PR/MR, a typo, a deleted Issue (Issue #99)
  for (const n of new Set(open.flatMap((i) => dependsOn(i.body) ?? []))) {
    try {
      issues.set(n, await adapter.issueState(n));
    } catch (e) {
      if (!e?.notFound) throw e; // a real failure (login, network, rate limit) still stops the run
      missing.add(n); // left out of `issues`: statusOf reads an unknown number as not merged, so the Issue stays blocked
    }
  }
  for (const it of open) {
    for (const n of dependsOn(it.body) ?? []) if (missing.has(n)) ctx.out(`warning: #${it.number} lists #${n} under «Depends on», which is not an Issue; treating it as not merged yet`);
  }
  const titleOf = (n) => open.find((i) => i.number === n)?.title ?? '';
  let count = 0;

  // 1. Assign what is ready.
  const ready = open.filter((it) => {
    const deps = dependsOn(it.body);
    return deps !== null && !needsTriage(it) && !waitsForDecision(it) && statusOf({ deps, assigned: it.assignees.length > 0, issues }).label === LABELS.ready.name;
  });
  for (const { number, to } of assignments({ ready: ready.map((it) => ({ number: it.number, blocking: isBlockingBug(it) })), team: config.assignees, load: loadOf(open, openPrs), max })) {
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
    const comments = (await Promise.all([adapter.comments(it.number), ...it.reviews.map((n) => adapter.comments(n, { review: true }))])).flat();
    const commits = (await Promise.all(it.reviews.map((n) => adapter.reviewCommits(n)))).flat();
    requests.set(it.number, requestState({ manager: config.ai_manager, comments, commits }));
  }

  // 3. Status labels.
  const changes = plan({ open, issues, openPrs, requests });
  const wanted = [...Object.keys(LABELS).map((k) => ({ ...LABELS[k], name: rn.names[k] })), DESIGN_LABEL, ...Object.values(BUG_LABELS)];
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

// --- queue ------------------------------------------------------------------------------------------------------------------------------

/** `huddle queue [--json]` (docs/design.md §19): what waits for the AI Manager. Read-only. Null when the arguments are not valid. */
const queueRequest = (args) => (args.length === 0 || (args.length === 1 && args[0] === '--json') ? { json: args.length === 1 } : null);

async function queue({ args, config, adapter, ctx }) {
  const rn = renamer(config);
  const open = (await adapter.listOpenIssues()).map((i) => ({ ...i, labels: i.labels.map(rn.toCore) }));
  const openPrs = new Set(await adapter.openReviews());
  // The request state only matters for an Issue that could wait for a decision or a review: read the comments of those alone.
  const requests = new Map();
  for (const it of open.filter((i) => !needsTriage(i) && (waitsForDecision(i) || (dependsOn(i.body) !== null && reviewing(i, openPrs))))) {
    const comments = (await Promise.all([adapter.comments(it.number), ...it.reviews.map((n) => adapter.comments(n, { review: true }))])).flat();
    const commits = (await Promise.all(it.reviews.map((n) => adapter.reviewCommits(n)))).flat();
    requests.set(it.number, requestState({ manager: config.ai_manager, comments, commits }));
  }
  const waiting = waitingFor({ open, openPrs, requests });
  // The head commit sha tells a new push from an old commit. Best effort: one PR/MR that cannot be read has `head: null` and one line on stderr.
  for (const w of waiting.filter((x) => x.waits === 'review')) {
    try {
      w.head = await adapter.reviewHead(w.pr);
    } catch (e) {
      w.head = null;
      ctx.err(`huddle queue: could not read the head of ${reviewRef(config, w.pr)} (Issue #${w.issue}): ${firstLine(e)}`);
    }
  }
  if (queueRequest(args).json) {
    ctx.out(JSON.stringify({ waiting }, null, 2));
    return 0;
  }
  if (!waiting.length) {
    ctx.out('Nothing is waiting for the AI Manager.');
    return 0;
  }
  const lines = waiting.map((w) => `  #${w.issue}  ${w.waits.padEnd(10)}${(w.pr ? reviewRef(config, w.pr) : '').padEnd(8)} ${w.title}`);
  ctx.out(['Waiting for the AI Manager:', ...lines].join('\n'));
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
 * Keeps the «Huddle progress» Issue (docs/design.md §12): creates it once, rewrites it when its text changes, and heals duplicates on every run.
 * It is the Issue whose body starts with the marker and whose title is «Huddle progress» (isProgressIssue); anything else is never touched.
 * It is looked up with `findIssuesByTitle`, which reads the database: the list of open Issues the labels run already has comes from GitHub search,
 * which indexes a new Issue late, so a job and a local run a few seconds apart would each create one (0.3.0 smoke test).
 * More than one: the oldest stays, the others get «Duplicate of #N» and are closed (as not planned on GitHub). A project with no milestones gets no Issue.
 */
async function syncProgressIssue({ adapter, config, ctx, open, dry }) {
  if (config.progress_issue === false) return;
  try {
    const { milestones, result } = await readProgress({ adapter, ctx }, open);
    const body = issueBody(result);
    const [existing, ...duplicates] = findProgressIssues(await adapter.findIssuesByTitle(TITLE));
    for (const dup of duplicates) await closeDuplicate({ adapter, ctx, dry, dup, keep: existing });
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

/** Closes a duplicate progress Issue: closed first, then commented, so a comment never repeats on a later run. A failure is one line, not the end of the run. */
async function closeDuplicate({ adapter, ctx, dry, dup, keep }) {
  ctx.out(`Progress: Issue #${dup.number} duplicates #${keep.number}: ${dry ? 'would close it' : 'closing it'}.`);
  if (dry) return;
  try {
    await adapter.closeIssue(dup.number, { reason: 'not planned' });
    await adapter.postComment(dup.number, `Duplicate of #${keep.number}`);
  } catch (e) {
    ctx.out(`Progress: could not close #${dup.number}: ${firstLine(e)}`);
  }
}

async function progress({ args, adapter, ctx }) {
  const { result } = await readProgress({ adapter, ctx }, await adapter.listOpenIssues());
  ctx.out(args.includes('--json') ? JSON.stringify(result, null, 2) : tableText(result));
  return 0;
}

// --- areas ------------------------------------------------------------------------------------------------------------------------------
// The mechanics of /huddle-areas (Issue #42). The judgment is the skill's; every write prints what it will change first, and --dry-run stops there.

/** What `huddle areas ...` asks for, or null when the arguments do not fit (the caller prints the usage). */
function areasRequest(args) {
  const [sub, ...rest] = args;
  const flags = { json: false, dry: false, remaining: undefined, description: undefined };
  const positional = [];
  for (let i = 0; i < rest.length; i++) {
    const a = rest[i];
    if (a === '--json' && (sub === 'list' || sub === 'check')) flags.json = true;
    else if (a === '--dry-run' && (sub === 'set' || sub === 'assign')) flags.dry = true;
    else if (a === '--remaining' && sub === 'set' && flags.remaining === undefined && rest[i + 1] !== undefined) flags.remaining = rest[++i];
    else if (a === '--description' && sub === 'set' && flags.description === undefined && rest[i + 1] !== undefined) flags.description = rest[++i];
    else if (a.startsWith('--')) return null;
    else positional.push(a);
  }
  if (sub === 'list' || sub === 'check') return positional.length ? null : { sub, json: flags.json };
  if (sub === 'set') {
    const [title, ...extra] = positional;
    const clean = title?.trim();
    if (!clean || extra.length || /[\r\n]/.test(clean) || clean.toLowerCase() === 'none' || !/^\d+$/.test(flags.remaining ?? '')) return null;
    return { sub, title: clean, remaining: Number(flags.remaining), description: flags.description, dry: flags.dry };
  }
  if (sub === 'assign') {
    const [issue, title, ...extra] = positional;
    if (!isNumber(issue) || !title?.trim() || extra.length) return null;
    return { sub, issue: Number(issue), title: title.trim(), dry: flags.dry };
  }
  return null;
}

const indent = (text, pad) => text.split(/\r?\n/).map((l) => `${pad}${l}`.trimEnd()).join('\n');
const nothingWritten = 'Dry run: nothing was changed.';
const areaOrNone = (title) => (title ? `«${title}»` : 'no area');

async function areasRead({ adapter, ctx }) {
  const [milestones, openIssues, closedIssues] = await Promise.all([
    adapter.listMilestones({ since: windowStart(ctx.now?.() ?? new Date()) }), adapter.listOpenIssues(), adapter.listClosedIssues(),
  ]);
  return areasList({ milestones, openIssues, closedIssues });
}

async function areasSet({ req, adapter, ctx }) {
  const existing = await adapter.findMilestone(req.title);
  const title = existing?.title ?? req.title;
  const description = describeMilestone({ existing: existing?.description ?? null, remaining: req.remaining, purpose: req.description });
  if (existing && description === existing.description) {
    ctx.out(`Milestone «${title}» already says Huddle remaining: ${req.remaining}. Nothing to change.`);
    return 0;
  }
  const verb = existing ? 'update' : 'create';
  ctx.out(`${req.dry ? 'Would' : 'Will'} ${verb} milestone «${title}»:`);
  if (existing) {
    const before = remainingOf(existing.description);
    ctx.out(`  remaining: ${before.missing ? '(none)' : before.remaining} → ${req.remaining}`);
    if (existing.state === 'closed') ctx.out('  the milestone is closed and stays closed');
  }
  ctx.out(`  description:\n${indent(description, '    ')}`);
  if (req.dry) return void ctx.out(nothingWritten) ?? 0;
  if (existing) await adapter.updateMilestone(title, { description });
  else await adapter.createMilestone({ title, description });
  ctx.out('Done.');
  return 0;
}

async function areasAssign({ req, adapter, ctx }) {
  const none = req.title.toLowerCase() === 'none';
  const [open, closed] = await Promise.all([adapter.listOpenIssues(), adapter.listClosedIssues()]);
  const issue = [...open, ...closed].find((i) => i.number === req.issue);
  if (!issue) throw new Error(`Issue #${req.issue} not found among the open and closed Issues`);
  let target = null;
  if (!none) {
    const found = await adapter.findMilestone(req.title);
    if (!found) throw new Error(`no area «${req.title}». Create it first: huddle areas set "${req.title}" --remaining N`);
    target = found.title;
  }
  const now = issue.milestone ?? null;
  if (now === target) {
    ctx.out(target ? `Issue #${issue.number} is already in area «${target}». Nothing to change.` : `Issue #${issue.number} has no area. Nothing to change.`);
    return 0;
  }
  const will = req.dry ? 'Would' : 'Will';
  ctx.out(target ? `${will} put Issue #${issue.number} in area «${target}» (now: ${areaOrNone(now)}).` : `${will} take Issue #${issue.number} out of area «${now}».`);
  if (req.dry) return void ctx.out(nothingWritten) ?? 0;
  const done = await adapter.setIssueMilestone(issue.number, target);
  if (done?.reopened) ctx.out(`Milestone «${target}» was closed: reopened it, assigned the Issue and closed it again.`);
  ctx.out('Done.');
  return 0;
}

async function areas({ args, adapter, ctx }) {
  const req = areasRequest(args);
  if (req.sub === 'set') return areasSet({ req, adapter, ctx });
  if (req.sub === 'assign') return areasAssign({ req, adapter, ctx });
  const list = await areasRead({ adapter, ctx });
  if (req.sub === 'list') ctx.out(req.json ? JSON.stringify(list, null, 2) : listText(list));
  else {
    const check = checkOf(list);
    ctx.out(req.json ? JSON.stringify(check, null, 2) : checkText(check));
  }
  return 0;
}

// --- team ------------------------------------------------------------------------------------------------------------------------------

const LOGIN = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

/** What `huddle team ...` asks for, or null when the arguments do not fit (the caller prints the usage). */
function teamRequest(args) {
  const [sub, login, ...flags] = args;
  if (sub === undefined) return {};
  if (sub === 'add' && LOGIN.test(login ?? '') && flags.every((f) => f === '--anyway') && flags.length <= 1) return { sub, login, anyway: flags.length === 1 };
  if (sub === 'remove' && LOGIN.test(login ?? '') && !flags.length) return { sub, login };
  return null;
}

/** Whether `login` exists on the platform and whether Huddle could assign an Issue to them. One call when they can, two when not. */
async function inspectLogin(adapter, login) {
  const assignable = await adapter.canAssign(login);
  return { assignable, exists: assignable || (await adapter.findUser(login)) };
}

const tick = (ok) => (ok ? '✔' : '✖');

async function teamList({ config, ctx }) {
  const adapter = await ctx.createPlatform(config);
  const rows = [{ login: config.ai_manager, role: 'AI Manager' }];
  for (const login of config.assignees) {
    const row = rows.find((r) => same(r.login, login));
    if (row) row.role += ', assignee';
    else rows.push({ login, role: 'assignee' });
  }
  const checked = await Promise.all(rows.map(async (r) => ({ ...r, ...(await inspectLogin(adapter, r.login)) })));
  const [w1, w2] = [Math.max(...checked.map((r) => r.login.length)), Math.max(...checked.map((r) => r.role.length))];
  ctx.out(`Team of ${config.project} (${config.platform}${config.host ? ` on ${config.host}` : ''})`);
  for (const r of checked) ctx.out(`${r.login.padEnd(w1)}  ${r.role.padEnd(w2)}  exists ${tick(r.exists)}  can be assigned ${tick(r.assignable)}`);
  for (const r of checked.filter((x) => !x.assignable)) ctx.out(`  ${r.login}: ${assignStep(config, r.login, r.exists)}`);
  return 0;
}

async function teamAdd({ login, anyway, config, ctx }) {
  if (config.assignees.some((a) => same(a, login))) {
    ctx.out(`${login} is already in assignees. Nothing changed.`);
    return 0;
  }
  const { assignable, exists } = await inspectLogin(await ctx.createPlatform(config), login);
  if (!assignable) {
    ctx.out(`${login} cannot be assigned: ${exists ? 'not a collaborator (GitHub) or a member with the role Developer or higher (GitLab) of this project' : 'there is no such user'}.`);
    ctx.out(assignStep(config, login, exists));
    if (!anyway) {
      ctx.out('huddle.json was not changed. Do the step, then run this again. To write the file now anyway, add --anyway.');
      return 1;
    }
    ctx.out(`--anyway: writing the file although ${login} cannot be assigned yet. Their Issues stay ready until the step above is done.`);
  }
  save(ctx, [...config.assignees, login]);
  ctx.out(`Added ${login} to assignees in huddle.json. Merge the change through a PR/MR (the skill huddle-team does it).`);
  return 0;
}

function teamRemove({ login, config, ctx }) {
  if (!config.assignees.some((a) => same(a, login))) {
    ctx.out(`${login} is not in assignees. Nothing changed.`);
    return 0;
  }
  save(ctx, config.assignees.filter((a) => !same(a, login)));
  ctx.out(`Removed ${login} from assignees in huddle.json. Open Issues already assigned to them keep that assignee. Merge the change through a PR/MR.`);
  return 0;
}

/** Writes huddle.json with the new assignees; nothing else in the text changes. */
function save(ctx, assignees) {
  const file = path.join(ctx.root, 'huddle.json');
  ctx.writeFile(file, withAssignees(ctx.readFile(file), assignees));
}

async function team({ args, config, ctx }) {
  const req = teamRequest(args);
  if (req.sub === 'add') return teamAdd({ ...req, config, ctx });
  if (req.sub === 'remove') return teamRemove({ ...req, config, ctx });
  return teamList({ config, ctx });
}

/** The doctor check: ⚠ for each assignee who cannot be assigned, with the step. A failed lookup (offline) is one ⚠, never a verdict on a person. */
async function teamCheck(adapter, config, report) {
  if (!config.assignees.length) return report('⚠', 'team', 'no assignees in huddle.json, so no Issue can be assigned. Add someone: huddle team add <login>');
  const results = await Promise.all(config.assignees.map((login) => inspectLogin(adapter, login).then((r) => ({ login, ...r }), (e) => ({ login, error: firstLine(e) }))));
  const failed = results.filter((r) => r.error);
  const cannot = results.filter((r) => !r.error && !r.assignable);
  for (const r of cannot) report('⚠', 'team', `${r.login} cannot be assigned, so their Issues stay ready. ${assignStep(config, r.login, r.exists)}`);
  if (failed.length) report('⚠', 'team', `not checked (${failed.map((r) => r.login).join(', ')}): ${failed[0].error}`);
  if (!cannot.length && !failed.length) report('✔', 'team', `all ${results.length} assignee${results.length === 1 ? '' : 's'} can be assigned`);
}

// --- clean ----------------------------------------------------------------------------------------------------------------------------
// docs/design.md §16. Needs only git: ctx.git(args, { cwd, timeoutMs }) -> stdout (throws when git fails), ctx.rm(dir), ctx.touchedAt(worktree) -> ms | null,
// ctx.realpath(path), ctx.cwd, ctx.platform, ctx.now().

/** What `huddle clean ...` asks for, or null when the arguments do not fit (the caller prints the usage). */
function cleanRequest(args) {
  const known = { '--dry-run': 'dry', '--no-fetch': 'noFetch', '--quiet': 'quiet' };
  const req = { dry: false, noFetch: false, quiet: false };
  for (const a of args) {
    if (!known[a]) return null;
    req[known[a]] = true;
  }
  return req;
}

/** The flags of `update` (docs/design.md §17): { check, dry, json, answers: { key: value } }, or null when one is unknown or an --answer is not key=value. */
function updateRequest(args) {
  const req = { check: false, dry: false, json: false, answers: {} };
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--check') req.check = true;
    else if (a === '--dry-run') req.dry = true;
    else if (a === '--json') req.json = true;
    else if (a === '--answer') {
      const pair = args[++i] ?? '';
      const at = pair.indexOf('=');
      if (at < 1) return null;
      const raw = pair.slice(at + 1);
      let value = raw;
      try { value = JSON.parse(raw); } catch { /* not JSON: it is text */ }
      req.answers[pair.slice(0, at)] = value;
    } else return null;
  }
  return req;
}

const section = (title, items) => (items.length ? [`${title}:`, ...items.map((i) => `  - ${i}`)] : []);
const versionText = (v) => v ?? 'an older version';

/** `huddle update`: only files, no platform, no login (§17). Exit 0; 3 when a question must be answered or `--check` finds a change; an error is thrown (exit 1). */
function updateCommand({ args, ctx }) {
  const req = updateRequest(args);
  const r = updateRepo(ctx.root, { answers: req.answers, check: req.check, dryRun: req.dry, registry: ctx.questions });
  const code = r.status === 'questions' || (r.status === 'would-change' && req.check) ? 3 : 0;
  if (req.json) { ctx.out(JSON.stringify(r, null, 2)); return code; }
  const lines = [];
  if (r.status === 'questions') {
    lines.push(`${r.pendingQuestions.length} question(s) to answer before updating. Nothing was changed.`);
    for (const q of r.pendingQuestions) {
      lines.push(`  - ${q.key}: ${q.ask}${q.options ? ` [${q.options.join(' | ')}]` : ''}${q.default !== null ? ` (default: ${JSON.stringify(q.default)})` : ''}`);
    }
    lines.push('Run again with --answer key=value for each of them.');
  } else if (r.status === 'up-to-date') {
    lines.push(`Huddle is up to date: this repo is set up for ${versionText(r.setupVersion)}, installed is ${r.installed}. Nothing to refresh.`);
  } else {
    const done = r.status === 'updated';
    lines.push(done ? `Huddle updated this repo for ${r.installed} (it was set up for ${versionText(r.setupVersion)}).` : `Would update this repo for ${r.installed} (it is set up for ${versionText(r.setupVersion)}). Nothing was changed.`);
    lines.push(...section(done ? 'Changed' : 'Would change', r.changed), ...section('Kept as they were', r.skipped), ...r.notes);
    if (done) lines.push('Commit it on a branch and open a PR/MR.');
  }
  ctx.out(lines.join('\n'));
  return code;
}

/** The ref finished work is merged into: origin/<default_branch>, else what origin/HEAD points at, else origin/master. null when none exists. */
function baseRef(git, config) {
  const exists = (ref) => { try { git(['rev-parse', '--verify', '--quiet', `${ref}^{commit}`]); return true; } catch { return false; } };
  const head = (() => { try { return git(['symbolic-ref', '--short', 'refs/remotes/origin/HEAD']).trim(); } catch { return null; } })();
  return [`origin/${config.default_branch}`, head, 'origin/master'].find((ref) => ref && exists(ref)) ?? null;
}

async function clean({ args, config, ctx }) {
  const req = cleanRequest(args);
  const say = req.quiet ? () => {} : ctx.out;
  const cwd = ctx.cwd ?? ctx.root;
  const git = (a, opts = {}) => ctx.git(a, { cwd, ...opts });
  const worktrees = parseWorktrees(git(['worktree', 'list', '--porcelain']));
  // A merge on the platform is only visible after a fetch. Offline is not an error: it judges with what it has.
  if (!req.noFetch) { try { git(['fetch', 'origin', '--quiet'], { timeoutMs: 20000 }); } catch { /* judge with what is here */ } }
  const base = baseRef(git, config);
  const results = planClean({
    worktrees, cwd, platform: ctx.platform ?? process.platform, canonical: ctx.realpath, baseFound: base !== null, now: Number(ctx.now()),
    touchedAt: (p) => ctx.touchedAt(p),
    isClean: (p) => { try { return git(['status', '--porcelain'], { cwd: p }).trim() === ''; } catch { return false; } },
    isMerged: (head) => { try { git(['merge-base', '--is-ancestor', head, base]); return true; } catch { return false; } },
  });
  let removed = 0;
  for (const r of results) {
    if (!r.remove) { say(`kept ${r.path}: ${r.reason}`); continue; }
    if (req.dry) { say(`would remove ${r.path}`); removed += 1; continue; }
    try {
      await ctx.rm(path.join(r.path, 'node_modules')); // the heavy part, with retries for Windows file locks; git then has little left to delete
      git(['worktree', 'remove', r.path]); // never --force: git itself refuses an unclean worktree
      say(`removed ${r.path}`);
      removed += 1;
    } catch (e) {
      say(`kept ${r.path}: could not remove: ${firstLine(e)}`);
    }
  }
  if (removed && !req.dry) { try { git(['worktree', 'prune']); } catch { /* the next run prunes */ } }
  const kept = results.length - removed;
  say(req.dry ? `${removed} would be removed, ${kept} kept (dry run: nothing was changed).` : `${removed} removed, ${kept} kept.`);
  return 0;
}

// --- review requests -------------------------------------------------------------------------------------------------------------------

/** Everything about one Issue: its state, its PRs/MRs, every comment on them, and the AI Manager's pending requests. */
async function gather({ adapter, config }, issue) {
  const [state, reviews] = await Promise.all([adapter.issueState(issue), adapter.reviewsClosing(issue)]);
  // `on` and `review`: the Issue or PR/MR a comment was read from, which the adapter needs to mark it (markTaken). On GitLab an MR number is not an Issue number.
  const from = (n, review) => async () => (await adapter.comments(n, { review })).map((c) => ({ ...c, on: n, review }));
  const all = (await Promise.all([from(issue, false), ...reviews.map((n) => from(n, true))].map((f) => f()))).flat();
  // The work moved past a request when a commit is newer than it, or a «Ready for review again» comment is.
  const commits = (await Promise.all(reviews.map((n) => adapter.reviewCommits(n)))).flat();
  const pending = pendingRequests({ manager: config.ai_manager, comments: all, lastWork: lastWorkAt({ commits, comments: all }) });
  return { issue, reviews, pending, done: !state.open };
}

// What each platform calls a review: «PR #2» on GitHub, «MR !2» on GitLab.
const reviewWord = (config) => (config.platform === 'gitlab' ? { one: 'MR', mark: '!' } : { one: 'PR', mark: '#' });
const reviewRef = (config, n) => `${reviewWord(config).one} ${reviewWord(config).mark}${n}`;
const where = (g, config) => (g.reviews.length ? `${g.reviews.map((n) => reviewRef(config, n)).join(', ')} (Issue #${g.issue})` : `Issue #${g.issue}`);

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
  for (const c of g.pending) await rest.adapter.markTaken(c.on, c.id, { review: c.review });
  const newest = g.pending.at(-1);
  ctx.out(`Request from the AI Manager on ${where(g, rest.config)}: ${newest.url}\nIt is now marked 👀. Follow this prompt as if the developer had pasted it:\n\n${promptOf(newest.body)}`);
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
    if (g.pending.length) found.push({ n, where: where(g, rest.config), url: g.pending.at(-1).url });
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
        ctx.out(`The AI Manager left a request on ${where(g, rest.config)}:${g.pending.at(-1).url}\nRun: huddle take ${args[0]} and follow the prompt it prints.`);
        return 0;
      }
      if (g.done) {
        ctx.out(`Issue #${args[0]} is finished (its ${reviewWord(rest.config).one} was merged or the Issue was closed). Nothing more to wait for.`);
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
  // Finished worktrees (docs/design.md §16) are removed by a process of its own, first of all: it must never delay this hook or be lost to its timeout.
  if (rest.config.clean_worktrees !== false) { try { ctx.startClean?.(); } catch { /* a worktree left for the next session is no reason to break this one */ } }
  // Both reads run at once; each may fail on its own (offline gives neither, and the hook stays silent).
  const isManager = async () => same(await rest.adapter.me(), rest.config.ai_manager);
  const [found, progress, notice] = await Promise.all([findPending(rest, ctx).catch(() => []), progressLine({ adapter: rest.adapter, ctx }), sessionNotice(ctx, isManager).catch(() => null)]);
  const line = [progress, notice?.visible].filter(Boolean).join('\n') || null;
  if (!found.length) {
    if (line) ctx.out(JSON.stringify({ systemMessage: line, ...(notice && { hookSpecificOutput: { hookEventName: 'SessionStart', additionalContext: notice.context } }) }));
    return 0;
  }
  const context = [
    'Huddle: the AI Manager left requests that no session has done yet:',
    ...found.map((f) => `- ${f.where}: ${f.url}`),
    `Before anything else, tell the developer in their language, for example: «There is a comment from the AI Manager on ${reviewWord(rest.config).one} ${reviewWord(rest.config).mark}N (Issue #M) that we have not done yet. Do you want me to continue?».`,
    'Only if they say yes: run `huddle take <issue>` and follow the prompt it prints. If they pasted that prompt themselves, also run `huddle take <issue>` first so it is marked.',
    notice?.context,
  ].filter(Boolean).join('\n');
  // `systemMessage` is what the developer sees; `additionalContext` reaches only Claude, who speaks after the developer types.
  const pendingLine = `Huddle: the AI Manager left ${found.length} request${found.length === 1 ? '' : 's'} not done yet (${found.map((f) => f.where).join('; ')}). Say hello and Claude will ask to continue.`;
  const visible = line ? `${pendingLine}\n${line}` : pendingLine;
  ctx.out(JSON.stringify({ systemMessage: visible, hookSpecificOutput: { hookEventName: 'SessionStart', additionalContext: context } }));
  return 0;
}

// --- notice -----------------------------------------------------------------------------------------------------------------------------

const noticeRequest = (args) => (args.length === 0 || (args.length === 1 && args[0] === '--json') ? { json: args.length === 1 } : null);

/** `huddle notice [--json]` (docs/design.md §20): the update notice for a skill to say. Read-only, no login; always exit 0. */
async function notice({ args, ctx }) {
  // Whether the person is the AI Manager needs the config and a login; without either, they are a developer.
  const isManager = async () => {
    const config = loadConfig(ctx.root, ctx.readFile);
    return same(await (await ctx.createPlatform(config)).me(), config.ai_manager);
  };
  const r = await skillNotice(ctx, isManager);
  if (noticeRequest(args).json) ctx.out(JSON.stringify(r));
  else if (r.show) ctx.out(r.text);
  return 0;
}

// --- doctor ---------------------------------------------------------------------------------------------------------------------------

// The same ids as docs/pdf/src/first-day.section.html.
const INSTALL = {
  gh: { win32: 'winget install --id GitHub.cli', darwin: 'brew install gh', page: 'https://github.com/cli/cli#installation' },
  glab: { win32: 'winget install --id GLab.GLab', darwin: 'brew install glab', page: 'https://gitlab.com/gitlab-org/cli#installation' },
};
const RELOAD_PATH = "$env:Path = [Environment]::GetEnvironmentVariable('Path','Machine') + ';' + [Environment]::GetEnvironmentVariable('Path','User')";
const AUTH_FAILURE = /auth login|not logged in|authenticat|unauthori[sz]ed|\b401\b|no token|bad credentials/i;

/** The detail of the ✖ login line: «not installed» (the runner's error has code ENOENT), «not logged in», or any other failure as it was. */
function loginFailure(e, cli, config, os) {
  if (e?.code === 'ENOENT') {
    const install = INSTALL[cli][os] ?? INSTALL[cli].page;
    const windows = os === 'win32' ? `. After installing, open a new terminal, or reload the PATH in PowerShell: ${RELOAD_PATH}` : '';
    return `${cli} is not installed or not on the PATH of this terminal. Install it: ${install}${windows}`;
  }
  const first = String(e?.message).split('\n')[0];
  if (AUTH_FAILURE.test(String(e?.message))) return `${cli} is not logged in. Log in: ${cli} auth login${config.host ? ` --hostname ${config.host}` : ''}`;
  return `${cli} is not usable: ${first}`;
}

/** The doctor's `setup` line (§17): where this repo stands against the installed Huddle. Reads files only; no line when the repo cannot be read. */
function setupLine(ctx, report) {
  let s;
  try { s = ctx.setupStatus?.(ctx.root); } catch { s = null; }
  if (!s) return;
  const was = s.setupVersion ? s.setupVersion : 'an older version';
  if (s.state === 'current') report('✔', 'setup', `set up for ${s.setupVersion} (up to date)`);
  else if (s.state === 'version-only') report('✔', 'setup', `set up for ${was}, Huddle is ${s.installed}; nothing to refresh (the next /huddle-update only writes the version)`);
  else report('⚠', 'setup', `set up for ${was}, Huddle is ${s.installed}: run /huddle-update`);
}

async function doctor(ctx) {
  const lines = [];
  let failed = false;
  const report = (mark, name, detail) => { lines.push(`${mark} ${name}: ${detail}`); if (mark === '✖') failed = true; };
  const flush = () => { ctx.out(lines.join('\n')); return failed ? 1 : 0; };

  if (ctx.pluginInstalled) report('✔', 'plugin', 'running from an installed plugin');
  else report('⚠', 'plugin', 'not running from an installed plugin. Install it once on this machine. In a terminal with the claude command: claude plugin marketplace add SrProfessional/Huddle and claude plugin install huddle@huddle. In the VS Code extension: type /plugins and install huddle for this project. Then type /reload-plugins in the open session (restart Claude Code if the skills do not show up)');

  const version = await versionCheck(ctx).catch(() => ({ mark: '⚠', detail: 'could not check the latest release' }));
  report(version.mark, 'version', version.detail);

  let config;
  try {
    config = loadConfig(ctx.root, ctx.readFile);
    report('✔', 'huddle.json', `valid (${config.platform}, ${config.project}${config.host ? ` on ${config.host}` : ''})`);
  } catch (e) {
    report('✖', 'huddle.json', e.message.replaceAll('\n', '; '));
    return flush();
  }
  setupLine(ctx, report);
  let adapter;
  try {
    adapter = await ctx.createPlatform(config);
  } catch (e) {
    report('✖', 'adapter', e.message);
    return flush();
  }
  let me;
  const cli = config.platform === 'gitlab' ? 'glab' : 'gh';
  try {
    me = await adapter.me();
    report('✔', 'login', `${cli} is logged in${config.host ? ` to ${config.host}` : ''} as ${me}`);
  } catch (e) {
    report('✖', 'login', loginFailure(e, cli, config, ctx.platform ?? process.platform));
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
  await teamCheck(adapter, config, report);
  return flush();
}

// --- entry ----------------------------------------------------------------------------------------------------------------------------

const COMMANDS = { labels, wait, take, pending, queue, progress, areas, team, clean, update: updateCommand, notice, hook };
const NEEDS_ISSUE = new Set(['wait', 'take']);

export async function run(argv, ctx) {
  const [name, ...args] = argv;
  if (name === 'doctor') return doctor(ctx);
  const command = COMMANDS[name];
  if (!command || (NEEDS_ISSUE.has(name) && !isNumber(args[0])) || (name === 'pending' && args[0] !== undefined && !isNumber(args[0])) || (name === 'queue' && queueRequest(args) === null) || (name === 'progress' && args.some((a) => a !== '--json')) || (name === 'areas' && areasRequest(args) === null) || (name === 'team' && teamRequest(args) === null) || (name === 'clean' && cleanRequest(args) === null) || (name === 'update' && updateRequest(args) === null) || (name === 'notice' && noticeRequest(args) === null)) {
    ctx.err(USAGE);
    return 2;
  }
  const timed = name === 'hook'; // never get in the way of a session starting
  const quiet = timed || (name === 'clean' && args.includes('--quiet')); // the hook's clean process runs alone: it says nothing and fails silently
  try {
    if (name === 'notice') return await notice({ args, ctx }); // no config and no login needed
    if (name === 'update') return updateCommand({ args, ctx }); // files only: it has its own error for a missing huddle.json
    const config = loadConfig(ctx.root, ctx.readFile);
    const adapter = name === 'team' || name === 'clean' ? undefined : await ctx.createPlatform(config); // `team` asks for its own: add and remove of a known name need none; `clean` only needs git
    const job = command({ args, config, adapter, ctx });
    if (!timed) return await job;
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
