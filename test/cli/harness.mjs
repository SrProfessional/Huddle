// Test harness for the CLI: runs `run(argv, ctx)` against the in-memory fake `gh`, with a huddle.json held in memory. Never starts a process.
import { fakeGithub } from '../platform/fake-gh.mjs';
import { createGithub } from '../../lib/platform/github.mjs';

export const CONFIG = { platform: 'github', project: 'acme/app', ai_manager: 'SrProfessional', assignees: ['ana', 'luis'], max_open_per_person: 2 };

export function harness({ config = CONFIG, file, wrap = (a) => a, sleep = async () => {}, setup } = {}) {
  const fake = fakeGithub();
  setup?.(fake.world);
  const out = [];
  const err = [];
  const files = new Map();
  if (file !== null) files.set('/repo/huddle.json', file ?? JSON.stringify(config));
  const ctx = {
    root: '/repo',
    readFile: (p) => files.get(p.replaceAll('\\', '/')) ?? null,
    createPlatform: async (cfg) => wrap(createGithub(cfg, { run: fake.run }), fake),
    out: (s) => out.push(s),
    err: (s) => err.push(s),
    sleep,
    hookTimeoutMs: 2000,
  };
  return { ctx, world: fake.world, out, err, text: () => out.join('\n'), errText: () => err.join('\n') };
}

export const request = (id, extra = {}) => ({ id, author: 'SrProfessional', createdAt: '2026-11-05T10:00:00Z', body: '## Prompt for Claude Code\n\n```text\nDo the thing\n```', ...extra });
