// Issue #211: one watch per repo on the machine, whatever the tool. The watch's files live in a tool-neutral folder (~/.huddle), the old
// folder still counts, and a second session does not start a second watch while the first one holds it. Canned adapter only.
import test from 'node:test';
import assert from 'node:assert/strict';
import { run, labelsFiles } from '../../lib/cli/run.mjs';
import { harness } from './harness.mjs';

const MANAGED = '## Depends on\n\n- None\n';
const OLD = '/claude-data/huddle-update.json';
/** A Coach harness whose watch loop stops after one round; `session` is who runs it. */
function mk({ session = { tool: 'claude', id: 'S1' }, clock = { t: Date.parse('2026-11-20T20:00:00Z') }, setup } = {}) {
  let n = 0;
  const h = harness({ setup: setup ?? ((w) => w.issue({ number: 5, body: MANAGED })), wrap: (a) => ({ ...a, me: async () => 'SrProfessional' }), sleep: async () => { n += 1; if (n >= 1) throw new Error('stop'); } });
  Object.assign(h.ctx, { updateCachePath: OLD, sharedDir: '/home/.huddle', session, now: () => clock.t });
  return h;
}
const share = (from, to) => { to.ctx.readFile = from.ctx.readFile; to.ctx.writeFile = from.ctx.writeFile; return to; }; // one machine: the same files

test('the watch files live in the shared folder, and an «always» left in the old folder still counts', async () => {
  const h = mk();
  assert.match(labelsFiles(h.ctx).watchAlways.replaceAll('\\', '/'), /^\/home\/\.huddle\//);
  const old = labelsFiles({ ...h.ctx, sharedDir: undefined }).watchAlways;
  h.ctx.writeFile(old, '1');
  h.out.length = 0;
  assert.equal(await run(['status', '--json'], h.ctx), 0);
  assert.equal(JSON.parse(h.text()).heartbeats?.watch?.always ?? JSON.parse(h.text()).watch?.always, true);
});

test('a second session does not start a second watch while the first holds it, and says where it runs', async () => {
  const clock = { t: Date.parse('2026-11-20T20:00:00Z') };
  const claude = mk({ clock });
  await run(['queue', '--wait', '300'], claude.ctx).catch(() => {});
  const codex = share(claude, mk({ clock, session: { tool: 'codex', id: 'T9' } }));
  assert.equal(await run(['queue', '--wait', '300'], codex.ctx), 1);
  assert.match(codex.text(), /The watch already runs in Claude Code \(another session\), last check .* ago: this session does not start a second one\./);
});

test('the owner keeps the watch while it reviews (up to 45 minutes after it returned items), then another session may take it', async () => {
  const clock = { t: Date.parse('2026-11-20T20:00:00Z') };
  const claude = mk({ clock, setup: (w) => { w.issue({ number: 42, body: MANAGED, assignees: ['ana'], reviews: [51] }); w.review({ number: 51, head: 'aaa' }); } });
  assert.equal(await run(['queue', '--wait', '300'], claude.ctx), 0, 'items wait: it returns them to its session');
  clock.t += 30 * 60 * 1000; // 30 minutes later, the Claude session is still reviewing: its heartbeat is old, but it holds the watch
  const codex = share(claude, mk({ clock, session: { tool: 'codex', id: 'T9' } }));
  assert.equal(await run(['queue', '--wait', '300'], codex.ctx), 1);
  assert.match(codex.text(), /Another session \(Claude Code\) took PR #51 to review 30 minutes ago and has not checked since/); // Issue #222
  clock.t += 20 * 60 * 1000; // 50 minutes: the Claude session is gone
  const later = share(claude, mk({ clock, session: { tool: 'codex', id: 'T9' } }));
  await run(['queue', '--wait', '300'], later.ctx).catch(() => {});
  assert.doesNotMatch(later.text(), /already runs/);
});

test('the same session restarts its own watch freely, and --wait-off from any session frees it', async () => {
  const clock = { t: Date.parse('2026-11-20T20:00:00Z') };
  const claude = mk({ clock });
  await run(['queue', '--wait', '300'], claude.ctx).catch(() => {});
  const again = share(claude, mk({ clock }));
  await run(['queue', '--wait', '300'], again.ctx).catch(() => {});
  assert.doesNotMatch(again.text(), /already runs/);
  const codex = share(claude, mk({ clock, session: { tool: 'codex', id: 'T9' } }));
  assert.equal(await run(['queue', '--wait-off'], codex.ctx), 0);
  const codex2 = share(claude, mk({ clock, session: { tool: 'codex', id: 'T9' } }));
  await run(['queue', '--wait', '300'], codex2.ctx).catch(() => {});
  assert.doesNotMatch(codex2.text(), /already runs/);
});

test('huddle status names the tool of the running watch', async () => {
  const clock = { t: Date.parse('2026-11-20T20:00:00Z') };
  const codex = mk({ clock, session: { tool: 'codex', id: 'T9' } });
  await run(['queue', '--wait', '300'], codex.ctx).catch(() => {});
  codex.out.length = 0;
  assert.equal(await run(['status'], codex.ctx), 0);
  assert.match(codex.text(), /watch.*on, in Codex, last check/);
});
