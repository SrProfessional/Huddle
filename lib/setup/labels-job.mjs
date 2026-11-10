// Huddle: finding the labels job a project already runs, by what it does (Issue #70). A project may keep Huddle's labels job under its own
// file name (SocialCortex: .github/workflows/issue-labels.yml); setup must then not add a second one, which would run every event twice.
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { isNewer, parseVersion } from '../core/update.mjs';

/** Where setup puts its own labels job, per platform. */
export const OWN_LABELS_JOB = { github: '.github/workflows/huddle-labels.yml', gitlab: 'huddle-labels.gitlab-ci.yml' };

/** A file that runs the labels command: `node ".../bin/huddle" labels` or `huddle labels`. */
const RUNS_LABELS = /\bhuddle["']?[ \t]+labels\b/;

const read = (root, rel) => {
  const file = path.join(root, rel);
  return existsSync(file) ? readFileSync(file, 'utf8') : null;
};

/** The files to look in: every workflow on GitHub; on GitLab, .gitlab-ci.yml and the local files it includes. */
function candidates(root, platform) {
  if (platform === 'github') {
    const dir = path.join(root, '.github', 'workflows');
    if (!existsSync(dir)) return [];
    return readdirSync(dir).filter((f) => /\.ya?ml$/i.test(f)).sort().map((f) => `.github/workflows/${f}`);
  }
  const ci = read(root, '.gitlab-ci.yml');
  if (ci === null) return [];
  const locals = [...ci.matchAll(/^[ \t-]*local:[ \t]*['"]?([^'"\s#]+)/gm)].map((m) => m[1].replace(/^\/+/, ''));
  return ['.gitlab-ci.yml', ...locals];
}

/** The `HUDDLE_REF:` a job pins, with the tag written in a comment after a SHA («<sha> # v0.4.0»); null when it pins none. */
export function pinnedRef(text) {
  const m = /HUDDLE_REF:[ \t]*['"]?([^\s'"#]+)['"]?[ \t]*(?:#[ \t]*(\S+))?/.exec(text);
  return m ? { ref: m[1], tag: m[2] ?? null } : null;
}

/** The project's own labels job that is not setup's file: { file, pin } or null. */
export function findLabelsJob(root, platform) {
  for (const rel of candidates(root, platform)) {
    if (rel === OWN_LABELS_JOB[platform]) continue;
    const text = read(root, rel);
    if (text !== null && RUNS_LABELS.test(text)) return { file: rel, pin: pinnedRef(text) };
  }
  return null;
}

/**
 * The note for a job that runs an older Huddle than `version` (the one running setup), or null. A branch (main) follows that branch;
 * a tag is compared; a SHA is read by the tag in its comment, and without one it cannot be dated, so the note asks to check it.
 */
export function refNote(file, pin, version) {
  if (!pin || !parseVersion(version)) return null;
  const target = `HUDDLE_REF to v${version} (or its full commit SHA) in a PR`;
  const tag = parseVersion(pin.ref) ? pin.ref : pin.tag && parseVersion(pin.tag) ? pin.tag : null;
  if (tag) {
    const shown = tag === pin.ref ? pin.ref : `${pin.ref} (${tag})`;
    return isNewer(version, tag) ? `${file} runs Huddle ${shown}; this is ${version}. Update ${target}.` : null;
  }
  if (/^[0-9a-f]{7,40}$/i.test(pin.ref)) return `${file} runs Huddle ${pin.ref}; check it is v${version} or newer, and if not, update ${target}.`;
  return null;
}
