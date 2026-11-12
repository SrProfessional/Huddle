// Huddle: the PDF guide sources name the 0.5.x commands (Issue #94). They only read files; nothing here calls a network.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const src = (f) => readFileSync(fileURLToPath(new URL(`../../docs/pdf/src/${f}`, import.meta.url)), 'utf8');
const guide = src('guide.html');
const firstDay = src('first-day.section.html');

test('guide.html names the 0.5.x commands and the per-project update', () => {
  for (const s of ['/huddle-update', '/huddle-play', '/huddle-watch', 'huddle queue', 'huddle notice', '--scope project',
    'claude plugin marketplace update huddle', 'claude plugin update huddle@huddle']) {
    assert.ok(guide.includes(s), `guide.html does not name ${s}`);
  }
});

test('guide.html says the stop labels stand alone and that watching is the order to merge', () => {
  assert.match(guide, /stand alone/);
  assert.match(guide, /order to merge/);
});

test('first-day.section.html names /huddle-play and /huddle-update', () => {
  for (const s of ['/huddle-play', '/huddle-update']) assert.ok(firstDay.includes(s), `first-day.section.html does not name ${s}`);
});

test('guide.html and first-day.section.html name /plugins and do not say the extension has no /plugin command', () => {
  for (const [name, t] of [['guide.html', guide], ['first-day.section.html', firstDay]]) {
    assert.ok(t.includes('/plugins'), `${name} does not name /plugins`);
    assert.doesNotMatch(t, /has no <code>\/plugin<\/code>|no <code>\/plugin<\/code> command|has no \/plugin|no \/plugin command/, `${name} still says the extension has no /plugin`);
  }
});

test('no command is written in a form that does not exist', () => {
  for (const [name, t] of [['guide.html', guide], ['first-day.section.html', firstDay]]) {
    assert.doesNotMatch(t, /huddle watch/, `${name}: «huddle watch» does not exist, it is /huddle-watch`);
    assert.doesNotMatch(t, /\/huddle-queue/, `${name}: «/huddle-queue» does not exist, it is huddle queue`);
  }
});
