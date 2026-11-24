// Huddle: an Issue that needs a tool open on the person's main checkout runs in that tool, one at a time (Issue #339, docs/design.md §24).
//
// The main checkout is ONE slot per login, whatever the tool (an editor or IDE: a game engine's editor, Xcode, Android Studio). Everything here is pure: it takes a
// `git status --porcelain` text, the current branch and the answers the session collected for the detector, and returns what to do (a plan, or ONE step for the person).
// It never runs a command: the skills tell the session which `commands` to run, after the person's answer when there is one. The session never stashes, resets or
// switches a checkout that holds changes of the person. Only the detector of «is it connected?» depends on the tool's name.
import { unfenced } from './issue-status.mjs';

/** The list items of the `## Needs` section (the reader of Issue sections, as effort.mjs reads «Effort» and «Allowed files»), with HTML comments left out. */
function needsItems(body) {
  const text = unfenced(String(body ?? '')).replace(/\r\n/g, '\n');
  const m = /^## Needs[ \t]*\n([\s\S]*?)(?=^## |(?![\s\S]))/m.exec(text);
  if (!m) return [];
  return m[1].replace(/<!--[\s\S]*?-->/g, '').split('\n').map((l) => /^\s*[-*]\s+(.*\S)/.exec(l)?.[1]).filter(Boolean);
}

/**
 * The tool an Issue needs open on the main checkout, or null: `{ tool }`, where `tool` is the name written under `## Needs` (`- Editor: <tool>`; `- Unity Editor` is an alias
 * of `- Editor: Unity`) or null for a plain `- Editor` (an empty value, `- Editor:`, is the same: a requirement is never dropped). The slot is the same for every tool; only the detector depends on the name.
 */
export function needsTool(body) {
  for (const item of needsItems(body)) {
    const m = /^(?:(unity)\s+)?editor(?:\s*:\s*(.*?))?\.?$/i.exec(item.trim());
    if (m) return { tool: m[2] ? m[2].trim() : m[1] ? 'Unity' : null };
  }
  return null;
}

/** The detectors of «is the tool connected?», keyed by lowercase tool name: each takes the answers the session collected and returns true or false. A new tool is a new entry. */
export const DETECTORS = { unity: (answers) => answers?.connected === true };

/** `connected`, `not connected` or `unknown` (no detector for that name, or no name): an unknown tool is asked to be opened. */
export function toolState(tool, answers) {
  const detect = DETECTORS[String(tool ?? '').toLowerCase()];
  if (!detect) return 'unknown';
  return detect(answers) ? 'connected' : 'not connected';
}

/**
 * Why a candidate must wait for the tool slot, or null. `holders` are the Issues of this login that hold the slot (their test steps are open), `active` the
 * Issues running now: work for another login (`forLogin`), parked work and work on another machine does not use this checkout. An Issue that needs the tool
 * starts only when nothing else of the login is active; while the slot is held no other Issue of the login starts (`blocksOthers: false` for a resume). `notes` says more about a holder, by number (an Issue already closed whose test steps are still open).
 */
export function toolWait({ candidate, holders = [], active = [], blocksOthers = true, notes = {} } = {}) {
  const holder = holders.find((n) => n !== candidate.number);
  if (holder !== undefined && (candidate.needsTool || blocksOthers)) return `waits for the tool: #${holder}${notes[holder] ? ` (${notes[holder]})` : ''} uses it`;
  if (!candidate.needsTool) return null;
  const busy = active.find((a) => a.number !== candidate.number && !a.forLogin && !a.parked && !a.elsewhere);
  return busy ? `waits for the tool: #${busy.number} is running` : null;
}

/** The lines `git status --porcelain` printed: any of them is a change of the person (tracked or not) that is never touched. */
const changesIn = (status) => String(status ?? '').split(/\r?\n/).filter((l) => l.trim());

const ask = (kind, reason, step) => ({ action: 'ask', kind, commands: [], list: { reason, then: 'resume', steps: [step] } });

const CHANGES = (where) => ask('changes', `the main checkout has changes that are not committed${where ? ` (${where})` : ''}`, {
  do: 'Choose what happens to the changes in your main checkout: commit them, save them aside with a stash so I can give them back, or ask me to wait.',
  see: 'Your answer is saved on the Issue, and nothing in your checkout changes until you give it.',
  else: 'Tell me what you saw: I will not touch your files.',
});

