import test from 'node:test';
import assert from 'node:assert/strict';
import { run } from '../../lib/cli/run.mjs';
import { CONFIG, harness } from './harness.mjs';

const COACH = CONFIG.ai_manager;
const CONFIG_DUAL = { ...CONFIG, assignees: [COACH, ...CONFIG.assignees], language: 'es' };
const BODY = '## Depends on\n\n- None\n';

function fixture(tool, { me = COACH, id = 's1' } = {}) {
  const h = harness({
    config: CONFIG_DUAL,
    wrap: (adapter) => ({ ...adapter, me: async () => me }),
    setup: (w) => {
      w.issue({ number: 42, body: BODY, assignees: [COACH], labels: ['in progress'], reviews: [51] });
      w.review({ number: 51, head: 'latest' });
    },
  });
  Object.assign(h.ctx, {
    tool, session: { tool, id }, sharedDir: '/huddle', pluginRoot: '/plugin',
    updateCachePath: '/data/huddle-update.json',
  });
  h.exec = async (...args) => {
    h.out.length = h.err.length = 0;
    return run(args, h.ctx);
  };
  h.hook = async () => {
    assert.equal(await h.exec('hook'), 0);
    return h.text() ? JSON.parse(h.text()) : {};
  };
  return h;
}
const context = (output) => output.hookSpecificOutput?.additionalContext ?? '';

for (const tool of ['claude', 'codex']) {
  test(`${tool}: unspecified role leaves automation idle and supplies a single deferred choice`, async () => {
    const h = fixture(tool);
    assert.equal(await h.exec('queue', '--always'), 0);
    let housekeeping = 0;
    h.ctx.startClean = () => { housekeeping += 1; };
    const start = await h.hook();
    assert.match(context(start), /Coach, Player, Both/);
    assert.match(context(start), /AskUserQuestion|request_user_input/);
    assert.match(context(start), /numbered/);
    assert.match(context(start), /Spanish/);
    assert.doesNotMatch(context(start), /start the watch as|start the watch exactly|huddle take <issue>/);
    assert.equal(housekeeping, 1);
    assert.equal(await h.exec('role', '--asked'), 0);
    assert.match(context(await h.hook()), /already asked/);
  });

  test(`${tool}: explicit roles persist, can change, and are independent between sessions`, async () => {
    const h = fixture(tool);
    const second = fixture(tool, { id: 's2' });
    Object.assign(second.ctx, { readFile: h.ctx.readFile, writeFile: h.ctx.writeFile });
    assert.equal(await h.exec('queue', '--always'), 0);
    assert.equal(await h.exec('role', 'player'), 0);
    assert.equal(await second.exec('role', 'coach'), 0);
    assert.doesNotMatch(context(await h.hook()), /start the watch|AskUserQuestion|request_user_input/);
    assert.match(context(await second.hook()), /start the watch/);
    assert.equal(await h.exec('role', 'both'), 0);
    assert.match(context(await h.hook()), /start the watch/);
    assert.equal(await h.exec('role', '--json'), 0);
    assert.deepEqual(JSON.parse(h.text()), { role: 'both', eligible: ['coach', 'player', 'both'], asked: false });
  });

  test(`${tool}: role intent cannot supply an unavailable authorization`, async () => {
    const h = fixture(tool, { me: 'ana' });
    assert.equal(await h.exec('role', 'coach'), 1);
    assert.equal(await h.exec('role', 'both'), 1);
    assert.equal(await h.exec('queue', '--always'), 1);
    assert.equal(await h.exec('role', 'player'), 0);
    assert.doesNotMatch(context(await h.hook()), /start the watch|waits for the Coach/);
  });
}

test('an explicit role blocks starting the other role’s watches', async () => {
  const h = fixture('codex');
  h.ctx.codexThread = h.ctx.session.id;
  h.ctx.startDetached = () => assert.fail('the incompatible watch must not start');
  assert.equal(await h.exec('role', 'player'), 0);
  assert.equal(await h.exec('queue', '--wait', '--codex'), 1);
  assert.match(h.errText(), /session role/);
  assert.equal(await h.exec('role', 'coach'), 0);
  assert.equal(await h.exec('next', '--wait', '--codex'), 1);
  assert.match(h.errText(), /session role/);
  assert.equal(await h.exec('wait', '42', '--codex'), 1);
  assert.match(h.errText(), /session role/);
});
