// Huddle: retries on a rate limit (HTTP 429) and on a server error (5xx), at most 3 tries and 60 s of waiting (Issue #52, finding 2).
// The fakes answer like the real platforms: a 429 with a Retry-After, and a 502. Nothing really waits: `sleep` only records.
import test from 'node:test';
import assert from 'node:assert/strict';
import { withRetry } from '../../lib/platform/retry.mjs';
import { createGitlab } from '../../lib/platform/gitlab.mjs';
import { createGithub } from '../../lib/platform/github.mjs';
import { fakeGitlab } from './fake-glab.mjs';
import { fakeGithub } from './fake-gh.mjs';

const fail = (text) => new Error(`glab api projects/x failed: ${text}`);
/** A runner that answers with each item of `answers` in turn (the last one again and again): an Error is thrown, anything else is returned. */
const runner = (...answers) => {
  const calls = [];
  const run = async (args) => {
    calls.push(args);
    const a = answers[Math.min(calls.length, answers.length) - 1];
    if (a instanceof Error) throw a;
    return a;
  };
  return { run, calls };
};
const setup = (...answers) => {
  const r = runner(...answers);
  const slept = [];
  return { ...r, slept, call: (args = ['api', 'user'], opts) => withRetry(r.run, { sleep: async (ms) => { slept.push(ms); } })(args, opts) };
};

test('a 429 with Retry-After waits that long, then goes on', async () => {
  const t = setup(fail('429 Too Many Requests (Retry-After: 3)'), 'ok');
  assert.equal(await t.call(), 'ok');
  assert.deepEqual(t.slept, [3000]);
  assert.equal(t.calls.length, 2);
});

test('a 429 without Retry-After backs off 1 s, then 2 s', async () => {
  const t = setup(fail('429 Too Many Requests: Rate limit exceeded'), fail('429 Rate limit exceeded'), 'ok');
  assert.equal(await t.call(), 'ok');
  assert.deepEqual(t.slept, [1000, 2000]);
});

test("GitHub's own words for a rate limit count too (secondary rate limit, HTTP 429, HTTP 403 with a limit message)", async () => {
  for (const text of ['gh: You have exceeded a secondary rate limit (HTTP 429)', 'gh: API rate limit exceeded for user ID 1. (HTTP 403)']) {
    const t = setup(new Error(`gh api x failed: ${text}`), 'ok');
    assert.equal(await t.call(), 'ok', text);
    assert.equal(t.slept.length, 1, text);
  }
});

test('a 5xx is retried; a 404 or any other failure is not', async () => {
  for (const text of ['502 Bad Gateway', 'gh: Server Error (HTTP 500)', '503 Service Unavailable', 'gh: Bad Gateway (HTTP 502)']) {
    const t = setup(fail(text), 'ok');
    assert.equal(await t.call(), 'ok', text);
    assert.equal(t.slept.length, 1, text);
  }
  for (const text of ['404 Not Found', '401 Unauthorized', '422 Unprocessable', 'not logged in', 'something 500 happened']) {
    const t = setup(fail(text), 'ok');
    await assert.rejects(t.call(), (e) => e.message.includes(text), text);
    assert.equal(t.calls.length, 1, `${text}: no retry`);
  }
});

test('only the answer is read, never the command: an id of 429 or 502 in the arguments is not a rate limit', async () => {
  const t = setup(new Error('glab api projects/acme%2F502/issues/429 failed: 404 Not Found'), 'ok');
  await assert.rejects(t.call(), /404/);
  assert.equal(t.calls.length, 1);
});

test('it gives up after 3 tries with «rate limited, try again in N s», and no stack, no command', async () => {
  const t = setup(fail('429 Too Many Requests'));
  await assert.rejects(t.call(), (e) => {
    assert.equal(e.code, 'RATE_LIMITED');
    assert.match(e.message, /^rate limited, try again in \d+ s$/);
    return true;
  });
  assert.equal(t.calls.length, 3);
  assert.deepEqual(t.slept, [1000, 2000]);
});

