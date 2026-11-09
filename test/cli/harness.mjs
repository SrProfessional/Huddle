// Test harness for the CLI: runs `run(argv, ctx)` against the in-memory fake `gh` (or, with `gitlab: true`, the fake `glab`),
// with a huddle.json held in memory. Never starts a process.
import { fakeGithub } from '../platform/fake-gh.mjs';
import { fakeGitlab } from '../platform/fake-glab.mjs';
import { createGithub } from '../../lib/platform/github.mjs';
import { createGitlab } from '../../lib/platform/gitlab.mjs';

export const CONFIG = { platform: 'github', project: 'acme/app', ai_manager: 'SrProfessional', assignees: ['ana', 'luis'], max_open_per_person: 2 };
export const GITLAB_CONFIG = { ...CONFIG, platform: 'gitlab' };

export function harness({ config, gitlab = false, file, wrap = (a) => a, sleep = async () => {}, setup } = {}) {
  config ??= gitlab ? GITLAB_CONFIG : CONFIG;
  const fake = gitlab ? fakeGitlab() : fakeGithub();
  const create = gitlab ? createGitlab : createGithub;
  setup?.(fake.world);
  const out = [];
  const err = [];
  const files = new Map();
  const writes = [];
  const slept = []; // the waits the adapter asked for (a retry after a rate limit), in ms: none of them really waits
  if (file !== null) files.set('/repo/huddle.json', file ?? JSON.stringify(config));
  const ctx = {
    root: '/repo',
    readFile: (p) => files.get(p.replaceAll('\\', '/')) ?? null,
    writeFile: (p, text) => { files.set(p.replaceAll('\\', '/'), text); writes.push(text); },
    createPlatform: async (cfg) => wrap(create(cfg, { run: fake.run, sleep: async (ms) => { slept.push(ms); await sleep(ms); } }), fake),
    out: (s) => out.push(s),
    err: (s) => err.push(s),
    sleep,
    hookTimeoutMs: 2000,
  };
  return { ctx, world: fake.world, out, err, writes, slept, calls: () => fake.world.calls?.() ?? [], huddleJson: () => files.get('/repo/huddle.json'), text: () => out.join('\n'), errText: () => err.join('\n') };
}

export const request = (id, extra = {}) => ({ id, author: 'SrProfessional', createdAt: '2026-11-05T10:00:00Z', body: '## Prompt for Claude Code\n\n```text\nDo the thing\n```', ...extra });
