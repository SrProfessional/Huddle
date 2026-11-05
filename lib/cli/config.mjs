// Huddle: reads huddle.json (docs/design.md §6) and refuses it, naming the field, when it does not fit huddle.schema.json.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { LABELS } from '../core/issue-status.mjs';
import { validate } from './validate.mjs';

const SCHEMA = JSON.parse(readFileSync(new URL('../../huddle.schema.json', import.meta.url), 'utf8'));

/** The names of the seven status labels, with the renames of `config.labels` applied: { ready: 'ready', ..., changes: '…' }. */
export const labelNames = (config = {}) => ({ ...Object.fromEntries(Object.entries(LABELS).map(([key, l]) => [key, l.name])), ...(config.labels ?? {}) });

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
  return { host: '', assignees: [], default_branch: 'main', ...data };
}