test('the error says the Retry-After of the last answer', async () => {
  const t = setup(fail('429 (Retry-After: 7)'));
  await assert.rejects(t.call(), (e) => e.message === 'rate limited, try again in 7 s');
});

test('it never waits more than 60 s in all: a Retry-After that does not fit ends it at once, saying how long to wait', async () => {
  const long = setup(fail('429 (Retry-After: 120)'), 'ok');
  await assert.rejects(long.call(), /try again in 120 s/);
  assert.deepEqual([long.calls.length, long.slept], [1, []]);

  const two = setup(fail('429 (Retry-After: 40)'), fail('429 (Retry-After: 40)'), 'ok');
  await assert.rejects(two.call(), /try again in 40 s/);
  assert.deepEqual([two.calls.length, two.slept], [2, [40000]], 'the first wait fits (40 s), the second would make 80 s');
  assert.ok(two.slept.reduce((a, b) => a + b, 0) <= 60000);
});

test('a 5xx that never goes away is thrown as it came (it is not a rate limit)', async () => {
  const t = setup(fail('502 Bad Gateway'));
  await assert.rejects(t.call(), (e) => e.code !== 'RATE_LIMITED' && /502 Bad Gateway/.test(e.message));
  assert.equal(t.calls.length, 3);
});

test('a POST is retried on a 429 (nothing was done) but not on a 5xx (it may have been done: no second Issue or comment)', async () => {
  const post = ['api', '-X', 'POST', 'repos/a/b/issues'];
  const limited = setup(fail('429 (Retry-After: 1)'), 'ok');
  assert.equal(await limited.call(post), 'ok');
  assert.equal(limited.calls.length, 2);
  const broken = setup(fail('502 Bad Gateway'), 'ok');
  await assert.rejects(broken.call(post), /502/);
  assert.equal(broken.calls.length, 1);
  const put = setup(fail('502 Bad Gateway'), 'ok');
  assert.equal(await put.call(['api', '-X', 'PUT', 'projects/x']), 'ok', 'a PUT can be repeated');
});

test('it passes the input and the options on to the runner each time', async () => {
  const seen = [];
  const run = async (args, opts) => { seen.push([args, opts]); if (seen.length === 1) throw fail('429 (Retry-After: 1)'); return 'ok'; };
  await withRetry(run, { sleep: async () => {} })(['api', 'x'], { input: '{}', env: { A: '1' } });
  assert.deepEqual(seen[1], [['api', 'x'], { input: '{}', env: { A: '1' } }]);
});

test('[gitlab] the adapter retries through its runner: a fake glab that answers 429 with Retry-After twice, then works', async () => {
  const fake = fakeGitlab();
  const slept = [];
  const adapter = createGitlab({ project: 'acme/app' }, { run: fake.run, sleep: async (ms) => { slept.push(ms); } });
  fake.world.rateLimit(2, 2);
  assert.equal(await adapter.me(), 'SrProfessional');
  assert.deepEqual(slept, [2000, 2000]);
  fake.world.rateLimit(5, 30);
  await assert.rejects(adapter.me(), (e) => e.message === 'rate limited, try again in 30 s');
});

test('[github] the adapter retries through its runner: a fake gh that answers a secondary rate limit, then works', async () => {
  const fake = fakeGithub();
  const slept = [];
  const adapter = createGithub({ project: 'acme/app' }, { run: fake.run, sleep: async (ms) => { slept.push(ms); } });
  fake.world.rateLimit(1, 4);
  assert.equal(await adapter.me(), 'SrProfessional');
  assert.deepEqual(slept, [4000]);
  fake.world.failWhen(() => true, 'gh: Bad Gateway (HTTP 502)', 1);
  assert.equal(await adapter.me(), 'SrProfessional');
  assert.equal(slept.length, 2);
});
