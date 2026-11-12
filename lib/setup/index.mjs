// Huddle: the file-writing part of `huddle-setup` (docs/design.md §4, §5, §6). The skill asks the questions and calls this.
// Writes huddle.json, the templates of the chosen platform, the .claude/settings.json snippet and the CLAUDE.md block. Safe to run again: it replaces only the
// block and the two settings keys, never overwrites a template the project edited, and keeps the huddle.json and settings.json keys it does not ask for.
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validate } from '../cli/validate.mjs';
import { insertBlock, hasBlock } from './block.mjs';
import { OWN_LABELS_JOB, findLabelsJob, refNote } from './labels-job.mjs';
import { QUESTIONS, pendingQuestions } from './questions.mjs';

const SCHEMA_FILE = new URL('../../huddle.schema.json', import.meta.url);
const PLUGIN_JSON = new URL('../../.claude-plugin/plugin.json', import.meta.url);
const TEMPLATES = fileURLToPath(new URL('../../templates/', import.meta.url));
const SCHEMA_URL = 'https://raw.githubusercontent.com/SrProfessional/Huddle/main/huddle.schema.json';
const ASKED = ['platform', 'host', 'project', 'ai_manager', 'assignees', 'max_open_per_person', 'default_branch'];

/** Template (inside templates/) -> where it goes in the repo, per platform. */
export const FILES = {
  github: [
    ['github/ISSUE_TEMPLATE/task.md', '.github/ISSUE_TEMPLATE/task.md'],
    ['github/ISSUE_TEMPLATE/bug.md', '.github/ISSUE_TEMPLATE/bug.md'],
    ['github/ISSUE_TEMPLATE/bug-report.yml', '.github/ISSUE_TEMPLATE/bug-report.yml'],
    ['github/ISSUE_TEMPLATE/design.md', '.github/ISSUE_TEMPLATE/design.md'],
    ['github/pull_request_template.md', '.github/pull_request_template.md'],
    ['github/workflows/huddle-labels.yml', '.github/workflows/huddle-labels.yml'],
  ],
  gitlab: [
    ['gitlab/issue_templates/Task.md', '.gitlab/issue_templates/Task.md'],
    ['gitlab/issue_templates/Bug.md', '.gitlab/issue_templates/Bug.md'],
    ['gitlab/issue_templates/Design.md', '.gitlab/issue_templates/Design.md'],
    ['gitlab/merge_request_templates/Default.md', '.gitlab/merge_request_templates/Default.md'],
    ['gitlab/huddle-labels.gitlab-ci.yml', 'huddle-labels.gitlab-ci.yml'],
  ],
};

const SETTINGS_FILE = '.claude/settings.json';
const MARKETPLACE = { source: { source: 'github', repo: 'SrProfessional/Huddle' } };
const PLUGIN = 'huddle@huddle';
const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

/**
 * The project's .claude/settings.json with the marketplace and the enabled plugin (README, Install). Only extraKnownMarketplaces.huddle and
 * enabledPlugins["huddle@huddle"] are set; every other key stays. Returns { text } to write, or { reason } when the file cannot be merged safely.
 */
function mergeSettings(current) {
  let base = {};
  if (current !== null) {
    try { base = JSON.parse(current); } catch { return { reason: 'it is not valid JSON' }; }
    if (!isObject(base)) return { reason: 'it is not a JSON object' };
    for (const key of ['extraKnownMarketplaces', 'enabledPlugins']) if (key in base && !isObject(base[key])) return { reason: `"${key}" is not an object` };
  }
  const merged = { ...base, extraKnownMarketplaces: { ...base.extraKnownMarketplaces, huddle: MARKETPLACE }, enabledPlugins: { ...base.enabledPlugins, [PLUGIN]: true } };
  return { text: `${JSON.stringify(merged, null, 2)}
` };
}

const GITLAB_CI = 'include:\n  - local: huddle-labels.gitlab-ci.yml\n';

function writeAt(root, rel, text) {
  const file = path.join(root, rel);
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, text);
}

/** The version of the running Huddle (the plugin.json next to this file's package). */
export const installedVersion = () => JSON.parse(readFileSync(PLUGIN_JSON, 'utf8')).version;

const lf = (text) => text.replace(/\r\n/g, '\n');
/** The template in the line ending the file already has: CRLF when every line break of the file is CRLF, LF otherwise. */
const likeFile = (text, current) => (/\r\n/.test(current) && !/(^|[^\r])\n/.test(current) ? lf(text).replace(/\n/g, '\r\n') : lf(text));

function readIf(file) {
  return existsSync(file) ? readFileSync(file, 'utf8') : null;
}

/**
 * The huddle.json to write: the old file's keys, then the answers, then `extra` (answers to the questions of the registry, already checked by
 * `huddle update`). `setup_version` becomes the installed version, except when the repo still has a pending question: the old one stays so the
 * question is not hidden. Throws (naming the field) before anything is written.
 */
