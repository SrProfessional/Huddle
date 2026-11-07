// Issue #41: the real runners keep the spawn error's code (ENOENT) on the error they reject with, and keep their message.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { ghRunner } from '../../lib/platform/github.mjs';
import { glabRunner } from '../../lib/platform/gitlab.mjs';

/** Runs `fn` with a PATH that holds no program, so `gh` and `glab` cannot be started. No network, no real GitHub or GitLab. */
async function withEmptyPath(fn) {
  const dir = mkdtempSync(path.join(tmpdir(), 'huddle-empty-path-'));
  const saved = { ...process.env };
  const dropPath = () => { for (const k of Object.keys(process.env)) if (k.toLowerCase() === 'path') delete process.env[k]; };
  dropPath();
  process.env.PATH = dir;
  try { return await fn(); } finally {
    dropPath();
    Object.assign(process.env, saved);
    rmSync(dir, { recursive: true, force: true });
  }
}

for (const [cli, runner] of [['gh', ghRunner], ['glab', glabRunner]]) {
  test(`[${cli}] the real runner keeps code ENOENT when the program is missing, and the message stays «${cli} <args> failed: …»`, async () => {
    await withEmptyPath(async () => {
      await assert.rejects(() => runner(['auth', 'status']), (e) => {
        assert.equal(e.code, 'ENOENT');
        assert.match(e.message, new RegExp(`^${cli} auth status failed: .*ENOENT`));
        return true;
      });
    });
  });
}
