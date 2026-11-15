// Huddle: reads huddle.json (docs/design.md §6) and refuses it, naming the field, when it does not fit huddle.schema.json.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { LABELS } from '../core/issue-status.mjs';
import { validate } from './validate.mjs';

const SCHEMA = JSON.parse(readFileSync(new URL('../../huddle.schema.json', import.meta.url), 'utf8'));

/** The names of the seven status labels, with the renames of `config.labels` applied: { ready: 'ready', ..., changes: '…' }. */
export const labelNames = (config = {}) => ({ ...Object.fromEntries(Object.entries(LABELS).map(([key, l]) => [key, l.name])), ...(config.labels ?? {}) });

/** Why `staging_branch` cannot be used (docs/design.md §21), or null when it is fine. '' means «no staging branch» and is always fine. */
export function stagingBranchError(name, defaultBranch = 'main') {
  if (name === '' || name === undefined) return null;
  if (name === defaultBranch) return 'huddle.json: "staging_branch" must not be the same as "default_branch"';
  if (/\s/.test(name) || name.startsWith('-') || name.includes('..') || name.endsWith('/') || name.endsWith('.lock')) {
    return `huddle.json: "staging_branch" must be a plain branch name: no spaces, no leading "-", no "..", not ending in "/" or ".lock" (got ${JSON.stringify(name)})`;
  }
  return null;
}

/** Reads and validates `<root>/huddle.json`. `read(file)` returns the text, or null when the file does not exist. Throws an Error that names the field. */
export function loadConfig(root, read = (file) => { try { return readFileSync(file, 'utf8'); } catch { return null; } }) {
  const file = path.join(root, 'huddle.json');
  const text = read(file);
  if (text === null || text === undefined) throw new Error(`huddle.json not found in ${root}. Run the huddle-setup skill, or create it (see docs/design.md §6).`);
  let data;
  try {
    data = JSON.parse(text);
  } catch (e) {
    throw new Error(`huddle.json is not valid JSON: ${e.message}`);
  }
  const errors = validate(SCHEMA, data);
  if (errors.length) throw new Error(errors.map((e) => `huddle.json: "${e.path}" ${e.message}`).join('\n'));
  const names = Object.values(labelNames(data));
  if (new Set(names).size !== names.length) throw new Error('huddle.json: "labels" give two status labels the same name');
  const staging = stagingBranchError(data.staging_branch, data.default_branch ?? 'main');
  if (staging) throw new Error(staging);
  // Issue #166: the role is the Coach. `coach` is the key; `ai_manager` (its older name) keeps working, and both must agree.
  if (!data.coach && !data.ai_manager) throw new Error('huddle.json: "coach" is required (or "ai_manager" in older repos)');
  if (data.coach && data.ai_manager && String(data.coach).toLowerCase() !== String(data.ai_manager).toLowerCase()) {
    throw new Error(`huddle.json: "coach" and "ai_manager" name different logins (${data.coach}, ${data.ai_manager}): keep one`);
  }
  const coach = data.coach ?? data.ai_manager;
  // Every command reads the Coach as `ai_manager` too, so a list of Coaches can come later behind coachOf without touching each caller.
  return { host: '', assignees: [], default_branch: 'main', ...data, coach, ai_manager: coach, staging_branch: data.staging_branch ?? '', labels_job: data.labels_job ?? 'sessions' };
}

/** The Coach's login (Issue #166): one place to read it, from a loaded config. */
export const coachOf = (config) => config.coach ?? config.ai_manager;
