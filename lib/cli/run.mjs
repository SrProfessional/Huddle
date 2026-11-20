// Huddle: the commands of `bin/huddle` (docs/design.md §4, §6), all on the platform adapter. Ported from SocialCortex's issue-labels.mjs and review-watch.mjs.
//
// run(argv, ctx) -> exit code. `ctx` is everything that touches the outside, so tests replace it:
//   platform (process.platform, for doctor's install hint), root, readFile(file) -> text|null, createPlatform(config) -> adapter, out(text), err(text), sleep(ms), hookTimeoutMs

import path from 'node:path';
import { createHash } from 'node:crypto';
import { realpathSync } from 'node:fs';
import { assignments, BUG_LABELS, closedCleanup, dependsOn, DESIGN_LABEL, isBlockingBug, LABELS, loadOf, needsTriage, plan, requestLabels, reviewing, statusOf, TESTED_LABEL, testedCleanup, waitsForDecision } from '../core/issue-status.mjs';
import { TESTED_COMMENT, releaseWarnings, stagedIssues, strayCommits, testedState, unreleasedPrs } from '../core/staging.mjs';
import { waitingFor } from '../core/queue.mjs';
import { effortOf, suggestEffort } from '../core/effort.mjs';
import { schedule } from '../core/schedule.mjs';
import { lastWorkAt, requestState, pendingRequests, promptOf } from '../core/review-requests.mjs';
import { TITLE, findProgressIssues, issueBody, noAreaCount, progressOf, summaryLine, tableText, windowStart } from '../core/progress.mjs';
import { assignStep, withAssignees } from '../core/team.mjs';
import { areasList, checkOf, checkText, describeMilestone, listText } from '../core/areas.mjs';
import { remainingOf } from '../core/progress.mjs';
import { sessionNotice, skillNotice, versionCheck } from '../core/update.mjs';
import { update as updateRepo } from '../setup/update.mjs';
import { parseWorktrees, planClean } from '../core/worktrees.mjs';
import { closesIn } from '../core/closes.mjs';
import { labelNames, loadConfig } from './config.mjs';

const USAGE = 'Usage: huddle labels [--dry-run] [--no-assign] | labels --issue <n> [--started | --needs-decision] [--dry-run] | wait <issue> [seconds] | take <issue> | pending [issue] | queue [--json] | queue --wait [seconds] [--seen <keys>] | queue --wait-off | queue --always | progress [--json] | areas [list | set <title> --remaining N | assign <issue> <title|none> | check] | team [add <login> [--anyway] | remove <login>] | land <pr> [--check] | tested <issue> | release [--json] | release open [--untested <n> --reason "<why>"] | clean [--dry-run] [--no-fetch] [--quiet] | update [--check] [--dry-run] [--json] [--answer key=value...] | notice [--json] | hook | doctor | effort <issue> | effort --suggest <file> | next [--json] | capacity [<points> | reset] | status [--json] | language [<language> | --clear]';
const WATCHED = ['progress', 'review', 'changes', 'decision'];
const isNumber = (s) => /^\d+$/.test(String(s ?? ''));
const same = (a, b) => String(a).toLowerCase() === String(b).toLowerCase();

/** Translates between the names in huddle.json and the default names the core knows. */
/** Default label names of older releases, read as today's (Issue #166: the role «AI Manager» became «Coach»). The full labels run renames them once. */
const OLD_LABELS = { changes: 'changes requested from AI Manager' };

