// Issue #239: the session start never offers a request another session already took.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { run } from '../../lib/cli/run.mjs';
import { harness, request } from './harness.mjs';

const PROMPT = '## Prompt for Claude Code\n\n```text\ndo it\n```';

test('take refuses a request already marked 👀, with its one line, and prints no prompt', async () => {
  const h = harness({ setup: (w) => { w.issue({ number: 5 }); w.comment(5, request(201, { body: PROMPT, taken: true })); } });
  assert.equal(await run(['take', '5'], h.ctx), 1);
  assert.equal(h.text().trim(), 'The Coach\'s request on Issue #5 was already taken (👀) by another session. Nothing to do here.');
});

test('take with nothing pending still prints nothing and exits 0', async () => {
  const h = harness({ setup: (w) => w.issue({ number: 5 }) });
  assert.equal(await run(['take', '5'], h.ctx), 0);
  assert.equal(h.text(), '');
});

test('the hook context tells the session to re-check pending before asking to continue', async () => {
  const h = harness({ setup: (w) => { w.issue({ number: 5, assignees: ['SrProfessional'], labels: ['in progress'] }); w.comment(5, request(202, { body: PROMPT })); } });
  assert.equal(await run(['hook'], h.ctx), 0);
  assert.match(h.text(), /huddle pending <issue>/);
  assert.match(h.text(), /another session took it/);
});

test('the play skill re-checks pending before asking to continue', () => {
  const skill = readFileSync(fileURLToPath(new URL('../../skills/huddle-play/SKILL.md', import.meta.url)), 'utf8');
  assert.match(skill, /huddle" pending <n>` again/);
  assert.match(skill, /another session took it/);
});
