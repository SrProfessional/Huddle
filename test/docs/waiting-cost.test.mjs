// Issue #138: the README, the guides, the PDF sources and the website say what waiting costs. The Player's waiting session
// uses no Claude tokens and no GitHub Actions or CI minutes; /huddle-watch is turned on by hand in each session and each check uses tokens.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const read = (f) => readFileSync(fileURLToPath(new URL(`../../${f}`, import.meta.url)), 'utf8').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ');

const WAIT = ['README.md', 'docs/team-guide.md', 'docs/first-day.md', 'docs/pdf/src/guide.html', 'docs/pdf/src/first-day.html', 'site/how-it-works/index.html', 'site/get-started/index.html'];
const WATCH = ['README.md', 'docs/team-guide.md', 'docs/pdf/src/guide.html', 'site/how-it-works/index.html'];

for (const f of WAIT) {
  test(`${f}: the waiting session uses no Claude tokens and no GitHub Actions or CI minutes`, () => {
    const t = read(f);
    assert.match(t, /no Claude tokens/, 'no Claude tokens');
    assert.match(t, /no GitHub Actions or CI minutes/, 'no GitHub Actions or CI minutes');
  });
}

for (const f of WATCH) {
  // Issue #157: the watch waits in the background like a Player's session, so it no longer spends a Claude turn per check.
  test(`${f}: /huddle-watch is turned on by hand in each session, and uses no Claude tokens while nothing waits`, () => {
    const t = read(f);
    assert.match(t, /turned on by hand in each session/);
    assert.match(t, /no Claude tokens while nothing waits/i);
    assert.doesNotMatch(t, /each check is a short Claude turn|expires after 7 days/i);
  });
}

for (const f of ['README.md', 'docs/team-guide.md', 'docs/pdf/src/guide.html', 'site/how-it-works/index.html']) {
  test(`${f}: the Coach's session start says what waits`, () => {
    assert.match(read(f), /session start says what waits/i);
  });
}

for (const f of ['site/index.html', 'site/get-started/index.html']) {
  test(`${f} names /huddle-watch`, () => assert.match(read(f), /\/huddle-watch/));
}
