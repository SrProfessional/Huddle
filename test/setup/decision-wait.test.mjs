// Issue #151: a developer's session that stops for a decision keeps waiting for the answer, as it does after opening a PR/MR.
// The adapters get canned answers: no test calls a real GitHub or GitLab.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { run } from '../../lib/cli/run.mjs';
import { harness, request } from '../cli/harness.mjs';

const skill = readFileSync(fileURLToPath(new URL('../../skills/huddle-play/SKILL.md', import.meta.url)), 'utf8');
const section = (from, to) => skill.slice(skill.indexOf(from), to ? skill.indexOf(to) : undefined);

test('«When you cannot go on» starts the wait in the background after the stop message, and says to leave the session open', () => {
  const s = section('## When you cannot go on', '## Who does each step');
  const stop = s.search(/waiting for a\s+decision/);
  const wait = s.search(/bin\/huddle" wait <n>/);
  assert.ok(stop > 0 && wait > stop, 'the wait comes after the stop message');
  assert.match(s, /in the background/);
  assert.match(s, /huddle take <n>|«Continue an Issue»/);
  assert.match(s, /leave the session open/i);
});

test('the dependency stop starts no wait', () => {
  const s = section('## Start an Issue', '## A Design Issue');
  const line = s.split('\n').find((l) => /waiting for #X/.test(l));
  assert.ok(line, 'the dependency stop is there');
  assert.doesNotMatch(line, /huddle" wait/);
});

const QUESTION = { id: 900, author: 'ana', createdAt: '2026-11-05T09:00:00Z', body: '❓ Decision for the AI Manager: Stripe or PayPal?' };

test('wait ends on the AI Manager\'s answer to a decision, and points to huddle take', async () => {
  const h = harness({ setup: (w) => { w.issue({ number: 7, labels: ['needs decision'] }); w.comment(7, QUESTION); w.comment(7, request(901)); } });
  assert.equal(await run(['wait', '7'], h.ctx), 0);
  assert.match(h.text(), /left a request on Issue #7.*huddle take 7/s);
});

test('with only the developer\'s question and no answer, wait keeps waiting', async () => {
  let rounds = 0;
  const stop = new Error('stop the loop');
  const h = harness({
    setup: (w) => { w.issue({ number: 7, labels: ['needs decision'] }); w.comment(7, QUESTION); },
    sleep: async () => { rounds += 1; throw stop; },
  });
  await run(['wait', '7'], h.ctx).catch(() => {}); // the fake sleep ends the loop after one round
  assert.equal(rounds, 1, 'it went back to sleep after one round');
  assert.doesNotMatch(h.text(), /left a request|is finished/);
});
