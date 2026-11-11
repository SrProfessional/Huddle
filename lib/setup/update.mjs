// Huddle: `huddle update` (docs/design.md §17). Brings a set-up repo to the installed Huddle: the questions a release added since the repo's
// `setup_version` are asked once (the skill asks; this takes the answers), then it refreshes the block, the templates and the version exactly as setup does.
// Only files: no platform, no login, no network, and it never commits.
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { validate } from '../cli/validate.mjs';
import { setup, installedVersion } from './index.mjs';
import { QUESTIONS, pendingQuestions, describe } from './questions.mjs';

const SCHEMA_FILE = new URL('../../huddle.schema.json', import.meta.url);

/** The repo's huddle.json as an object. Throws with a message that says what to do. */
function readConfig(root) {
  const file = path.join(root, 'huddle.json');
  if (!existsSync(file)) throw new Error('there is no huddle.json here: run /huddle-setup first to install Huddle in this repo');
  let config;
  try { config = JSON.parse(readFileSync(file, 'utf8')); } catch (e) { throw new Error(`huddle.json is not valid JSON: ${e.message}`); }
  if (config === null || typeof config !== 'object' || Array.isArray(config)) throw new Error('huddle.json is not a JSON object');
  return config;
}

/** The answers must be for pending questions only, and the file with them must still pass the schema. Throws before anything is written. */
function checkAnswers(config, answers, pending) {
  const keys = new Set(pending.map((q) => q.key));
  const refused = Object.keys(answers).filter((k) => !keys.has(k));
  if (refused.length) {
    throw new Error(`"${refused.join('", "')}" is not a pending question: update only takes answers to the questions it lists (huddle.json never holds secrets or unknown keys)`);
  }
  const errors = validate(JSON.parse(readFileSync(SCHEMA_FILE, 'utf8')), { ...config, ...answers });
  if (errors.length) throw new Error(errors.map((e) => `huddle.json: "${e.path}" ${e.message}`).join('\n'));
}

/** The files that would really change: huddle.json counts only when an answer goes into it (a new setup_version alone is not a change worth a PR). */
const meaningful = (changed, answers) => changed.filter((f) => f !== 'huddle.json' || Object.keys(answers).length > 0);

/**
 * Updates the repo at `root`. `answers`: { key: value } for pending questions. `check` and `dryRun` write nothing.
 * Returns { status, setupVersion, installed, pendingQuestions, written, skipped, changed, claudeMd, notes } where status is
 * 'questions' (a question has no answer: nothing was written), 'up-to-date', 'would-change' (check / dryRun) or 'updated'.
 */
export function update(root, { answers = {}, check = false, dryRun = false, registry = QUESTIONS } = {}) {
  const config = readConfig(root);
  const pending = pendingQuestions(config, registry);
  checkAnswers(config, answers, pending);
  const missing = pending.filter((q) => !(q.key in answers));
  const base = { setupVersion: config.setup_version ?? null, installed: installedVersion() };

  const preview = setup(root, {}, { dryRun: true, extra: answers, registry });
  const changed = meaningful(preview.changed, answers);
  const shown = { ...base, pendingQuestions: missing.map(describe), written: preview.written, skipped: preview.skipped, changed, claudeMd: preview.claudeMd, notes: preview.notes };

  if (missing.length) return { status: 'questions', ...shown };
  if (check || dryRun) return { status: changed.length ? 'would-change' : 'up-to-date', ...shown };

  const done = setup(root, {}, { extra: answers, registry });
  return { status: 'updated', ...base, pendingQuestions: [], written: done.written, skipped: done.skipped, changed: meaningful(done.changed, answers), claudeMd: done.claudeMd, notes: done.notes };
}

/**
 * For `huddle doctor`: where the repo stands against the installed Huddle, or null when huddle.json is missing or unusable.
 * state: 'current' | 'version-only' (only the number differs: nothing to refresh) | 'needs' (a question is pending or a file would change).
 */
export function setupStatus(root, { registry = QUESTIONS } = {}) {
  try {
    const config = readConfig(root);
    const pending = pendingQuestions(config, registry);
    const changed = meaningful(setup(root, {}, { dryRun: true, registry }).changed, {});
    const installed = installedVersion();
    const setupVersion = config.setup_version ?? null;
    const state = pending.length || changed.length ? 'needs' : setupVersion === installed ? 'current' : 'version-only';
    return { state, setupVersion, installed, pending: pending.map((q) => q.id), changed };
  } catch {
    return null;
  }
}
