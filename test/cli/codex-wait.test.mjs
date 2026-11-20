// Issue #201: in OpenAI Codex the wait runs as a process of its own and, when the Coach answers, queues a message into the Codex session
// (`codex queue --thread <id>`). Seen on 2026-11-20: an open Codex chat in VS Code takes a queued message and answers it by itself.
import test from 'node:test';
import assert from 'node:assert/strict';
import { run } from '../../lib/cli/run.mjs';
import { findCodex } from '../../lib/cli/main.mjs';
import { harness } from './harness.mjs';

const request = (id) => ({ id, author: 'SrProfessional', body: '## Prompt for Claude Code\n\n```text\nFix the test.\n```', createdAt: '2026-11-20T10:00:00Z' });

test('wait --codex starts the wait as a process of its own with the session id, and returns at once', async () => {
  const started = [];
  const h = harness({ setup: (w) => w.issue({ number: 5 }) });
  h.ctx.codexThread = '01a1f96b-33ef';
  h.ctx.startDetached = (args) => started.push(args);
  assert.equal(await run(['wait', '5', '--codex'], h.ctx), 0);
  assert.deepEqual(started, [['wait', '5', '--codex-thread', '01a1f96b-33ef']]);
  assert.match(h.text(), /waits in the background/);
});

test('wait --codex outside a Codex session says so and starts nothing', async () => {
  const started = [];
  const h = harness({ setup: (w) => w.issue({ number: 5 }) });
  h.ctx.codexThread = null;
  h.ctx.startDetached = (args) => started.push(args);
  assert.equal(await run(['wait', '5', '--codex'], h.ctx), 1);
  assert.deepEqual(started, []);
  assert.match(h.errText?.() ?? h.text(), /CODEX_THREAD_ID/);
});

test('the detached wait queues «run $huddle-play <n>» into the Codex session when the Coach answers', async () => {
  const queued = [];
  const h = harness({ setup: (w) => { w.issue({ number: 5 }); w.comment(5, request(501)); } });
  h.ctx.codexQueue = (thread, message) => { queued.push({ thread, message }); };
  assert.equal(await run(['wait', '5', '--codex-thread', 'T1'], h.ctx), 0);
  assert.equal(queued.length, 1);
  assert.equal(queued[0].thread, 'T1');
  assert.match(queued[0].message, /\$huddle-play 5/);
});

test('the detached wait keeps its interval argument', async () => {
  const waits = [];
  const h = harness({ setup: (w) => w.issue({ number: 5 }), sleep: async (ms) => { waits.push(ms); h.world.comment(5, request(502)); } });
  h.ctx.codexQueue = () => {};
  await run(['wait', '5', '60', '--codex-thread', 'T1'], h.ctx);
  assert.deepEqual(waits, [60000]);
});

test('findCodex: the codex on the PATH first, else the newest one bundled with a VS Code extension', () => {
  const dirs = {
    'H/.vscode/extensions': ['openai.chatgpt-26.1003.1-win32-x64', 'openai.chatgpt-26.1117.31558-win32-x64', 'other.ext-1.0.0'],
    'H/.vscode/extensions/openai.chatgpt-26.1117.31558-win32-x64/bin': ['windows-x86_64'],
    'H/.vscode/extensions/openai.chatgpt-26.1003.1-win32-x64/bin': ['windows-x86_64'],
  };
  const fsx = { readdir: (d) => { if (!dirs[d]) throw new Error('ENOENT'); return dirs[d]; }, exists: (f) => /codex\.exe$/.test(f) };
  assert.equal(findCodex({ home: 'H', platform: 'win32', onPath: () => 'C:/tools/codex.exe', ...fsx }), 'C:/tools/codex.exe');
  // An npm shim (codex.cmd) cannot run without a shell, which would not quote the message: the bundled binary is used instead.
  assert.equal(findCodex({ home: 'H', platform: 'win32', onPath: () => 'C:/npm/codex.cmd', ...fsx }), 'H/.vscode/extensions/openai.chatgpt-26.1117.31558-win32-x64/bin/windows-x86_64/codex.exe');
  assert.equal(findCodex({ home: 'H', platform: 'win32', onPath: () => null, ...fsx }), 'H/.vscode/extensions/openai.chatgpt-26.1117.31558-win32-x64/bin/windows-x86_64/codex.exe');
  assert.equal(findCodex({ home: 'H', platform: 'win32', onPath: () => null, readdir: () => { throw new Error('ENOENT'); }, exists: () => false }), null);
});
