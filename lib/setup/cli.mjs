#!/usr/bin/env node
// Huddle: command line of `setup`, used by the huddle-setup skill. Works in the current folder and prints a JSON report.
//   node lib/setup/cli.mjs --platform github|gitlab --project owner/repo --ai-manager login [--host h] [--assignees a,b]
//                          [--max-open N] [--default-branch main]
import { setup } from './index.mjs';

const FLAGS = { '--platform': 'platform', '--host': 'host', '--project': 'project', '--ai-manager': 'ai_manager', '--assignees': 'assignees', '--max-open': 'max_open_per_person', '--default-branch': 'default_branch' };

export function parseArgs(argv) {
  const answers = {};
  for (let i = 0; i < argv.length; i += 2) {
    const key = FLAGS[argv[i]];
    if (!key || argv[i + 1] === undefined) throw new Error(`Unknown or incomplete option "${argv[i]}". Options: ${Object.keys(FLAGS).join(' ')}`);
    const v = argv[i + 1];
    answers[key] = key === 'assignees' ? v.split(',').map((s) => s.trim()).filter(Boolean) : key === 'max_open_per_person' ? Number(v) : v;
  }
  return answers;
}

try {
  console.log(JSON.stringify(setup(process.cwd(), parseArgs(process.argv.slice(2))), null, 2));
} catch (e) {
  console.error(`huddle-setup: ${e.message}`);
  process.exitCode = 1;
}