/**
 * Before the Issue's work: { action: 'switch' | 'stay' | 'ask', commands, kind?, list? }. Order of the questions, one at a time: changes not committed, a branch that is not the
 * base (the person's own work), then the tool not open (a detectable tool: not connected; an unknown one: asked until `toolOpened`). A clean checkout on the base branch with the tool open switches to `issueBranch`.
 * `newBranch`: the branch is created here, from `origin/<base>`. `commands` are for the session to run; an `ask` has none, and its `list` is the one step to post (`huddle steps <n> --post`).
 */
export function checkoutPlan({ status, branch, base, issueBranch, answers, tool = null, toolOpened = false, newBranch = false } = {}) {
  if (changesIn(status).length) return CHANGES();
  if (branch !== base && branch !== issueBranch) {
    return ask('branch', `the main checkout is on ${branch}, not on ${base}`, {
      do: `Choose whether I may leave your main checkout on ${base} afterwards: switch it to ${base} yourself, or tell me to wait.`,
      see: `The main checkout shows ${base} as its branch, or I keep waiting.`,
      else: 'Tell me which branch it shows: I will not change it.',
    });
  }
  const state = toolState(tool, answers);
  // A tool that cannot be detected is asked once: `toolOpened` says the person closed that step. A detectable one is always checked.
  if (state === 'not connected' || (state === 'unknown' && !toolOpened)) {
    const name = tool || 'the tool';
    return ask('tool', `${name} is not open on the main checkout`, {
      do: `Open ${name} on the main checkout.`,
      see: `${name[0].toUpperCase()}${name.slice(1)} shows this project.`,
      else: `Tell me what ${name} shows: I will wait.`,
    });
  }
  if (branch === issueBranch) return { action: 'stay', commands: [] };
  return { action: 'switch', commands: ['git fetch origin', newBranch ? `git switch -c ${issueBranch} origin/${base}` : `git switch ${issueBranch}`] };
}

/**
 * When the person's test steps are closed (`stepsOpen: false`): { action: 'wait' | 'return' | 'done' | 'ask', commands, verify?, kind?, list? }. While steps are open
 * nothing touches the checkout. Closed: back to `base` up to date (`--ff-only`, never forced), then `verify` is run and read by `verifyReturn`. New changes of the person
 * or a branch someone moved are one question, never forced.
 */
export function returnPlan({ status, branch, issueBranch, base, stepsOpen } = {}) {
  if (stepsOpen) return { action: 'wait', commands: [] };
  if (branch === base && !changesIn(status).length) return { action: 'done', commands: [] };
  if (changesIn(status).length) return CHANGES('new ones since the work ended');
  if (branch !== issueBranch) {
    return ask('branch', `the main checkout is on ${branch}, not on the Issue's branch ${issueBranch}`, {
      do: `Choose where the main checkout should go: switch it to ${base} yourself, or tell me to wait.`,
      see: `The main checkout shows ${base} as its branch, or I keep waiting.`,
      else: 'Tell me which branch it shows: I will not change it.',
    });
  }
  return {
    action: 'return',
    commands: ['git fetch origin', `git switch ${base}`, `git merge --ff-only origin/${base}`],
    verify: ['git status --porcelain', 'git rev-parse --abbrev-ref HEAD', `git rev-list --count HEAD..origin/${base}`],
  };
}

/** After the return commands: `{ ok: true }` when the checkout is on `base`, clean and not behind (`behind` commits); else one question and the slot stays held. */
export function verifyReturn({ status, branch, base, behind } = {}) {
  if (branch === base && !changesIn(status).length && Number(behind) === 0) return { ok: true };
  const why = changesIn(status).length ? 'it has changes that are not committed' : branch !== base ? `it is on ${branch}` : `it is ${behind} commit${Number(behind) === 1 ? '' : 's'} behind origin/${base}`;
  return {
    ok: false,
    list: { reason: `the main checkout did not come back to ${base} clean and up to date: ${why}`, then: 'resume', steps: [{
      do: `Choose what to do with your main checkout: put it on ${base} up to date yourself, or tell me to wait.`,
      see: `The main checkout shows ${base}, with no changes and nothing to pull.`,
      else: 'Tell me what you saw: I will not force anything.',
    }] },
  };
}