function buildConfig(root, answers, extra, registry) {
  const unknown = Object.keys(answers).filter((k) => !ASKED.includes(k));
  if (unknown.length) throw new Error(`setup does not take "${unknown.join('", "')}": huddle.json never holds secrets or unknown keys`);
  const old = readIf(path.join(root, 'huddle.json'));
  let base = {};
  if (old !== null) {
    try { base = JSON.parse(old); } catch (e) { throw new Error(`huddle.json is not valid JSON: ${e.message}`); }
  }
  const given = Object.fromEntries(Object.entries(answers).filter(([, v]) => v !== undefined && v !== null));
  const config = { $schema: SCHEMA_URL, ...base, ...given, ...extra };
  if (old === null || pendingQuestions(config, registry).length === 0) config.setup_version = installedVersion();
  const errors = validate(JSON.parse(readFileSync(SCHEMA_FILE, 'utf8')), config);
  if (errors.length) throw new Error(errors.map((e) => `huddle.json: "${e.path}" ${e.message}`).join('\n'));
  return config;
}

/**
 * Sets Huddle up in the repo at `root`. `answers`: { platform, host?, project, ai_manager, assignees?, max_open_per_person?, default_branch? }.
 * Returns { written: [paths], skipped: [paths kept as they were], changed: [paths whose text differs], claudeMd: 'created'|'inserted'|'updated', notes: [strings for the developer] }.
 */
export function setup(root, answers = {}, opts = {}) {
  const { dryRun = false, extra = {}, registry = QUESTIONS } = opts;
  const config = buildConfig(root, answers, extra, registry);
  const changed = []; // the files whose text differs from what is there now (with dryRun: nothing is written, this is what would change)
  const put = (rel, text) => {
    if (readIf(path.join(root, rel)) !== text) changed.push(rel);
    if (!dryRun) writeAt(root, rel, text);
  };
  const written = [];
  const skipped = [];
  const notes = [];

  put('huddle.json', `${JSON.stringify(config, null, 2)}\n`);
  written.push('huddle.json');

  // A labels job the project already runs under another name (Issue #70): keep it, add none, and say when it runs an older Huddle.
  const own = OWN_LABELS_JOB[config.platform];
  const existing = findLabelsJob(root, config.platform);
  if (existing) {
    notes.push(`Kept ${existing.file}: it already runs huddle labels, so setup did not add ${own}.`);
    if (existsSync(path.join(root, own))) notes.push(`${own} runs huddle labels too: with both, every event runs the labels job twice. Delete one of them in a PR.`);
    const old = refNote(existing.file, existing.pin, JSON.parse(readFileSync(PLUGIN_JSON, 'utf8')).version);
    if (old) notes.push(old);
  }

  for (const [from, to] of FILES[config.platform]) {
    if (existing && to === own) continue;
    const text = readFileSync(path.join(TEMPLATES, from), 'utf8');
    const current = readIf(path.join(root, to));
    if (current === null) { put(to, text); written.push(to); } else if (current === text) written.push(to);
    else if (lf(current) === lf(text)) { put(to, likeFile(text, current)); written.push(to); } // only the line endings differ (git autocrlf): refresh, keep the file's own
    else skipped.push(to);
  }
  if (skipped.length) notes.push(`Kept as they were (edited by the project): ${skipped.join(', ')}. Delete one and run setup again to get the current template.`);

  if (config.platform === 'gitlab') {
    const ci = readIf(path.join(root, '.gitlab-ci.yml'));
    if (existing) { /* the project's own job is already in its CI: nothing to include */ } else if (ci === null) { put('.gitlab-ci.yml', GITLAB_CI); written.push('.gitlab-ci.yml'); } else if (!/huddle-labels\.gitlab-ci\.yml/.test(ci)) {
      notes.push('Add this to your existing .gitlab-ci.yml (it was not edited): include:\n  - local: huddle-labels.gitlab-ci.yml');
    }
    notes.push('Create a pipeline schedule in CI/CD > Schedules with the cron */10 * * * * on the default branch.');
    notes.push('The AI Manager creates a project access token with the api scope and stores it as the masked, protected CI variable HUDDLE_TOKEN. Never paste the token in a chat or a file.');
  }

  const merge = mergeSettings(readIf(path.join(root, SETTINGS_FILE)));
  if (merge.text === undefined) {
    skipped.push(SETTINGS_FILE);
    notes.push(`${SETTINGS_FILE} was not edited (${merge.reason}). Add this to it by hand: ${JSON.stringify({ extraKnownMarketplaces: { huddle: MARKETPLACE }, enabledPlugins: { [PLUGIN]: true } })}`);
  } else {
    put(SETTINGS_FILE, merge.text);
    written.push(SETTINGS_FILE);
  }

  notes.push('Run `node "${CLAUDE_PLUGIN_ROOT}/bin/huddle" labels` once (the AI Manager login): it creates the status labels and the `design` label of the Design Issue template when they are missing. Setup itself never calls GitHub or GitLab.');

  notes.push('Send every developer both install routes, to do once on their machine, then open a new session. With the claude command, in a terminal: claude plugin marketplace add SrProfessional/Huddle and claude plugin install huddle@huddle. With only the VS Code extension (no claude command in its terminal): type /plugins, add the marketplace SrProfessional/Huddle and install huddle with Install for this project. The .claude/settings.json above only enables the plugin for this project (and, in the CLI, registers the marketplace silently after the folder\'s own trust dialog); it does not install Huddle for anyone.');

  const claude = readIf(path.join(root, 'CLAUDE.md'));
  const block = readFileSync(path.join(TEMPLATES, 'CLAUDE.huddle.md'), 'utf8');
  put('CLAUDE.md', insertBlock(claude, block));
  written.push('CLAUDE.md');
  const claudeMd = claude === null || claude.trim() === '' ? 'created' : hasBlock(claude) ? 'updated' : 'inserted';

  return { written, skipped, changed, claudeMd, notes };
}