function renamer(config) {
  const names = labelNames(config);
  const toCore = new Map(Object.keys(LABELS).map((k) => [names[k], LABELS[k].name]));
  for (const [k, old] of Object.entries(OLD_LABELS)) if (!config.labels?.[k] && !toCore.has(old)) toCore.set(old, LABELS[k].name);
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

/**
 * `huddle labels --issue <n> [--dry-run]` asks for one Issue (docs/design.md §22). The number of --issue, or null for the full run; false when the arguments do not fit.
 * The flag and its value are both required: «--issue» alone, «--issue abc» and «--issue 0» are a bad argument, never a full run.
 */
function labelsRequest(args) {
  const rest = [...args];
  for (const flag of ['--dry-run', '--no-assign']) {
    const at = rest.indexOf(flag);
    if (at >= 0) rest.splice(at, 1);
  }
  // Issue #153: the session's own label, added and recomputed in the same run. Only with --issue, and only one of the two.
  const adds = [['--started', 'progress'], ['--needs-decision', 'decision']].filter(([flag]) => rest.includes(flag));
  for (const [flag] of adds) rest.splice(rest.indexOf(flag), 1);
  if (adds.length > 1) return null;
  const add = adds.length ? adds[0][1] : null;
  if (rest.length === 0) return add ? null : { issue: null, add: null };
  if (rest.length === 2 && rest[0] === '--issue' && isNumber(rest[1]) && Number(rest[1]) > 0) return { issue: Number(rest[1]), add };
  return null;
}

async function labelsRun({ args, config, adapter, ctx }) {
  const dry = args.includes('--dry-run');
  const { issue: only, add: own } = labelsRequest(args); // the Issue of --issue, or null: the whole repo; `own`: the session's label to add (Issue #153)
  const rn = renamer(config);
  const max = config.max_open_per_person ?? Infinity;
  const issues = new Map();
  // Scoped run: is n an Issue, and open or closed? A number that is not an Issue ends the run with one line (the adapters flag it `notFound`, Issue #99).
  let nState = null;
  if (only !== null) {
    try {
      nState = await adapter.issueState(only);
    } catch (e) {
      if (!e?.notFound) throw e;
      throw new Error(`#${only} is not an Issue (a PR/MR number, a typo or a deleted Issue); nothing changed`);
    }
    issues.set(only, nState);
  }
  const all = (await adapter.listOpenIssues()).map((i) => ({ ...i, labels: i.labels.map(rn.toCore), assignees: [...i.assignees] }));
  // `all` is every open Issue (it is what the load of each person is counted on); `open` is what this run reads and changes: the whole list, or the scope.
  // The scope of an open n is n alone; of a closed n, the open Issues that list #n under «Depends on».
  const open = only === null ? all : nState.open ? all.filter((i) => i.number === only) : all.filter((i) => (dependsOn(i.body) ?? []).includes(only));
  if (only !== null && nState.open) {
    if (!open.length) { ctx.out(`#${only} is open but not in the list of open Issues yet; nothing changed`); return 0; }
    if (dependsOn(open[0].body) === null) { ctx.out(`#${only} has no «Depends on» section: not managed by Huddle, nothing changed`); return 0; }
  }
  if (own && !nState.open) { ctx.out(`#${only} is closed: nothing changed`); return 0; }
  // The session's label goes on first, so the plan below sees it and takes off what no longer fits («assigned», or «in progress» for a question).
  const ownLabel = own ? LABELS[own].name : null;
  let ownAdded = false;
  if (ownLabel && !open[0].labels.includes(ownLabel)) {
    if (!dry) await adapter.setLabels(only, [rn.toConfig(ownLabel)], []);
    open[0].labels.push(ownLabel);
    ownAdded = true;
  }
  const openPrs = new Set(await adapter.openReviews());
  const missing = new Set(); // dependencies that are not an Issue: a PR/MR, a typo, a deleted Issue (Issue #99)
  for (const n of new Set(open.flatMap((i) => dependsOn(i.body) ?? []))) {
    if (issues.has(n)) continue;
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

  // With a staging branch an Issue is done when its PR is merged there, and `huddle land` closes it (docs/design.md §21). Here it only warns: an Issue
  // reopened after a failed test in staging must stay open, so this job never closes one.
  // Only the full run: a scoped run (`--issue`, §22) reads its scope and makes no extra call, and `mergedReviews` would be one.
  if (config.staging_branch && only === null) {
    const landed = new Map(); // Issue number -> the newest merged staging PR that closes it
    for (const pr of await adapter.mergedReviews(config.staging_branch)) for (const n of closesIn(pr.body, config.project)) if (!landed.has(n)) landed.set(n, pr.number);
    for (const it of open) {
      if (landed.has(it.number)) ctx.out(`warning: #${it.number} is open but PR #${landed.get(it.number)}, merged into ${config.staging_branch}, closes it: run huddle land ${landed.get(it.number)}, or it was reopened on purpose`);
    }
  }

  // 1. Assign what is ready. A scoped run assigns only when n is closed (an open n never assigns), and only when the caller is the Coach.
  // `--no-assign` (the session-start pass) never assigns: only the Coach's session assigns, so two sessions cannot give one Issue to two people.
  let mayAssign = !args.includes('--no-assign') && (only === null || !nState.open);
  if (only !== null && mayAssign && !same(await adapter.me(), config.ai_manager)) {
    mayAssign = false;
    ctx.out('assignment skipped: only the Coach assigns');
  }
  const ready = !mayAssign ? [] : open.filter((it) => {
    const deps = dependsOn(it.body);
    return deps !== null && !needsTriage(it) && !waitsForDecision(it) && statusOf({ deps, assigned: it.assignees.length > 0, issues }).label === LABELS.ready.name;
  });
  for (const { number, to } of assignments({ ready: ready.map((it) => ({ number: it.number, blocking: isBlockingBug(it) })), team: config.assignees, load: loadOf(all, openPrs), max })) {
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

  // 2. Where the Coach's requests stand on each managed open Issue (requestState), from the comments of the Issue and its PRs/MRs and their commits.
  // Read before the status labels: a pending request takes «in review» off.
  const requests = new Map();
  for (const it of open.filter((i) => dependsOn(i.body) !== null)) {
    const comments = (await Promise.all([adapter.comments(it.number), ...it.reviews.map((n) => adapter.comments(n, { review: true }))])).flat();
    const commits = (await Promise.all(it.reviews.map((n) => adapter.reviewCommits(n)))).flat();
    requests.set(it.number, requestState({ manager: config.ai_manager, comments, commits }));
  }

  // 3. Status labels.
  const changes = plan({ open, issues, openPrs, requests });
  // A scoped run never creates labels: the full run does, and `huddle doctor` reports a missing one.
  const wanted = [...Object.keys(LABELS).map((k) => ({ ...LABELS[k], name: rn.names[k] })), DESIGN_LABEL, ...Object.values(BUG_LABELS), ...(config.staging_branch ? [TESTED_LABEL] : [])];
  const existing = only === null ? new Set(await adapter.listLabels()) : null;
  // Issue #166: an older default name (not one the project set under `labels`) is renamed once, before the labels are created, so the Issues
  // that carry it keep it under today's name and no second label appears.
  for (const [k, old] of Object.entries(only === null ? OLD_LABELS : {})) {
    if (config.labels?.[k] || !existing.has(old) || existing.has(LABELS[k].name)) continue;
    ctx.out(`${old} → ${LABELS[k].name}${dry ? ' (dry run)' : ''}`);
    if (!dry) await adapter.renameLabel(old, LABELS[k].name);
    existing.delete(old);
    existing.add(LABELS[k].name);
  }
  const created = existing ? wanted.filter((l) => !existing.has(l.name)).length : 0;
  if (!dry && existing) await adapter.ensureLabels(wanted);
  // Each line says what goes on and what comes off (Issue #153: «(keeps its label)» hid a removal). The session's own label shows on its Issue's line.
  const line = (n, add, remove, waiting = []) => `#${n}${add ? ` → ${rn.toConfig(add)}` : ''}${remove.length ? ` − ${remove.map(rn.toConfig).join(', ')}` : ''}${waiting.length ? ` (waits for ${waiting.map((w) => `#${w}`).join(', ')})` : ''}  ${titleOf(n)}`;
  if (ownAdded && !changes.some((c) => c.number === only)) { ctx.out(line(only, ownLabel, [])); count += 1; }
  for (const c of changes) {
    ctx.out(line(c.number, c.add ?? (ownAdded && c.number === only ? ownLabel : null), c.remove, c.waiting));
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

  // 4b. With a staging branch, an open Issue is not tested: reopened means not tested (docs/design.md §21). The gate reads dates, so this is only the label catching up.
  if (config.staging_branch) {
    for (const n of testedCleanup(open)) {
      ctx.out(`#${n} loses ${TESTED_LABEL.name} (it is open again)  ${titleOf(n)}`);
      if (!dry) await adapter.setLabels(n, [], [TESTED_LABEL.name]);
      count += 1;
    }
  }

  // 5. A closed Issue keeps no Huddle label (closing one used to leave «in review» or «needs decision» on it forever).
  // A scoped run cleans n alone, and only when it is closed: it reads the labels of n, not the list of every closed Issue.
  const closed = only === null ? (await adapter.listClosedIssues()).map((i) => ({ ...i, labels: i.labels.map(rn.toCore) })) : nState.open ? [] : [{ number: only, labels: (await adapter.issueLabels(only)).map(rn.toCore) }];
  for (const c of closedCleanup(closed)) {
    const remove = c.remove.map(rn.toConfig);
    ctx.out(`#${c.number} (closed) loses ${remove.join(', ')}`);
    if (!dry) await adapter.setLabels(c.number, [], remove);
    count += 1;
  }
  if (only === null) ctx.out(dry ? `${created} label${created === 1 ? '' : 's'} would be created (dry run).` : `${created} label${created === 1 ? '' : 's'} created.`);
  ctx.out(`${count} label change(s)${dry ? ' (dry run: nothing was changed)' : ''}.`);
  // The session-start pass leaves its count for the next hook or notice (docs/design.md §22); a failed write only loses one line.
  if (ctx.labelsCountFile && count > 0 && !dry) { try { ctx.writeFile(ctx.labelsCountFile, String(count)); } catch { /* the labels are right: only the line is lost */ } }

  // 6. Progress by area, after the labels and best effort: whatever fails here, the labels above are already done.
  // A scoped run updates it only when n is closed: a merge changes the percentages, a start or a review does not. It counts on every open Issue.
  if (only === null || !nState.open) await syncProgressIssue({ adapter, config, ctx, open: all, dry });
  return 0;
}

// --- land ----------------------------------------------------------------------------------------------------------------------------
// docs/design.md §21. With a staging branch an Issue is done when its PR/MR is merged there, and the platforms only close an Issue when a PR merges into the
// default branch, so the Coach's session closes it with this command, right after the merge.

/** `land <pr> [--check]`: { pr, check }, or null when the arguments do not fit. */
function landRequest(args) {
  const [pr, ...rest] = args;
  if (!isNumber(pr) || rest.length > 1 || (rest.length === 1 && rest[0] !== '--check')) return null;
  return { pr: Number(pr), check: rest.length === 1 };
}

async function land({ args, config, adapter, ctx }) {
  const { pr, check } = landRequest(args);
  const staging = config.staging_branch;
  const refuse = (text) => { ctx.err(text); return 1; };
  if (!staging) return refuse('no staging branch is set: nothing to land');
  if (!same(await adapter.me(), config.ai_manager)) return refuse('only the Coach lands a PR');
  let info;
  try {
    info = await adapter.reviewInfo(pr);
  } catch (e) {
    if (e?.notFound) return refuse(`${reviewRef(config, pr)} not found`);
    throw e;
  }
  const names = closesIn(info.body, config.project);
  // A PR still open is fine for --check; a real land needs it merged.
  if (info.base !== staging) return refuse(check ? `${reviewRef(config, pr)} does not target ${staging} (it targets ${info.base})` : `${reviewRef(config, pr)} targets ${info.base}, not ${staging}`);
  if (!check && !info.merged) return refuse(`${reviewRef(config, pr)} is not merged`);
  if (!names.length) return refuse(`${reviewRef(config, pr)} has no closing keyword (Closes #N) in its body: it closes no Issue`);
  const states = new Map();
  for (const n of names) {
    try {
      states.set(n, await adapter.issueState(n));
    } catch (e) {
      if (e?.notFound) return refuse(`#${n} is not an Issue (${reviewRef(config, pr)} names it)`);
      throw e;
    }
  }
  if (check) {
    ctx.out(`ok: ${reviewRef(config, pr)} (base ${staging}) closes ${names.map((n) => `#${n}`).join(', ')}`);
    return 0;
  }
  for (const n of names) {
    if (!states.get(n).open) ctx.out(`#${n} was already closed`); // idempotent; never reopens
    else { await adapter.closeIssue(n, { reason: 'completed' }); ctx.out(`closed #${n}`); }
    // A PR landed for this Issue: whatever was tested before it is not what is in staging now (docs/design.md §21). Only the label goes; the dates already decide.
    if ((await adapter.issueLabels(n)).includes(TESTED_LABEL.name)) {
      await adapter.setLabels(n, [], [TESTED_LABEL.name]);
      ctx.out(`#${n} loses ${TESTED_LABEL.name}`);
    }
  }
  return 0;
}

// --- tested and release ----------------------------------------------------------------------------------------------------------------
// docs/design.md §21 (H49). The marker is a comment by the Coach (or a `testers` login) newer than the last staging merge of the Issue; the label only shows it.
// What is in staging and not yet released is computed from git and the merged PRs/MRs, never stored.

const noStaging = (ctx) => { ctx.err('no staging branch is set: nothing to test or release (set "staging_branch" in huddle.json)'); return 1; };
const STAGED_LIMIT = 100; // the merged PRs/MRs into staging that are read; more than that in one release is a sign to release more often

/** `release [--json]` | `release open [--untested <n> --reason "<why>"]...`, or null when the arguments do not fit. */
function releaseRequest(args) {
  if (!args.length) return { open: false, json: false };
  if (args.length === 1 && args[0] === '--json') return { open: false, json: true };
  if (args[0] !== 'open') return null;
  const untested = [];
  for (let i = 1; i < args.length; i += 2) {
    if (args[i] === '--untested' && isNumber(args[i + 1])) untested.push({ issue: Number(args[i + 1]), reason: null });
    else if (args[i] === '--reason' && args[i + 1] !== undefined && untested.length) untested.at(-1).reason = args[i + 1];
    else return null;
  }
  return { open: true, untested };
}

/** The first line of what git printed, or null when git failed: a ref that is not there is «unknown», never a crash. */
const tryGit = (ctx, args) => { try { return ctx.git(args, { cwd: ctx.cwd ?? ctx.root, timeoutMs: 30000 }); } catch { return null; } };

/** Everything `release` and `release open` need: the staged Issues with their test state, and the two warnings. */
async function stagedReport({ config, adapter, ctx }) {
  const staging = config.staging_branch;
  const base = config.default_branch ?? 'main';
  tryGit(ctx, ['fetch', 'origin', '--quiet']); // best effort: judge with what is here when offline
  const released = (sha) => tryGit(ctx, ['merge-base', '--is-ancestor', sha, `origin/${base}`]) !== null;
  const prs = unreleasedPrs(await adapter.mergedReviews(staging, { limit: STAGED_LIMIT }), released);
  const staged = stagedIssues(prs, config.project);
  const testers = config.testers ?? [];
  const issues = [];
  for (const s of staged) {
    const comments = await adapter.comments(s.issue);
    const t = testedState({ comments, landedAt: s.mergedAt, aiManager: config.ai_manager, testers });
    issues.push({ issue: s.issue, pr: s.pr, tested: t.tested, by: t.by, at: t.at });
  }
  const untested = issues.filter((i) => !i.tested).map((i) => i.issue);
  const newestTest = issues.reduce((a, i) => (i.at && (a === null || Date.parse(i.at) > Date.parse(a)) ? i.at : a), null);
  const log = tryGit(ctx, ['log', '--first-parent', '--format=%H %cI', `origin/${staging}`, `^origin/${base}`]) ?? '';
  const commits = log.split('\n').map((l) => l.trim().split(' ')).filter((p) => p[0]).map(([sha, at]) => ({ sha, at }));
  // The release PR is a merge commit, so main always holds merge commits that staging lacks: only commits that are not merges are a hotfix.
  const count = Number.parseInt(tryGit(ctx, ['rev-list', '--no-merges', '--count', `origin/${base}`, `^origin/${staging}`]) ?? '0', 10) || 0;
  const warnings = releaseWarnings({ stray: strayCommits({ commits, prs, since: newestTest }), defaultAhead: count > 0, staging, defaultBranch: base });
  return { staging, base, issues, untested, warnings };
}

async function tested({ args, config, adapter, ctx }) {
  const n = Number(args[0]);
  const refuse = (text) => { ctx.err(text); return 1; };
  if (!config.staging_branch) return noStaging(ctx);
  if (!same(await adapter.me(), config.ai_manager)) return refuse('only the Coach marks an Issue as tested');
  let state;
  try {
    state = await adapter.issueState(n);
  } catch (e) {
    if (e?.notFound) return refuse(`#${n} is not an Issue`);
    throw e;
  }
  if (state.open) return refuse(`#${n} is open: it has not landed in staging yet (huddle land <pr> closes it when its PR is merged there)`);
  const landed = (await adapter.mergedReviews(config.staging_branch, { limit: STAGED_LIMIT })).some((p) => closesIn(p.body, config.project).includes(n));
  if (!landed) return refuse(`no PR merged into ${config.staging_branch} closes #${n}: there is nothing in staging to test for it`);
  await adapter.postComment(n, TESTED_COMMENT);
  await adapter.ensureLabels([TESTED_LABEL]);
  await adapter.setLabels(n, [TESTED_LABEL.name], []);
  ctx.out(`#${n} marked as tested in staging`);
  return 0;
}

const line = (config, i) => `#${i.issue} (${reviewRef(config, i.pr)}): ${i.tested ? `tested by ${i.by}, ${i.at}` : 'NOT tested'}`;

async function release({ args, config, adapter, ctx }) {
  const req = releaseRequest(args);
  const refuse = (text) => { ctx.err(text); return 1; };
  if (!config.staging_branch) return noStaging(ctx);
  if (req.open && !same(await adapter.me(), config.ai_manager)) return refuse('only the Coach opens the release');
  const report = await stagedReport({ config, adapter, ctx });
  if (!req.open) {
    if (req.json) { ctx.out(JSON.stringify({ staging: report.staging, default: report.base, issues: report.issues, untested: report.untested, warnings: report.warnings })); return 0; }
    if (!report.issues.length) ctx.out(`nothing in staging to release: every PR merged into ${report.staging} is already in ${report.base}`);
    for (const i of report.issues) ctx.out(line(config, i));
    if (report.issues.length) ctx.out(report.untested.length ? `${report.untested.length} untested: ${report.untested.map((n) => `#${n}`).join(', ')}` : 'every staged Issue was tested in staging');
    for (const w of report.warnings) ctx.out(`warning: ${w.message}`);
    return 0;
  }
  // release open: the gate. Reads dates and comments only, never the label.
  if (!report.issues.length) return refuse(`nothing in staging to release: every PR merged into ${report.staging} is already in ${report.base}`);
  const ahead = report.warnings.find((w) => w.code === 'default-ahead');
  if (ahead) return refuse(`${ahead.message}. Nothing was opened.`);
  const through = new Map();
  for (const u of req.untested) {
    if (!u.reason || !u.reason.trim()) return refuse(`--untested needs a --reason for #${u.issue}: why does it go to production untested?`);
    if (closesIn(u.reason, config.project).length) return refuse(`the reason for #${u.issue} must not hold a closing keyword followed by a number: it would close an Issue twice`);
    if (!report.untested.includes(u.issue)) return refuse(`#${u.issue} is not an untested staged Issue`);
    through.set(u.issue, u.reason.trim().replace(/\s*\n\s*/g, ' '));
  }
  const blocking = report.untested.filter((n) => !through.has(n));
  if (blocking.length) return refuse(`${blocking.map((n) => `#${n} was not tested in staging`).join('; ')}. Test it and run huddle tested <n>, or let one through with --untested <n> --reason "<why>". Nothing was opened.`);
  const body = [
    `Release of ${report.staging} to ${report.base}. Merge it with a **merge commit**, never squash or rebase: the list of what is released is read from the merge commits.`,
    '',
    '## Issues in this release',
    ...report.issues.map((i) => (through.has(i.issue) ? `- #${i.issue} (${reviewRef(config, i.pr)}): NOT tested in staging, released on the Coach's word: ${through.get(i.issue)}` : `- #${i.issue} (${reviewRef(config, i.pr)}): tested in staging by ${i.by}`)),
    '',
    'The Issues are already closed (huddle land), so this PR names them without closing anything.',
  ].join('\n');
  const made = await adapter.openReview({ base: report.base, head: report.staging, title: `Release ${report.staging} to ${report.base}: ${report.issues.map((i) => `#${i.issue}`).join(', ')}`, body });
  ctx.out(`opened ${reviewRef(config, made.number)}: ${made.url}`);
  for (const w of report.warnings) ctx.out(`warning: ${w.message}`);
  return 0;
}

// --- heartbeat (Issue #181) ---------------------------------------------------------------------------------------------------------
// The watch and the waits write the time of each round next to the update cache, so any terminal can tell whether they are alive.

const nowMs = (ctx) => Number(ctx.now?.() ?? Date.now());
/** «always» for this repo: the mark under its id, else the one the old code left under the raw root's id (Issue #185). */
function readAlways(ctx) {
  const files = labelsFiles(ctx);
  const now = ctx.readFile(files.watchAlways);
  if (now !== null && now !== undefined) return now === '1';
  return (files.legacy ?? []).some((old) => ctx.readFile(old.watchAlways) === '1');
}
function readJson(ctx, file) {
  try { const v = JSON.parse(ctx.readFile(file) ?? ''); return v && typeof v === 'object' ? v : null; } catch { return null; }
}
/** The watch's heartbeat (Issue #181). Issue #191: written after a good round; a failing round keeps the last good time and records the error. */
function beatWatch(ctx, every, error = null) {
  try {
    const file = labelsFiles(ctx).watchBeat;
    const old = readJson(ctx, file) ?? {};
    const next = error ? { at: old.at ?? null, every, lastError: error, errorAt: nowMs(ctx) } : { at: nowMs(ctx), every };
    ctx.writeFile(file, JSON.stringify(next));
  } catch { /* a lost beat only reads as late */ }
}
function beatWait(ctx, issue, every, error = null) {
  try {
    const file = labelsFiles(ctx).waitBeats;
    const all = readJson(ctx, file) ?? {};
    if (every === null) delete all[issue];
    else all[issue] = error ? { at: all[issue]?.at ?? null, every, lastError: error, errorAt: nowMs(ctx) } : { at: nowMs(ctx), every };
    ctx.writeFile(file, JSON.stringify(all));
  } catch { /* a lost beat only reads as late */ }
}
/** «2 minutes ago», «1 hour ago». */
function ago(ms) {
  const sec = Math.max(0, Math.round(ms / 1000));
  const [n, unit] = sec < 60 ? [sec, 'second'] : sec < 3600 ? [Math.round(sec / 60), 'minute'] : sec < 86400 ? [Math.round(sec / 3600), 'hour'] : [Math.round(sec / 86400), 'day'];
  return `${n} ${unit}${n === 1 ? '' : 's'} ago`;
}
/** A heartbeat is fresh while it is younger than twice its interval plus a minute. */
const fresh = (beat, now) => now - beat.at <= 2 * beat.every * 1000 + 60 * 1000;

/** What the heartbeats say: { watch: { state: 'on'|'stale'|'off', ageSeconds, always }, waits: [{ issue, state, ageSeconds }] }. */
function heartbeats(ctx) {
  const now = nowMs(ctx);
  const files = labelsFiles(ctx);
  const w = readJson(ctx, files.watchBeat) ?? (files.legacy ?? []).map((old) => readJson(ctx, old.watchBeat)).find(Boolean) ?? null;
  let always = false;
  try { always = readAlways(ctx); } catch { always = false; }
  const failing = (b) => b && b.lastError && Number(b.errorAt) && (!Number(b.at) || b.errorAt > b.at) && now - b.errorAt <= 2 * b.every * 1000 + 60 * 1000;
  const describe = (b) => (failing(b)
    ? { state: 'failing', ageSeconds: Number(b.at) ? Math.round((now - b.at) / 1000) : null, error: b.lastError, errorSeconds: Math.round((now - b.errorAt) / 1000) }
    : Number(b?.at) ? { state: fresh(b, now) ? 'on' : 'stale', ageSeconds: Math.round((now - b.at) / 1000) } : null);
  const owner = readJson(ctx, files.watchOwner);
  const watch = { ...(describe(w) ?? { state: 'off', ageSeconds: null }), always, ...(owner?.tool && { tool: owner.tool }) };
  const waits = Object.entries(readJson(ctx, files.waitBeats) ?? (files.legacy ?? []).map((old) => readJson(ctx, old.waitBeats)).find(Boolean) ?? {})
    .map(([issue, b]) => ({ issue: Number(issue), ...describe(b) }))
    .filter((x) => x.state)
    .sort((a, b) => a.issue - b.issue);
  return { watch, waits };
}

/** The lines of `huddle status` and `huddle doctor`: [{ mark, name, detail }]. */
function heartbeatLines(ctx) {
  const { watch, waits } = heartbeats(ctx);
  const lines = [];
  const alwaysNote = watch.always ? ' («always» is set: it starts in each of the Coach\'s sessions here)' : '';
  if (watch.state === 'on') lines.push({ mark: '✔', name: 'watch', detail: `on, ${watch.tool ? `in ${TOOL_NAME[watch.tool] ?? watch.tool}, ` : ''}last check ${ago(watch.ageSeconds * 1000)}${alwaysNote}` });
  else if (watch.state === 'stale') lines.push({ mark: '⚠', name: 'watch', detail: `last check ${ago(watch.ageSeconds * 1000)}: the session that ran it is closed or stopped: run /huddle-watch${alwaysNote}` });
  else if (watch.state === 'failing') lines.push({ mark: '⚠', name: 'watch', detail: `last round failed ${ago(watch.errorSeconds * 1000)}: ${watch.error}${watch.ageSeconds === null ? '' : `; last good check ${ago(watch.ageSeconds * 1000)}`}${alwaysNote}` });
  else lines.push({ mark: '✔', name: 'watch', detail: `off${alwaysNote}` });
  const on = waits.filter((w) => w.state === 'on');
  if (on.length) lines.push({ mark: '✔', name: 'waiting', detail: on.map((w) => `#${w.issue}, last check ${ago(w.ageSeconds * 1000)}`).join('; ') });
  for (const w of waits.filter((x) => x.state === 'failing')) {
    lines.push({ mark: '⚠', name: 'waiting', detail: `#${w.issue}: last round failed ${ago(w.errorSeconds * 1000)}: ${w.error}${w.ageSeconds === null ? '' : `; last good check ${ago(w.ageSeconds * 1000)}`}` });
  }
  for (const w of waits.filter((x) => x.state === 'stale')) {
    lines.push({ mark: '⚠', name: 'waiting', detail: `#${w.issue}: last check ${ago(w.ageSeconds * 1000)}: the session that waited is closed or stopped: run /huddle-play ${w.issue}` });
  }
  return lines;
}

const statusRequest = (args) => (args.length === 0 || (args.length === 1 && args[0] === '--json') ? { json: args.length === 1 } : null);

/** `huddle status [--json]` (Issue #181): whether the watch and the waits are alive, from their heartbeats. No network, no login. */
function status({ args, ctx }) {
  if (statusRequest(args).json) { ctx.out(JSON.stringify(heartbeats(ctx), null, 2)); return 0; }
  ctx.out(heartbeatLines(ctx).map((l) => `${l.mark} ${l.name}: ${l.detail}`).join('\n'));
  return 0;
}

// --- queue ------------------------------------------------------------------------------------------------------------------------------

/**
 * `huddle queue [--json]` (docs/design.md §19): what waits for the Coach. Read-only. Null when the arguments are not valid.
 * Issue #157: `--wait [seconds] [--seen <keys>]` waits in the background until something new waits (120 to 3600 s, default 300), and
 * `--wait-off` stops a waiting loop of this repo at its next round.
 */
function queueRequest(all) {
  // Issue #212, OpenAI Codex: `--codex` starts the watch as a process of its own; that process gets `--codex-thread <id>`.
  const at = all.indexOf('--codex-thread');
  const thread = at >= 0 ? all[at + 1] : null;
  if (at >= 0 && !thread) return null;
  const codex = all.includes('--codex');
  const args = all.filter((a, i) => a !== '--codex' && (at < 0 || (i !== at && i !== at + 1)));
  if ((codex || thread) && args[0] !== '--wait') return null;
  const r = queueRequestPlain(args);
  return r && (codex || thread) ? { ...r, codex, thread } : r;
}

function queueRequestPlain(args) {
  if (args.length === 0 || (args.length === 1 && args[0] === '--json')) return { json: args.length === 1 };
  if (args.length === 1 && args[0] === '--wait-off') return { waitOff: true };
  if (args.length === 1 && args[0] === '--always') return { always: true }; // Issue #160: keep the watch on in this repo, on this machine
  if (args[0] !== '--wait') return null;
  const rest = args.slice(1);
  let seconds = 300;
  if (rest.length && rest[0] !== '--seen') {
    if (!isNumber(rest[0]) || Number(rest[0]) < 120 || Number(rest[0]) > 3600) return null;
    seconds = Number(rest.shift());
  }
  let seen = [];
  if (rest.length) {
    if (rest[0] !== '--seen' || rest.length !== 2 || !rest[1]) return null;
    seen = rest[1].split(',').map((s) => s.trim()).filter(Boolean);
  }
  return { wait: seconds, seen: new Set(seen) };
}

/** The key that tells an item from the same item seen before: a PR/MR at one head commit, or the Issue of a decision or a triage. */
const seenKey = (w) => (w.waits === 'review' ? `${w.pr}@${w.head}` : `#${w.issue}`);

/** What waits for the Coach (design §19), without the head commits: `queue` and the session start (Issue #138) share it. */
async function waitingItems({ config, adapter }) {
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
  // Issue #165: a review carries the effort of its Issue (2 when it has none), so the watch can review within its review capacity.
  const bodies = new Map(open.map((i) => [i.number, i.body]));
  return waitingFor({ open, openPrs, requests }).map((w) => (w.waits === 'review' ? { ...w, effort: effortOf(bodies.get(w.issue)) } : w));
}

/** The queue with the head commit of each review. The head tells a new push from an old commit; one that cannot be read is `null` and one line on stderr. */
async function waitingWithHeads({ config, adapter, ctx }) {
  const waiting = await waitingItems({ config, adapter });
  for (const w of waiting.filter((x) => x.waits === 'review')) {
    try { w.merge = await adapter.reviewMerge(w.pr); } catch { w.merge = 'unknown'; } // Issue #195
    try {
      w.head = await adapter.reviewHead(w.pr);
    } catch (e) {
      w.head = null;
      ctx.err(`huddle queue: could not read the head of ${reviewRef(config, w.pr)} (Issue #${w.issue}): ${firstLine(e)}`);
    }
  }
  return waiting;
}

/** The stop mark of this repo's waiting watch (Issue #157): next to the update cache, never in the repo. '1' stops, '0' is clear. */
const watchStopFile = (ctx) => labelsFiles(ctx).watchStop;

/**
 * `huddle queue --wait` (Issue #157): the Coach's watch as a Node loop, so the session spends no Claude tokens while nothing waits.
 * Each round reads the queue first (seconds) and ends, printing the new items, as soon as one is not in `seen`. Only a round where nothing
 * new waits runs the full labels pass, quietly: on a real project it took 4m46s against 15 s for the queue, and running it first made every
 * wake that much late (found in staging, Issue #157).
 */
/**
 * Issue #195: a PR/MR that no longer merges cleanly needs its branch updated before any review, so the watch asks for it itself, with no
 * Claude tokens: the usual «🔁 Changes requested» comment with a «Prompt for Claude Code» block, on the PR/MR and on its Issue, then the labels.
 */
async function askToUpdate({ w, config, adapter, ctx }) {
  const base = config.staging_branch || config.default_branch || 'main';
  const ref = reviewRef(config, w.pr);
  const marker = `<!-- huddle: update requested for ${w.head} -->`;
  const body = [
    '## 🔁 Changes requested: update the branch',
    '',
    `${ref} no longer merges cleanly into \`${base}\`, so it is not reviewed yet (Huddle's watch found it, with no review).`,
    '',
    '## Prompt for Claude Code',
    '',
    '```text',
    `First run /huddle-play ${w.issue}: it marks this request as taken (👀), so the Issue shows «in progress».`,
    `Bring in the base branch: git fetch origin, then git merge origin/${base}. Resolve the conflicts, run the tests, push, then comment «Ready for review again» with the counts.`,
    '```',
    '',
    marker,
  ].join('\n');
  try {
    // A restarted watch (a new session with `/huddle-watch always`) forgets what it asked: the marker on the PR/MR remembers it.
    if ((await adapter.comments(w.pr, { review: true })).some((c) => (c.body || '').includes(marker))) return;
    await adapter.postComment(w.pr, body, { review: true });
    await adapter.postComment(w.issue, body, { review: false });
    await labelsRun({ args: ['--issue', String(w.issue)], config, adapter, ctx });
  } catch { /* best effort: with no marker on the PR/MR yet, the next watch that starts asks again */ }
}

async function queueWait({ request, config, adapter, ctx }) {
  if (!same(await adapter.me(), config.ai_manager)) { ctx.out('huddle queue --wait is for the Coach only.'); return 1; }
  // Issue #211: one watch per repo on the machine, whatever the tool: the session that holds it keeps it; another one says so and stops here.
  const elsewhere = watchHeldElsewhere(ctx);
  if (elsewhere) { ctx.out(elsewhere); return 1; }
  const ownerFile = labelsFiles(ctx).watchOwner;
  const claim = (extra = {}) => { try { ctx.writeFile(ownerFile, JSON.stringify({ tool: ctx.session?.tool ?? 'claude', session: ctx.session?.id ?? null, ...extra })); } catch { /* best effort */ } };
  claim();
  const stop = watchStopFile(ctx);
  ctx.writeFile(stop, '0'); // an old mark never stops a new watch
  const quiet = { ...ctx, out: () => {}, labelsCountFile: null };
  const stopped = () => { if (ctx.readFile(stop) !== '1') return false; ctx.writeFile(stop, '0'); ctx.writeFile(labelsFiles(ctx).watchBeat, ''); ctx.writeFile(ownerFile, ''); ctx.out(JSON.stringify({ stopped: true })); return true; };
  // Issue #191: a round starts every interval from the start of the last one (a slow round does not push the next one back), and the full
  // labels pass, which can take minutes on a big project, runs at most every 15 minutes.
  const LABELS_EVERY = 15 * 60 * 1000;
  let lastLabels = null;
  const answered = new Set(); // Issue #195: conflicting PR/MR heads this loop already asked to update
  for (;;) {
    if (stopped()) return 0;
    const started = nowMs(ctx);
    try {
      const all = (await waitingWithHeads({ config, adapter, ctx: quiet })).filter((w) => !request.seen.has(seenKey(w)));
      beatWatch(ctx, request.wait);
      for (const w of all.filter((x) => x.waits === 'review' && x.merge === 'conflicting' && !answered.has(seenKey(x)))) {
        answered.add(seenKey(w));
        await askToUpdate({ w, config, adapter, ctx: quiet });
      }
      const fresh = all.filter((w) => !(w.waits === 'review' && w.merge === 'conflicting'));
      if (fresh.length) {
        claim({ reviewingUntil: nowMs(ctx) + 45 * 60 * 1000 }); // Issue #211: its session reviews now; it keeps the watch meanwhile
        ctx.out(JSON.stringify({ waiting: fresh }, null, 2));
        if (request.thread) { // Issue #212: the watch of a Codex session wakes its chat
          const keys = fresh.map(seenKey).join(',');
          try { ctx.codexQueue?.(request.thread, `Huddle's watch: ${fresh.length} item${fresh.length === 1 ? ' waits' : 's wait'} for the Coach (seen keys: ${keys}). Run $huddle-watch and review them.`); } catch { /* the session start says it too */ }
        }
        return 0;
      }
      if (lastLabels === null || started - lastLabels >= LABELS_EVERY) {
        lastLabels = started;
        try { await labelsRun({ args: [], config, adapter, ctx: quiet }); } catch { /* the labels pass is best effort: the next one tries again */ }
      }
    } catch (e) { beatWatch(ctx, request.wait, String(e?.message ?? e).split('\n')[0].slice(0, 200)); } // offline, rate-limited: it shows in huddle status, and the next round tries again
    if (stopped()) return 0; // the labels pass can take minutes: look again before sleeping
    await ctx.sleep(Math.max(0, request.wait * 1000 - (nowMs(ctx) - started)));
  }
}

async function queue({ args, config, adapter, ctx }) {
  const request = queueRequest(args);
  if (request.waitOff) {
    ctx.writeFile(watchStopFile(ctx), '1');
    for (const fl of [labelsFiles(ctx), ...(labelsFiles(ctx).legacy ?? [])]) ctx.writeFile(fl.watchAlways, '0'); // off also forgets «always» (Issue #160), under the old id too (#185)
    ctx.writeFile(labelsFiles(ctx).watchBeat, ''); // and it is no longer alive (Issue #181)
    ctx.writeFile(labelsFiles(ctx).watchOwner, ''); // and no session holds it (Issue #211)
    ctx.out('The watch stops at its next round, and it will not start again by itself.');
    return 0;
  }
  if (request.always) {
    if (!same(await adapter.me(), config.ai_manager)) { ctx.out('huddle queue --always is for the Coach only.'); return 1; }
    ctx.writeFile(labelsFiles(ctx).watchAlways, '1');
    ctx.out('The watch will start in each of your sessions of this repo on this machine, until /huddle-watch off.');
    return 0;
  }
  if (request.wait && request.codex) {
    // Issue #212: in Codex the agent's command must return; the watch runs as a process of its own and wakes the chat with `codex queue`.
    if (!ctx.codexThread) { ctx.err('huddle queue --wait --codex: no CODEX_THREAD_ID here, so this is not a command of a Codex session. Run it without --codex.'); return 1; }
    if (ctx.codexNoNetwork) { ctx.err('huddle queue --wait --codex: this command runs in the Codex sandbox with no network, so the watch could never reach the platform. Run it again with network access: approve it when Codex asks.'); return 1; }
    const elsewhere = watchHeldElsewhere(ctx);
    if (elsewhere) { ctx.out(elsewhere); return 1; }
    const seen = [...request.seen];
    ctx.startDetached(['queue', '--wait', String(request.wait), ...(seen.length ? ['--seen', seen.join(',')] : []), '--codex-thread', ctx.codexThread]);
    ctx.out('The watch waits in the background, with no tokens: when something waits for the Coach, this Codex session gets a message and goes on.');
    return 0;
  }
  if (request.wait) return queueWait({ request, config, adapter, ctx });
  const waiting = await waitingWithHeads({ config, adapter, ctx });
  if (request.json) {
    ctx.out(JSON.stringify({ waiting }, null, 2));
    return 0;
  }
  if (!waiting.length) {
    ctx.out('Nothing is waiting for the Coach.');
    return 0;
  }
  const lines = waiting.map((w) => `  #${w.issue}  ${w.waits.padEnd(10)}${(w.pr ? reviewRef(config, w.pr) : '').padEnd(8)} ${w.title}`);
  ctx.out(['Waiting for the Coach:', ...lines].join('\n'));
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
  const rows = [{ login: config.ai_manager, role: 'Coach' }];
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
  const r = updateRepo(ctx.root, { answers: req.answers, check: req.check, dryRun: req.dry, registry: ctx.questions, fallback: ctx.configFallback });
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

/**
 * The ref finished work is merged into: origin/<default_branch>, else what origin/HEAD points at, else origin/master. null when none exists.
 * With a staging branch (docs/design.md §21) an Issue's work is finished when it is merged there, so that is the only base: no fallback to the default branch.
 */
function baseRef(git, config) {
  const exists = (ref) => { try { git(['rev-parse', '--verify', '--quiet', `${ref}^{commit}`]); return true; } catch { return false; } };
  if (config.staging_branch) return exists(`origin/${config.staging_branch}`) ? `origin/${config.staging_branch}` : null;
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

/** Everything about one Issue: its state, its PRs/MRs, every comment on them, and the Coach's pending requests. */
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
  ctx.out(`Request from the Coach on ${where(g, rest.config)}: ${newest.url}\nIt is now marked 👀. Follow this prompt as if the Player had pasted it:\n\n${promptOf(newest.body)}`);
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

async function wait({ args: all, ctx, ...rest }) {
  // Issue #201, OpenAI Codex: `--codex` starts this wait as a process of its own (the agent's command returns at once), tagged with the Codex
  // session; that process, `--codex-thread <id>`, queues a message into the session when it ends, and an open Codex chat answers it by itself.
  const flag = all.indexOf('--codex-thread');
  const thread = flag >= 0 ? all[flag + 1] : null;
  const args = all.filter((a, i) => a !== '--codex' && (flag < 0 || (i !== flag && i !== flag + 1)));
  if (all.includes('--codex')) {
    if (!ctx.codexThread) { ctx.err('huddle wait --codex: no CODEX_THREAD_ID here, so this is not a command of a Codex session. Run huddle wait without --codex.'); return 1; }
    // Issue #202: Codex's sandbox may run the command with no network; the wait would then fail every round, unseen. Say so instead.
    if (ctx.codexNoNetwork) { ctx.err('huddle wait --codex: this command runs in the Codex sandbox with no network, so the wait could never reach the platform. Run it again with network access: approve it when Codex asks.'); return 1; }
    ctx.startDetached(['wait', ...args, '--codex-thread', ctx.codexThread]);
    ctx.out(`Issue #${args[0]} waits in the background, with no tokens: when the Coach answers, this Codex session gets a message and goes on.`);
    return 0;
  }
  const tell = (message) => { if (thread) { try { ctx.codexQueue?.(thread, message); } catch { /* the session start says it too */ } } };
  const every = Math.max(30, Number(args[1]) || 120) * 1000;
  for (;;) {
    try {
      const g = await gather(rest, Number(args[0]));
      beatWait(ctx, Number(args[0]), every / 1000);
      if (g.pending.length) {
        ctx.out(`The Coach left a request on ${where(g, rest.config)}:${g.pending.at(-1).url}\nRun: huddle take ${args[0]} and follow the prompt it prints.`);
        tell(`Huddle: the Coach left a request on Issue #${args[0]} (${g.pending.at(-1).url}). Run $huddle-play ${args[0]} and follow it.`);
        return 0;
      }
      if (g.done) {
        beatWait(ctx, Number(args[0]), null);
        ctx.out(`Issue #${args[0]} is finished (its ${reviewWord(rest.config).one} was merged or the Issue was closed). Nothing more to wait for.`);
        tell(`Huddle: Issue #${args[0]} is finished (its ${reviewWord(rest.config).one} was merged or the Issue was closed). Nothing more to do on it; say so in one line.`);
        return 0;
      }
    } catch (e) { beatWait(ctx, Number(args[0]), every / 1000, String(e?.message ?? e).split('\n')[0].slice(0, 200)); } // offline or the platform busy: it shows in huddle status; try again next round
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


// --- the board repairs itself when a session opens (docs/design.md §22) ----------------------------------------------------------------------

const LABELS_EVERY_MS = 10 * 60 * 1000;

/** The small per-repo files next to the update cache: the session-start labels pass ({ stamp, count }) and the watch's stop mark (`watchStop`, Issue #157). */
export function labelsFiles(ctx) {
  // Issue #211: one tool-neutral folder (~/.huddle), so Claude Code and Codex see the same watch; the old one, next to a tool's update cache, still counts.
  const oldDir = path.dirname(ctx.updateCachePath ?? path.join('.', 'huddle-update.json'));
  const dir = ctx.sharedDir ?? oldDir;
  const id = repoId(ctx.root, ctx.platform ?? process.platform);
  const files = filesFor(dir, id);
  // Issue #185: what the old code wrote under the raw root's id still counts (the «always» mark, the heartbeats). It hashed the path as it came,
  // so the same folder may sit under the drive letter in either case.
  const raw = String(ctx.root ?? '');
  const forms = [raw, raw.replace(/^[a-z]:/, (d) => d.toUpperCase()), raw.replace(/^[A-Z]:/, (d) => d.toLowerCase())];
  const oldIds = [...new Set(forms.map((r) => createHash('sha1').update(r).digest('hex').slice(0, 12)))].filter((x) => x !== id);
  const legacy = [...oldIds.map((x) => filesFor(dir, x)), ...(dir !== oldDir ? [id, ...oldIds].map((x) => filesFor(oldDir, x)) : [])];
  return legacy.length ? { ...files, legacy } : files;
}

/** Issue #211: who runs the watch of this repo ({ tool, session, reviewingUntil }), or null. */
function readOwner(ctx) { return readJson(ctx, labelsFiles(ctx).watchOwner); }
const TOOL_NAME = { claude: 'Claude Code', codex: 'Codex' };
/** The line that refuses a second watch, or null when this session may run it: another session holds it while its beat is fresh or it reviews. */
function watchHeldElsewhere(ctx) {
  const owner = readOwner(ctx);
  const me = ctx.session?.id ?? null;
  if (!owner?.session || owner.session === me) return null;
  const now = nowMs(ctx);
  const beat = readJson(ctx, labelsFiles(ctx).watchBeat);
  const alive = beat && Number(beat.at) && fresh(beat, now);
  const reviewing = Number(owner.reviewingUntil) > now;
  if (!alive && !reviewing) return null;
  const age = beat && Number(beat.at) ? ago(now - beat.at) : 'a while ago';
  return `The watch already runs in ${TOOL_NAME[owner.tool] ?? owner.tool} (another session), last check ${age}: this session does not start a second one.`;
}

/**
 * One folder, one id (Issue #185): the hash of the real path (symlinks and 8.3 short names resolved), forward slashes, no trailing slash,
 * lower-cased where the disks are case-insensitive by default (Windows, macOS). VS Code and a terminal can give d:\x or D:\x for one folder.
 */
export function repoId(root, platform = process.platform) {
  let p = String(root ?? '');
  try { p = realpathSync.native(p); } catch { /* not on this disk (tests, a gone folder): the text as it came */ }
  p = p.replace(/\\/g, '/').replace(/\/+$/, '');
  if (platform === 'win32' || platform === 'darwin') p = p.toLowerCase();
  return createHash('sha1').update(p).digest('hex').slice(0, 12);
}

function filesFor(dir, id) {
  return { stamp: path.join(dir, `huddle-labels-${id}.stamp`), count: path.join(dir, `huddle-labels-${id}.count`), watchStop: path.join(dir, `huddle-watch-${id}.stop`), watchAlways: path.join(dir, `huddle-watch-${id}.always`), watchBeat: path.join(dir, `huddle-watch-${id}.beat`), waitBeats: path.join(dir, `huddle-waits-${id}.beat`), capacity: path.join(dir, `huddle-capacity-${id}`), watchOwner: path.join(dir, `huddle-watch-${id}.owner`), codexNoted: path.join(dir, `huddle-codex-${id}.noted`) };
}

/** The «corrected N label(s)» line the last pass left, or null; reading it clears it, so it shows once. Never throws. */
function takeCorrected(ctx) {
  try {
    const { count } = labelsFiles(ctx);
    const text = ctx.readFile(count);
    if (text === null || text === undefined) return null;
    const n = Number(text);
    if (n > 0) ctx.writeFile(count, '0');
    return n > 0 ? `Huddle corrected ${n} label(s): something changed outside a session.` : null;
  } catch {
    return null;
  }
}

/**
 * Starts the labels pass in the background, at most once every 10 minutes per repo and machine. The Coach's pass may assign; every other login gets
 * `--no-assign`. Offline or not logged in: nothing starts and nothing is written. Never throws.
 */
async function startLabelsPass({ config, adapter, ctx }) {
  try {
    if (config.labels_on_start === false || !ctx.startLabels) return;
    const { stamp } = labelsFiles(ctx);
    const now = ctx.now().getTime();
    const age = now - Number(ctx.readFile(stamp));
    if (age >= 0 && age < LABELS_EVERY_MS) return;
    const me = await within(adapter.me(), ctx.hookLabelsMs ?? 3000);
    if (me === null) return; // offline, not logged in, or too slow
    ctx.writeFile(stamp, String(now));
    ctx.startLabels(same(me, config.ai_manager) ? ['labels'] : ['labels', '--no-assign']);
  } catch { /* a board left for the next session is no reason to break this one */ }
}

/**
 * The Coach's start line (Issue #138, design §19): `{ visible, context }`, or null when nothing waits, the login is not the Coach
 * or a read fails. It only informs: the context tells Claude to act on nothing until the person asks.
 */
async function managerStart(rest, isManager) {
  try {
    if (!(await isManager())) return null;
    const waiting = await waitingItems(rest);
    if (!waiting.length) return null;
    const { one, mark } = reviewWord(rest.config);
    const nums = (list, key) => list.map((w) => `${key === 'pr' ? mark : '#'}${w[key]}`).join(', ');
    const part = (kind, single, plural, key = 'issue') => {
      const list = waiting.filter((w) => w.waits === kind);
      return list.length ? `${list.length === 1 ? single : plural} ${nums(list, key)}` : null;
    };
    const parts = [
      part('review', `a ${one} to review`, `${one}s to review`, 'pr'),
      part('decision', 'a decision on', 'decisions on'),
      part('triage', 'a bug report to triage', 'bug reports to triage'),
    ].filter(Boolean);
    const n = waiting.length;
    const what = `Huddle: ${n} thing${n === 1 ? ' waits' : 's wait'} for the Coach: ${parts.join('; ')}.`;
    return {
      visible: `${what} Type /huddle-review <${one.toLowerCase()}>, or /huddle-watch to let this session check by itself.`,
      context: `${what}
Before anything else, tell the Coach this in their language. Review, merge, answer or triage nothing until they ask: this line only informs.`,
    };
  } catch {
    return null; // offline or the platform busy: the start stays as it was
  }
}

// --- language (Issue #209) --------------------------------------------------------------------------------------------------------------------

const LANGUAGE_FROM = {
  personal: 'your own choice: huddle language',
  claude: 'your Claude Code setting: language in ~/.claude/settings.json',
  team: "the team's language, from huddle.json",
  machine: "this machine's language",
};
const readJsonAt = (ctx, file) => { if (!file) return null; try { return JSON.parse(ctx.readFile(file) ?? "null"); } catch { return null; } };
const filled = (v) => (typeof v === 'string' && v.trim() ? v.trim() : null);

/** The language to chat in, first that is set: the person's (`huddle language`, then Claude Code's `language`), the team's, the machine's. */
export function resolveLanguage(ctx, config = {}) {
  const tries = [
    ['personal', filled(readJsonAt(ctx, ctx.languageFile)?.language)],
    ['claude', filled(readJsonAt(ctx, ctx.claudeSettingsPath)?.language)],
    ['team', filled(config?.language)],
    ['machine', filled(ctx.locale)],
  ];
  const hit = tries.find(([, v]) => v);
  return hit ? { language: hit[1], source: hit[0] } : null;
}

async function language({ args, ctx, config }) {
  if (args[0] === '--clear') {
    ctx.writeFile(ctx.languageFile, '{}\n');
    const now = resolveLanguage(ctx, config);
    ctx.out(`Your own language is cleared.${now ? ` Huddle now chats in ${now.language} (${LANGUAGE_FROM[now.source]}).` : ''}`);
    return 0;
  }
  if (args[0]) {
    ctx.writeFile(ctx.languageFile, `${JSON.stringify({ language: args[0] })}\n`);
    ctx.out(`Huddle chats with you in ${args[0]}, in Claude Code and in Codex, on this machine. New sessions take it.`);
    return 0;
  }
  const now = resolveLanguage(ctx, config);
  ctx.out(now ? `Huddle chats with you in ${now.language} (${LANGUAGE_FROM[now.source]}). Change yours with: huddle language <language>` : 'No language is set: Huddle follows the language you write in. Set yours with: huddle language <language>');
  return 0;
}

async function hook({ ctx, ...rest }) {
  // Finished worktrees (docs/design.md §16) are removed by a process of its own, first of all: it must never delay this hook or be lost to its timeout.
  if (rest.config.clean_worktrees !== false) { try { ctx.startClean?.(); } catch { /* a worktree left for the next session is no reason to break this one */ } }
  // The line of the last pass is read before this one starts; the pass itself runs on its own and never delays the hook.
  const corrected = takeCorrected(ctx);
  // Issue #179: an old branch has no Huddle block in CLAUDE.md either, so the session would work without the team's rules: say where they are.
  const hasBlock = (t) => /<!-- huddle:start/.test(String(t ?? ''));
  let gap = null;
  try {
    if (!hasBlock(ctx.readFile(path.join(ctx.root, 'CLAUDE.md'))) && ctx.fileFallback) {
      const there = ctx.fileFallback('CLAUDE.md');
      if (there && hasBlock(there.text)) {
        gap = {
          visible: `Huddle: This branch has no Huddle block in CLAUDE.md; the team's rules are on ${there.ref} (git merge ${there.ref}).`,
          context: `Huddle: this branch has no Huddle block in CLAUDE.md. Before anything else, read the team's rules with \`git show ${there.ref}:CLAUDE.md\` and follow its Huddle block in this session; say so in one line.`,
        };
      }
    }
  } catch { gap = null; }
  // Both reads run at once; each may fail on its own (offline gives neither, and the hook stays silent).
  let managerOnce = null; // the notice and the start line ask the same question: read the login once
  const isManager = () => (managerOnce ??= rest.adapter.me().then((me) => same(me, rest.config.ai_manager)));
  // The labels pass only starts a process of its own and returns: it never waits for the pass.
  const [found, progress, notice, waits] = await Promise.all([findPending(rest, ctx).catch(() => []), progressLine({ adapter: rest.adapter, ctx }), sessionNotice(ctx, isManager).catch(() => null), managerStart(rest, isManager), startLabelsPass({ ...rest, ctx })]);
  // Issue #160: the Coach kept the watch on for this repo on this machine (`/huddle-watch always`). That is their standing order to review
  // and merge, so it replaces the start line's «act on nothing until asked»; the line about what waits still shows.
  let always = false;
  // Issue #199: the watch runs in Claude Code only, so a Codex session (the same login may play there) is never asked to start it.
  // Issue #212: in Codex too (#199 skipped it); Issue #211: a watch another session holds is named, not started twice.
  try { always = readAlways(ctx) && await isManager(); } catch { always = false; }
  let held = null;
  try { held = always ? watchHeldElsewhere(ctx) : null; } catch { held = null; }
  const startIt = ctx.tool === 'codex'
    ? 'Huddle: the Coach keeps the watch on in this repo (/huddle-watch always): their standing order to review and merge. Before anything else, start the watch as /huddle-watch does in OpenAI Codex (the check now, then the background wait with queue --wait <seconds> --codex, which returns at once; this chat gets a message when something waits), and say so in one line, in their language.'
    : 'Huddle: the Coach keeps the watch on in this repo (/huddle-watch always): their standing order to review and merge. Before anything else, start the watch exactly as /huddle-watch does (the check now, then the background wait), and say so in one line, in their language.';
  const manager = !always ? waits : held ? {
    visible: [waits?.visible, `Huddle: ${held}`].filter(Boolean).join('\n'),
    context: null,
  } : {
    visible: [waits?.visible, 'Huddle: the watch starts now, as you asked (/huddle-watch always). /huddle-watch off stops it.'].filter(Boolean).join('\n'),
    context: startIt,
  };
  // Issue #215: in Claude Code, once per repo, say that the Codex on this machine has no Huddle yet.
  let codexMissing = null;
  if (ctx.tool !== 'codex') {
    try {
      const noted = labelsFiles(ctx).codexNoted;
      const c = ctx.readFile(noted) === '1' ? null : codexInstallLine(ctx);
      if (c?.mark === '⚠') { codexMissing = `Huddle: ${c.detail}.`; ctx.writeFile(noted, '1'); }
    } catch { codexMissing = null; }
  }
  const line = [gap?.visible, manager?.visible, progress, notice?.visible, corrected, codexMissing].filter(Boolean).join('\n') || null;
  // Issue #199: Codex skills get no ${CLAUDE_PLUGIN_ROOT} placeholder, so in Codex the hook always says where the command is.
  const huddleCmd = `node "${String(ctx.pluginRoot ?? '').replace(/\\/g, '/')}/bin/huddle"`;
  const codexLine = ctx.tool === 'codex' ? `Huddle (OpenAI Codex): the huddle command is ${huddleCmd}. Where a Huddle skill writes node "\${CLAUDE_PLUGIN_ROOT}/bin/huddle", run that instead.` : null;
  // Issue #209: the session knows the person's language from the first message, even when they type only a command.
  let lang = null;
  try { lang = resolveLanguage(ctx, rest.config); } catch { lang = null; }
  const langLine = lang ? `Huddle: chat with this person in ${lang.language} (${LANGUAGE_FROM[lang.source]}), from the first message, unless they write in another language; everything written to the repo stays in English.` : null;
  const codex = [langLine, codexLine].filter(Boolean).join('\n') || null;
  if (!found.length) {
    const extra = [codex, gap?.context, manager?.context, notice?.context].filter(Boolean).join('\n');
    if (!line && codex) { ctx.out(JSON.stringify({ hookSpecificOutput: { hookEventName: 'SessionStart', additionalContext: extra } })); return 0; }
    if (line) ctx.out(JSON.stringify({ systemMessage: line, ...(extra && { hookSpecificOutput: { hookEventName: 'SessionStart', additionalContext: extra } }) }));
    return 0;
  }
  const context = [
    'Huddle: the Coach left requests that no session has done yet:',
    ...found.map((f) => `- ${f.where}: ${f.url}`),
    `Before anything else, tell the Player in their language, for example: «There is a comment from the Coach on ${reviewWord(rest.config).one} ${reviewWord(rest.config).mark}N (Issue #M) that we have not done yet. Do you want me to continue?».`,
    'Only if they say yes: run `huddle take <issue>` and follow the prompt it prints. If they pasted that prompt themselves, also run `huddle take <issue>` first so it is marked.',
    codex,
    gap?.context,
    manager?.context,
    notice?.context,
  ].filter(Boolean).join('\n');
  // `systemMessage` is what the Player sees; `additionalContext` reaches only Claude, who speaks after the Player types.
  const pendingLine = `Huddle: the Coach left ${found.length} request${found.length === 1 ? '' : 's'} not done yet (${found.map((f) => f.where).join('; ')}). Say hello and Claude will ask to continue.`;
  const visible = line ? `${pendingLine}\n${line}` : pendingLine;
  ctx.out(JSON.stringify({ systemMessage: visible, hookSpecificOutput: { hookEventName: 'SessionStart', additionalContext: context } }));
  return 0;
}

// --- notice -----------------------------------------------------------------------------------------------------------------------------

const noticeRequest = (args) => (args.length === 0 || (args.length === 1 && args[0] === '--json') ? { json: args.length === 1 } : null);

/** `huddle notice [--json]` (docs/design.md §20): the update notice for a skill to say. Read-only, no login; always exit 0. */
async function notice({ args, ctx }) {
  // Whether the person is the Coach needs the config and a login; without either, they are a Player.
  const isManager = async () => {
    const config = loadConfig(ctx.root, ctx.readFile, ctx.configFallback);
    return same(await (await ctx.createPlatform(config)).me(), config.ai_manager);
  };
  const r = await skillNotice(ctx, isManager);
  const corrected = takeCorrected(ctx);
  if (noticeRequest(args).json) ctx.out(JSON.stringify(corrected ? { ...r, corrected } : r));
  else {
    if (r.show) ctx.out(r.text);
    if (corrected) ctx.out(corrected);
  }
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

const CODEX_MISSING = 'Codex is on this machine but Huddle is not installed in it: in this repo run codex plugin marketplace upgrade huddle (trust the project when Codex asks), then trust the hook once in terminal Codex (docs/team-guide.md, «A mixed team»)';
/** Issue #215: whether Huddle is installed in the Codex of this machine, as a doctor line, or null when there is no Codex. */
function codexInstallLine(ctx) {
  let state = null;
  try { state = ctx.codexState?.() ?? null; } catch { state = null; }
  if (!state?.codex) return null;
  return state.installed ? { mark: '✔', detail: 'Huddle is installed in Codex too' } : { mark: '⚠', detail: CODEX_MISSING };
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
    config = loadConfig(ctx.root, ctx.readFile, ctx.configFallback);
    report('✔', 'huddle.json', `valid (${config.platform}, ${config.project}${config.host ? ` on ${config.host}` : ''})${config.from_branch ? `, read from ${config.from_branch} (this branch has none)` : ''}`);
  } catch (e) {
    report('✖', 'huddle.json', e.message.replaceAll('\n', '; '));
    return flush();
  }
  setupLine(ctx, report);
  const codex = codexInstallLine(ctx); // Issue #215
  if (codex) report(codex.mark, 'codex', codex.detail);
  for (const l of heartbeatLines(ctx)) report(l.mark, l.name, l.detail); // Issue #181
  if (config.labels_job === 'sessions') report('✔', 'labels job', 'sessions (nothing runs in the cloud: the sessions keep the labels right)');
  else report('✔', 'labels job', config.labels_job);
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
  const who = me && !same(me, config.ai_manager) ? `${config.ai_manager} (you are ${me}: a Player session)` : config.ai_manager + (me ? ' (you)' : '');
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
  if (config.staging_branch) {
    const name = config.staging_branch;
    try {
      if (await adapter.branchExists(name)) report('✔', 'staging', `branch ${name} exists on the remote`);
      else report('✖', 'staging', `branch ${name} not found on the remote: create it, or run /huddle-update to change the answer`);
    } catch (e) {
      report('⚠', 'staging', `branch ${name} not checked: ${String(e.message).split('\n')[0]}`); // a failed lookup (offline) says nothing about the branch
    }
  }
  await teamCheck(adapter, config, report);
  return flush();
}

// --- entry ----------------------------------------------------------------------------------------------------------------------------

// --- next and capacity (Issue #164, docs/design.md §24) --------------------------------------------------------------------------------

const nextRequest = (args) => (args.length === 0 || (args.length === 1 && args[0] === '--json') ? { json: args.length === 1 } : null);

/** `huddle capacity [<points> | reset]`. Null when the arguments do not fit. */
function capacityRequest(args) {
  if (args.length === 0) return { show: true };
  if (args.length === 1 && args[0] === 'reset') return { reset: true };
  if (args.length === 1 && isNumber(args[0]) && Number(args[0]) > 0) return { points: Number(args[0]) };
  return null;
}

/** What the Coach allows a Player (capacity_per_person, else capacity, else 5), and what the Player lowered it to on this machine. */
function capacityOf(ctx, config, login) {
  const per = config.capacity_per_person ?? {};
  const key = Object.keys(per).find((k) => same(k, login));
  const allowed = key ? per[key] : (config.capacity ?? 5);
  let local = null;
  try {
    const [who, n] = String(ctx.readFile(labelsFiles(ctx).capacity) ?? '').split(':');
    if (who && same(who, login) && Number(n) > 0) local = Number(n);
  } catch { /* no mark: the allowed value */ }
  return { allowed, capacity: local !== null && local < allowed ? local : allowed };
}

/** `huddle capacity`: the Player lowers their capacity on this machine (a mark next to the update cache, never in the repo), never above the Coach's. */
async function capacity({ args, config, adapter, ctx }) {
  const request = capacityRequest(args);
  const me = await adapter.me();
  const { allowed, capacity: now } = capacityOf(ctx, config, me);
  if (request.show) { ctx.out(`Your capacity in this repo on this machine: ${now} points (the Coach allows ${allowed}).`); return 0; }
  if (request.reset) { ctx.writeFile(labelsFiles(ctx).capacity, ''); ctx.out(`Your capacity is back to what the Coach allows: ${allowed} points.`); return 0; }
  if (request.points > allowed) { ctx.out(`huddle capacity can only be lowered: the Coach allows ${allowed} points.`); return 1; }
  ctx.writeFile(labelsFiles(ctx).capacity, `${me}:${request.points}`);
  ctx.out(`Your capacity in this repo on this machine is now ${request.points} points (the Coach allows ${allowed}).`);
  return 0;
}

const isDesignIssue = (it) => it.labels.includes(DESIGN_LABEL.name) || /^## Screens\b/m.test(String(it.body ?? '').replace(/\r\n/g, '\n'));

/**
 * `huddle next [--json]` (Issue #164): which of the Player's assigned Issues start now and which wait. Active work (in progress, or changes
 * requested) uses room; an Issue in review uses none. Read-only.
 */
async function next({ args, config, adapter, ctx }) {
  const { json } = nextRequest(args);
  const rn = renamer(config);
  const me = await adapter.me();
  const open = (await adapter.listOpenIssues()).map((i) => ({ ...i, labels: i.labels.map(rn.toCore) }));
  const mine = open.filter((i) => i.assignees.some((a) => same(a, me)) && dependsOn(i.body) !== null && !needsTriage(i));
  const openPrs = new Set(await adapter.openReviews());
  const issues = new Map(open.map((i) => [i.number, { open: true, merged: false }]));
  for (const n of new Set(mine.flatMap((i) => dependsOn(i.body)))) {
    if (issues.has(n)) continue;
    try { issues.set(n, await adapter.issueState(n)); } catch (e) { if (!e?.notFound) throw e; }
  }
  const active = [];
  const candidates = [];
  const waits = [];
  for (const it of mine) {
    const comments = (await Promise.all([adapter.comments(it.number), ...it.reviews.map((n) => adapter.comments(n, { review: true }))])).flat();
    const commits = (await Promise.all(it.reviews.map((n) => adapter.reviewCommits(n)))).flat();
    const request = requestState({ manager: config.ai_manager, comments, commits });
    const decision = waitsForDecision(it) && request === null;
    const { label, waiting } = statusOf({ deps: dependsOn(it.body), assigned: true, started: it.labels.includes(LABELS.progress.name), review: reviewing(it, openPrs), request, decision, issues });
    if (decision) waits.push({ issue: it.number, why: 'waits for the Coach\'s decision' });
    else if (label === LABELS.progress.name || request === 'pending') active.push(it);
    else if (label === LABELS.blocked.name) waits.push({ issue: it.number, why: `waits for ${waiting.map((n) => `#${n}`).join(', ')}` });
    else if (label === LABELS.assigned.name) {
      if (isDesignIssue(it)) waits.push({ issue: it.number, why: 'a Design Issue: work it in a session of its own (/huddle-play <n>)' });
      else candidates.push({ ...it, blocking: isBlockingBug(it) });
    }
  }
  const { allowed, capacity: cap } = capacityOf(ctx, config, me);
  const plan = schedule({ active, candidates, capacity: cap });
  const bodyOf = new Map(mine.map((i) => [i.number, i.body]));
  const result = {
    capacity: cap,
    allowed,
    used: active.reduce((n, i) => n + effortOf(i.body), 0),
    active: active.map((i) => ({ issue: i.number, title: i.title, effort: effortOf(i.body) })),
    start: plan.start.map((i) => ({ issue: i.number, title: i.title, effort: effortOf(i.body) })),
    wait: [...plan.wait, ...waits].sort((a, b) => a.issue - b.issue).map((w) => ({ ...w, effort: effortOf(bodyOf.get(w.issue)) })),
  };
  if (json) { ctx.out(JSON.stringify(result, null, 2)); return 0; }
  const titleOf = (n) => mine.find((i) => i.number === n)?.title ?? '';
  ctx.out([
    `Capacity: ${result.capacity} points, ${result.used} in use${result.capacity < allowed ? ` (lowered from ${allowed})` : ''}.`,
    result.start.length ? ['Start now:', ...result.start.map((s) => `  #${s.issue} (effort ${s.effort}) ${s.title}`)].join('\n') : 'Start now: nothing.',
    ...(result.wait.length ? [['Waits:', ...result.wait.map((w) => `  #${w.issue} (effort ${w.effort}): ${w.why}  ${titleOf(w.issue)}`)].join('\n')] : []),
  ].join('\n'));
  return 0;
}

// --- effort (Issue #162, docs/design.md §24) -------------------------------------------------------------------------------------------

/** `huddle effort <n>` or `huddle effort --suggest <file>`. Read-only. Null when the arguments do not fit. */
function effortRequest(args) {
  if (args.length === 1 && isNumber(args[0]) && Number(args[0]) > 0) return { issue: Number(args[0]) };
  if (args.length === 2 && args[0] === '--suggest' && args[1]) return { suggest: args[1] };
  return null;
}

async function effort({ args, adapter, ctx }) {
  const request = effortRequest(args);
  if (request.suggest) {
    const text = ctx.readFile(request.suggest);
    if (text === null || text === undefined) throw new Error(`cannot read ${request.suggest}`);
    ctx.out(JSON.stringify(suggestEffort(text), null, 2));
    return 0;
  }
  const it = (await adapter.listOpenIssues()).find((i) => i.number === request.issue);
  if (!it) { ctx.out(`#${request.issue} is not an open Issue`); return 1; }
  const written = /^## Effort[ \t]*$/m.test(String(it.body ?? '').replace(/\r\n/g, '\n'));
  ctx.out(`#${it.number}: effort ${effortOf(it.body)} (${written ? 'from its «Effort» section' : 'the default: it has no «Effort» section'})`);
  return 0;
}

const COMMANDS = { language, status, effort, next, capacity, labels, land, tested, release, wait, take, pending, queue, progress, areas, team, clean, update: updateCommand, notice, hook };
const NEEDS_ISSUE = new Set(['wait', 'take']);
const testedFits = (args) => args.length === 1 && isNumber(args[0]);

export async function run(argv, ctx) {
  const [name, ...args] = argv;
  if (name === 'doctor') return doctor(ctx);
  const command = COMMANDS[name];
  if (!command || (NEEDS_ISSUE.has(name) && !isNumber(args[0])) || (name === 'pending' && args[0] !== undefined && !isNumber(args[0])) || (name === 'status' && statusRequest(args) === null) || (name === 'effort' && effortRequest(args) === null) || (name === 'next' && nextRequest(args) === null) || (name === 'capacity' && capacityRequest(args) === null) || (name === 'labels' && labelsRequest(args) === null) || (name === 'queue' && queueRequest(args) === null) || (name === 'progress' && args.some((a) => a !== '--json')) || (name === 'areas' && areasRequest(args) === null) || (name === 'team' && teamRequest(args) === null) || (name === 'land' && landRequest(args) === null) || (name === 'tested' && !testedFits(args)) || (name === 'release' && releaseRequest(args) === null) ||(name === 'clean' && cleanRequest(args) === null) || (name === 'update' && updateRequest(args) === null) || (name === 'notice' && noticeRequest(args) === null) || (name === 'language' && args.length > 1)) {
    ctx.err(USAGE);
    return 2;
  }
  const timed = name === 'hook'; // never get in the way of a session starting
  const quiet = timed || (name === 'clean' && args.includes('--quiet')); // the hook's clean process runs alone: it says nothing and fails silently
  try {
    if (name === 'notice') return await notice({ args, ctx }); // no config and no login needed
    if (name === 'status') return status({ args, ctx }); // files only: no config, no login, no network (Issue #181)
    if (name === 'update') return updateCommand({ args, ctx }); // files only: it has its own error for a missing huddle.json
    const config = loadConfig(ctx.root, ctx.readFile, ctx.configFallback);
    if (config.from_branch && !quiet) ctx.err(`huddle: this branch has no huddle.json; using the one on ${config.from_branch}`); // Issue #179
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
