import test from 'node:test';
import assert from 'node:assert/strict';
import { run } from '../../lib/cli/run.mjs';
import { harness } from '../cli/harness.mjs';

test('usage --json prints only the login and numeric usage rows, and --since filters days', async () => {
  const h = harness();
  h.ctx.collectUsage = () => [
    { day: '2026-11-19', tool: 'Codex', model: 'gpt-5', issue: 229, input: 1, output: 2, cacheRead: 3, cacheWrite: 4, reasoning: 5 },
    { day: '2026-11-20', tool: 'Claude Code', model: 'claude', issue: 'no Issue', input: 6, output: 7, cacheRead: 8, cacheWrite: 9, reasoning: 0 },
  ];
  assert.equal(await run(['usage', '--json', '--since', '2026-11-20'], h.ctx), 0);
  assert.deepEqual(JSON.parse(h.text()), { person: 'SrProfessional', rows: [{ day: '2026-11-20', tool: 'Claude Code', model: 'claude', issue: 'no Issue', input: 6, output: 7, cacheRead: 8, cacheWrite: 9, reasoning: 0 }] });
});
