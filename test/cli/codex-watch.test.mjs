// Issue #212: the Coach's watch in OpenAI Codex. `queue --wait --codex` starts the watch as a process of its own tagged with the Codex
// session and returns at once; when something waits, that process queues a message into the Codex chat. «always» works in Codex too.
import test from 'node:test';
import assert from 'node:assert/strict';
import { run } from '../../lib/cli/run.mjs';
import { harness } from './harness.mjs';

const MANAGED = '## Depends on\n\n- None\n';
function mk({ setup, session = { tool: 'codex', id: 'T9' }, rounds = 1 } = {}) {
  let n = 0;
  const h = harness({ setup: setup ?? ((w) => w.issue({ number: 5, body: MANAGED })), wrap: (a) => ({ ...a, me: async () => 'SrProfessional' }), sleep: async () => { n += 1; if (n >= rounds) throw new Error('stop'); } });
  Object.assign(h.ctx, { updateCachePath: '/data/huddle-update.json', sharedDir: '/home/.huddle', session, codexThread: session.tool === 'codex' ? session.id : null, now: () => Date.parse('2026-11-20T21:00:00Z') });
  return h;
}
const review = (w) => { w.issue({ number: 42, title: 'Add login form', body: MANAGED, assignees: ['ana'], reviews: [51] }); w.review({ number: 51, head: 'aaa' }); };

test('queue --wait --codex starts the watch as a process of its own with the session, and returns at once', async () => {
  const started = [];
  const h = mk();
  h.ctx.startDetached = (args) => started.push(args);
  assert.equal(await run(['queue', '--wait', '300', '--seen', '51@x', '--codex'], h.ctx), 0);
  assert.deepEqual(started, [['queue', '--wait', '300', '--seen', '51@x', '--codex-thread', 'T9']]);
  assert.match(h.text(), /watch waits in the background/);
});

test('queue --wait --codex refuses outside Codex, and with no network', async () => {
  const h = mk({ session: { tool: 'claude', id: 'S1' } });
  h.ctx.startDetached = () => assert.fail('nothing starts');
  assert.equal(await run(['queue', '--wait', '300', '--codex'], h.ctx), 1);
  assert.match(h.errText(), /CODEX_THREAD_ID/);
  const n = mk();
  n.ctx.codexNoNetwork = true;
  n.ctx.startDetached = () => assert.fail('nothing starts');
  assert.equal(await run(['queue', '--wait', '300', '--codex'], n.ctx), 1);
  assert.match(n.errText(), /no network/);
});

test('the detached watch queues a message into the Codex chat when something waits', async () => {
  const queued = [];
  const h = mk({ setup: review });
  h.ctx.codexQueue = (thread, message) => queued.push({ thread, message });
  assert.equal(await run(['queue', '--wait', '300', '--codex-thread', 'T9'], h.ctx), 0);
  assert.equal(queued.length, 1);
  assert.equal(queued[0].thread, 'T9');
  assert.match(queued[0].message, /Huddle's watch: 1 item waits for the Coach.*\$huddle-watch/);
});

test('in Codex, «always» asks the session to start the watch the Codex way', async () => {
  const h = mk();
  h.ctx.tool = 'codex';
  h.ctx.pluginRoot = '/plugin';
  assert.equal(await run(['role', 'coach'], h.ctx), 0);
  assert.equal(await run(['queue', '--always'], h.ctx), 0);
  h.out.length = 0;
  assert.equal(await run(['hook'], h.ctx), 0);
  const ctxText = JSON.parse(h.text()).hookSpecificOutput.additionalContext;
  assert.match(ctxText, /start the watch/);
  assert.match(ctxText, /--codex/);
});

test('in Codex, «always» names the session that already holds the watch and does not ask to start it', async () => {
  const claude = mk({ session: { tool: 'claude', id: 'S1' } });
  await run(['queue', '--always'], claude.ctx);
  await run(['queue', '--wait', '300'], claude.ctx).catch(() => {});
  const codex = mk();
  codex.ctx.readFile = claude.ctx.readFile;
  codex.ctx.writeFile = claude.ctx.writeFile;
  codex.ctx.tool = 'codex';
  codex.ctx.pluginRoot = '/plugin';
  assert.equal(await run(['role', 'coach'], codex.ctx), 0);
  assert.equal(await run(['hook'], codex.ctx), 0);
  const out = JSON.parse(codex.text());
  assert.doesNotMatch(out.hookSpecificOutput?.additionalContext ?? '', /start the watch exactly/);
  assert.match(out.systemMessage ?? '', /already runs in Claude Code/);
});
