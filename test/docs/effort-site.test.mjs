// Issue #171: the website and the PDF guides say effort, capacity and the parallel work of 0.9 (docs/design.md §24).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const read = (rel) => readFileSync(fileURLToPath(new URL(`../../${rel}`, import.meta.url)), 'utf8').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ');
const raw = (rel) => readFileSync(fileURLToPath(new URL(`../../${rel}`, import.meta.url)), 'utf8');

test('«How it works» has an «Effort and capacity» section with its TOC entry, and says the scale, the capacity and the parallel reviews', () => {
  const html = raw('site/how-it-works/index.html');
  assert.match(html, /<section id="effort">/);
  assert.match(html, /<a href="#effort">Effort and capacity<\/a>/);
  const t = read('site/how-it-works/index.html');
  assert.match(t, /1 small, 2 medium, 3 large/);
  assert.match(t, /huddle capacity/);
  assert.match(t, /review_capacity/);
  assert.match(t, /one at a time/);
  assert.match(t, /\/huddle-play alone/);
});

test('«Get started» and the first-day PDF source say /huddle-play alone', () => {
  for (const f of ['site/get-started/index.html', 'docs/pdf/src/first-day.html']) assert.match(read(f), /\/huddle-play alone/, f);
});

test('the guide PDF source says the capacity and review_capacity', () => {
  const t = read('docs/pdf/src/guide.html');
  assert.match(t, /capacity of 5 points/);
  assert.match(t, /review_capacity/);
  assert.match(t, /1 small, 2 medium, 3 large/);
});
