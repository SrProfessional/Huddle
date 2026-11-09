// Huddle: retries for the platform runners (Issue #52, finding 2). A runner is `(args, { input?, env? }) => stdout`; `withRetry` wraps one.
//
// What is retried, at most 3 tries and 60 s of waiting in all:
//   - a rate limit (HTTP 429, or the words «rate limit» / «too many requests»), always: the call was refused, nothing was done;
//   - a server error (5xx), except for a POST: it may have been done before the answer was lost, and a second one would be a second Issue or comment.
// The wait is the `Retry-After` of the answer when the CLI prints it, else 1 s, then 2 s. A Retry-After that does not fit in what is left of the
// 60 s ends it at once. When a rate limit is still there at the end the error is «rate limited, try again in N s» (code RATE_LIMITED), no command, no stack.
// Only the text after «failed: » is read: before it come the arguments, which hold ids and names, so an Issue 429 is not a rate limit.

import { setTimeout as realSleep } from 'node:timers/promises';

export const RATE_LIMITED = 'RATE_LIMITED';
export const MAX_TRIES = 3;
export const MAX_WAIT_MS = 60_000;

const answerOf = (e) => String(e?.message ?? '').split(' failed: ').slice(1).join(' failed: ');
const isRateLimit = (text) => /\b429\b|rate limit|too many requests/i.test(text);
const isServerError = (text) => /\bHTTP 5\d\d\b|(^|[\s:(])5\d\d (Internal Server Error|Server Error|Bad Gateway|Service Unavailable|Gateway Time-?out)\b|\b(Internal Server Error|Server Error|Bad Gateway|Service Unavailable|Gateway Time-?out)\b/i.test(text);
const retryAfterOf = (text) => {
  const m = /retry-after:?\s*(\d+)/i.exec(text);
  return m ? Number(m[1]) * 1000 : null;
};
/** An `-X POST` in the arguments (`gh api` and `glab api` take the method that way). */
const isPost = (args) => args.some((a, i) => String(a).toUpperCase() === 'POST' && args[i - 1] === '-X');

/** `run`, retried as described above. `sleep(ms)` is injectable so tests never wait. */
export function withRetry(run, { sleep = realSleep, tries = MAX_TRIES, maxWaitMs = MAX_WAIT_MS } = {}) {
  return async (args, opts) => {
    let waited = 0;
    for (let attempt = 1; ; attempt++) {
      try {
        return await run(args, opts);
      } catch (e) {
        const text = answerOf(e);
        const limited = isRateLimit(text);
        if (!limited && !(isServerError(text) && !isPost(args))) throw e;
        const wait = retryAfterOf(text) ?? 1000 * 2 ** (attempt - 1);
        if (attempt >= tries || waited + wait > maxWaitMs) {
          if (!limited) throw e;
          throw Object.assign(new Error(`rate limited, try again in ${Math.ceil(wait / 1000)} s`), { code: RATE_LIMITED, retryAfter: Math.ceil(wait / 1000) });
        }
        waited += wait;
        await sleep(wait);
      }
    }
  };
}
