// Issue #318: a circle of interrupted Issues across two logins is broken (the lower number holds, the other waits and the output says so), and a foreign
// holder that carries `needs decision` holds no file in `huddle next`. Canned adapters for GitHub and GitLab (two logins), no real call.
import test from 'node:test';
import assert from 'node:assert/strict';
import { run } from '../../lib/cli/run.mjs';
import { harness } from '../cli/harness.mjs';

const MIN = 60 * 1000;
const T0 = Date.parse('2026-11-22T12:00:00Z');
const body = (branch, files) => `## Depends on\n\n- None\n\n## Effort\n\n1\n\n## Branch\n\n\`${branch}\`\n\n## Allowed files\n\n${files.map((f) => `- \`${f}\``).join('\n')}\n`;
// Local git as this machine has it: commits ahead of the base, the last one hours ago (so the worker is gone).
const git = (args) => {
  const line = args.join(' ');
  if (/^rev-list --count /.test(line)) return '3\n';
  if (/^log -1 --format=%ct /.test(line)) return `${Math.floor((T0 - 3 * 60 * MIN) / 1000)}\n`;
  return '';
};
const as = (login, setup, gitlab) => {
  const h = harness({ gitlab, setup, wrap: (a) => ({ ...a, me: async () => login }) });
  Object.assign(h.ctx, { updateCachePath: '/data/u.json', sharedDir: '/home/.huddle', session: { tool: 'claude', id: 'S2' }, pid: 200, isAlive: () => true, now: () => T0, git });
  return h;
};
const nextOf = async (h) => { assert.equal(await run(['next', '--json'], h.ctx), 0, h.errText()); return JSON.parse(h.text()); };

for (const gitlab of [false, true]) {
  const on = gitlab ? 'GitLab' : 'GitHub';
  const circle = (w) => {
    w.issue({ number: 21, title: 'Ana work', body: body('h21-ana', ['scene.unity']), assignees: ['ana'], labels: ['in progress'] });
    w.issue({ number: 22, title: 'Luis work', body: body('h22-luis', ['scene.unity']), assignees: ['luis'], labels: ['in progress'] });
  };

  test(`${on}: two interrupted Issues of two logins with the same file: the lower number resumes, the other waits, and the output says so`, async () => {
    const ana = await nextOf(as('ana', circle, gitlab));
    assert.deepEqual(ana.resume.map((r) => r.issue), [21], 'the lower number holds and resumes');
    assert.ok(ana.crossLoginCircles?.some((t) => /#22 waits for #21, which runs for ana/.test(t) && /lower number/.test(t)), JSON.stringify(ana.crossLoginCircles));
    const luis = await nextOf(as('luis', circle, gitlab));
    assert.deepEqual(luis.resume, [], 'the higher number waits for the other login\'s Issue');
    assert.match(luis.wait.find((w) => w.issue === 22).why, /#21/);
  });

  test(`${on}: the text of next says a plainly active foreign Issue waits, with no circle`, async () => {
    const h = as('ana', circle, gitlab);
    assert.equal(await run(['next'], h.ctx), 0, h.errText());
    assert.match(h.text(), /#22 waits for #21, which runs for ana/);
    assert.doesNotMatch(h.text(), /circle/);
  });

  test(`${on}: with no file in common nothing changes, and a foreign Issue with a lower number still holds the higher one`, async () => {
    const apart = (w) => {
      w.issue({ number: 21, title: 'Ana work', body: body('h21-ana', ['a.mjs']), assignees: ['ana'], labels: ['in progress'] });
      w.issue({ number: 22, title: 'Luis work', body: body('h22-luis', ['b.mjs']), assignees: ['luis'], labels: ['in progress'] });
    };
    const r = await nextOf(as('ana', apart, gitlab));
    assert.deepEqual(r.resume.map((x) => x.issue), [21]);
    assert.equal(r.crossLoginCircles, undefined);
    const luis = await nextOf(as('luis', circle, gitlab));
    assert.equal(luis.crossLoginCircles, undefined, 'no circle is told on the side that waits');
  });

  test(`${on}: a foreign «in progress» Issue that also carries needs decision holds no file in next`, async () => {
    const world = (labels) => (w) => {
      w.issue({ number: 1, title: 'Luis stopped', body: body('h1-luis', ['scene.unity']), assignees: ['luis'], labels });
      w.issue({ number: 2, title: 'Ana next', body: body('h2-ana', ['scene.unity']), assignees: ['ana'], labels: ['assigned'] });
    };
    const held = await nextOf(as('ana', world(['in progress']), gitlab));
    assert.deepEqual(held.start, [], 'a plain active holder still holds');
    const stopped = await nextOf(as('ana', world(['in progress', 'needs decision']), gitlab));
    assert.deepEqual(stopped.start.map((x) => x.issue), [2], 'a holder that waits for a decision holds nothing');
  });
}

test('yields: only an interrupted Issue gives way, and only to another login\'s higher number', async () => {
  const { yields, crossLoginCircles } = await import('../../lib/core/schedule.mjs');
  assert.equal(yields({ number: 1, interrupted: true }, { number: 2, forLogin: 'luis' }), true);
  assert.equal(yields({ number: 3, interrupted: true }, { number: 2, forLogin: 'luis' }), false, 'a lower foreign number still holds');
  assert.equal(yields({ number: 1 }, { number: 2, forLogin: 'luis' }), false, 'not interrupted');
  assert.equal(yields({ number: 1, interrupted: true }, { number: 2 }), false, 'same login');
  const f = (n) => body(`h${n}`, ['x.mjs']);
  const [plain] = crossLoginCircles({ mine: [{ number: 1, interrupted: true, body: f(1) }], foreign: [{ number: 2, forLogin: 'luis', body: f(2) }], login: 'ana' });
  assert.match(plain, /^#2 waits for #1, which runs for ana/);
  assert.doesNotMatch(plain, /circle/);
  const [two] = crossLoginCircles({ mine: [{ number: 1, interrupted: true, body: f(1) }], foreign: [{ number: 2, forLogin: 'luis', interrupted: true, body: f(2) }], login: 'ana' });
  assert.equal(two, 'interrupted in a circle across logins: #1 (ana) and #2 (luis) share x.mjs; #1 goes first (the lower number), #2 waits for it');
  assert.deepEqual(crossLoginCircles({ mine: [{ number: 1, interrupted: true, body: f(1) }], foreign: [{ number: 2, forLogin: 'luis', body: body('h2', ['y.mjs']) }], login: 'ana' }), [], 'no shared file');
  assert.equal(crossLoginCircles({ mine: [{ number: 1, interrupted: true, body: f(1) }], foreign: [{ number: 2, forLogin: 'luis', body: f(2) }], login: 'ana' }).length, 1);
});
