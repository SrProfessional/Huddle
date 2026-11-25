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
    wrap: (adapter) => ({ ...adapter, me: typeof me === 'function' ? me : async () => me }),
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
    const h = fixture(tool, { id: 'previous-coach-session' });
    assert.equal(await h.exec('role', 'coach'), 0);
    assert.equal(await h.exec('queue', '--always'), 0);
    h.ctx.session = { tool, id: 'fresh-session' };
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
    assert.equal(await second.exec('role', 'coach'), 0);
    assert.equal(await second.exec('queue', '--always'), 0);
    assert.equal(await h.exec('role', 'player'), 0);
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

test('a fresh identifiable session cannot start either watch or a per-Issue wait', async () => {
  const h = fixture('codex');
  h.ctx.codexThread = h.ctx.session.id;
  const started = [];
  h.ctx.startDetached = (args) => { started.push(args); return 123; };
  for (const args of [['queue', '--wait', '--codex'], ['next', '--wait', '--codex'], ['wait', '42', '--codex']]) {
    assert.equal(await h.exec(...args), 1);
    assert.match(h.errText(), /session role/);
  }
  assert.deepEqual(started, []);

  assert.equal(await h.exec('role', 'both'), 0);
  assert.equal(await h.exec('queue', '--wait', '--codex'), 0);
  assert.equal(await h.exec('next', '--wait', '--codex'), 0);
  assert.equal(await h.exec('wait', '42', '--codex'), 0);
  assert.deepEqual(started.map(([name]) => name), ['queue', 'next', 'wait']);
});

test('label assignment in an identifiable session requires both a chosen Coach role and the current Coach login', async () => {
  let login = COACH;
  const h = fixture('claude', { me: async () => login });
  h.world.issue({ number: 43, body: BODY });
  assert.equal(await h.exec('labels', '--dry-run'), 0);
  assert.doesNotMatch(h.text(), /#43 assigned to/);

  assert.equal(await h.exec('role', 'coach'), 0);
  assert.equal(await h.exec('labels', '--dry-run'), 0);
  assert.match(h.text(), /#43 assigned to/);
  assert.equal(await h.exec('labels', '--dry-run', '--no-assign'), 0);
  assert.doesNotMatch(h.text(), /#43 assigned to/);

  login = 'ana';
  assert.equal(await h.exec('labels', '--dry-run'), 0);
  assert.doesNotMatch(h.text(), /#43 assigned to/);
  assert.equal(await h.exec('queue', '--wait-off'), 1);
});

test('a sessionless labels job may still assign work under the existing service rules', async () => {
  const h = fixture('claude', { id: null, me: 'ana' });
  h.world.issue({ number: 43, body: BODY });
  assert.equal(await h.exec('labels', '--dry-run'), 0);
  assert.match(h.text(), /#43 assigned to/);
});

test('a saved Player selection needs an eligible current login before starting waits', async () => {
  let login = COACH;
  const h = fixture('codex', { me: async () => login });
  h.ctx.codexThread = h.ctx.session.id;
  const started = [];
  h.ctx.startDetached = (args) => { started.push(args); return 123; };
  assert.equal(await h.exec('role', 'player'), 0);
  login = 'outside-team';
  assert.equal(await h.exec('next', '--wait', '--codex'), 1);
  assert.equal(await h.exec('wait', '42', '--codex'), 1);
  assert.deepEqual(started, []);
});
