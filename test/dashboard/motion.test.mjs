// Issue #232: the motion script. Run in a sandbox with a fake gsap and a fake page: one tween per element, explicit end values,
// styles cleared at the end, a 3 s safety, and nothing at all for prefers-reduced-motion. Never a browser, never the network.
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { MOTION_SCRIPT } from '../../lib/dashboard/motion.mjs';

function element(m, extra = {}) {
  const el = { dataset: { m, ...extra.dataset }, textContent: extra.text ?? '', style: {}, children: extra.children ?? [], closest: (sel) => (extra.hidden && sel === '[hidden]' ? el : null), querySelectorAll(sel) { const want = /data-m="(\w+)"/.exec(sel)?.[1]; return el.children.filter((c) => c.dataset.m === want); } };
  return el;
}

function world({ reduce = false, noGsap = false, noScrollTrigger = false } = {}) {
  const tweens = [];
  const sets = [];
  const timers = [];
  const triggers = [];
  const bar = element('bar', { dataset: { w: '42' } });
  const row = element('row');
  const count = element('count', { dataset: { count: '1234.5' }, text: '$1,234.50' });
  const section = element('section', { children: [row, bar, count] });
  const hiddenBar = element('bar', { dataset: { w: '10' }, hidden: true });
  const els = {
    head: [element('head')],
    card: [element('card'), element('card'), element('card')],
    count: [element('count', { dataset: { count: '48' }, text: '48' }), count],
    section: [section],
    row: [row],
    bar: [bar, hiddenBar],
    glow: [element('glow')],
  };
  const document = {
    documentElement: { classList: { add() {} } },
    querySelector: (sel) => els[/data-m="(\w+)"/.exec(sel)?.[1]]?.[0] ?? null,
    querySelectorAll: (sel) => (els[/data-m="(\w+)"/.exec(sel)?.[1]] ?? []),
    addEventListener() {},
  };
  const handle = (target, from, to) => {
    const t = { target, from, to, plays: 0, killed: false, play() { t.plays++; return t; }, kill() { t.killed = true; }, progress() { return t.plays ? 0.4 : 0; } };
    tweens.push(t);
    return t;
  };
  const gsap = {
    registerPlugin() {}, fromTo: handle, set: (target, vars) => sets.push({ target, vars }),
    ticker: { add() {}, lagSmoothing() {} },
  };
  const ScrollTrigger = { create: (config) => triggers.push(config), update() {} };
  class Lenis { on() {} raf() {} }
  const context = {
    window: { matchMedia: (q) => ({ matches: reduce && /prefers-reduced-motion/.test(q) }), addEventListener() {}, scrollY: 0, innerHeight: 800 },
    document, setTimeout: (fn, ms) => timers.push({ fn, ms }) && timers.length, clearTimeout() {}, Lenis, console,
  };
  if (!noGsap) context.gsap = gsap;
  if (!noGsap && !noScrollTrigger) context.ScrollTrigger = ScrollTrigger;
  return { context, tweens, sets, timers, triggers, els, count, hiddenBar, bar };
}

const run = (w) => vm.runInNewContext(MOTION_SCRIPT, w.context);

test('one tween per element: no element or counter object is ever tweened twice', () => {
  const w = world();
  run(w);
  assert.ok(w.tweens.length >= 9, 'the header, the cards, the counters, the section, its row and its bar are all tweened');
  const targets = w.tweens.map((t) => t.target);
  assert.equal(new Set(targets).size, targets.length, 'every target once');
  assert.ok(!w.tweens.some((t) => t.target === w.hiddenBar), 'an element of a hidden range stays still');
});

test('every tween has explicit end values and clears its styles at the end', () => {
  const w = world();
  run(w);
  for (const t of w.tweens) {
    assert.ok(t.to && Object.keys(t.to).length, 'has an end');
    if (t.target.dataset) {
      assert.match(String(t.to.clearProps), /\S/, `${t.target.dataset.m} clears its styles`);
      assert.equal(typeof t.to.onComplete, 'function');
    }
  }
  const bar = w.tweens.find((t) => t.target === w.bar);
  assert.equal(bar.from.width, '0%');
  assert.equal(bar.to.width, '42%', 'the bar grows to its own value');
  const proxy = w.tweens.find((t) => t.target.v !== undefined && t.to.v === 1234.5);
  assert.ok(proxy, 'a number counts up to its real value');
});

test('the header and the cards enter at once; the sections, rows and bars wait for the scroll', () => {
  const w = world();
  run(w);
  const played = w.tweens.filter((t) => t.plays);
  assert.ok(played.some((t) => t.target === w.els.head[0]));
  assert.equal(played.filter((t) => w.els.card.includes(t.target)).length, 3);
  assert.equal(w.triggers.length, 1, 'one trigger per section');
  assert.ok(!w.tweens.find((t) => t.target === w.bar).plays);
  w.triggers[0].onEnter();
  assert.ok(w.tweens.find((t) => t.target === w.bar).plays, 'the bar grows when its section arrives');
  assert.ok(w.tweens.find((t) => t.target === w.els.row[0]).plays);
});

test('the 3 s safety ends every unfinished tween and clears its styles, so a throttled tab leaves nothing out of place', () => {
  const w = world();
  run(w);
  w.triggers[0].onEnter();
  const safety = w.timers.filter((t) => t.ms === 3000);
  assert.ok(safety.length >= 2, 'one at the start and one when a section arrives');
  for (const t of safety) t.fn();
  const playedTweens = w.tweens.filter((t) => t.plays);
  assert.ok(playedTweens.every((t) => t.killed), 'killed');
  for (const t of playedTweens.filter((x) => x.target.dataset)) assert.ok(w.sets.some((s) => s.target === t.target && /\S/.test(String(s.vars.clearProps))), `${t.target.dataset.m} cleared`);
  assert.equal(w.count.textContent, '$1,234.50', 'a counter ends with its real text');
});

test('a counter keeps its prefix, its separators and its decimals while it counts', () => {
  const w = world();
  run(w);
  const t = w.tweens.find((x) => x.to.v === 1234.5);
  t.to.onUpdate.call({ targets: () => [t.target] });
  assert.match(w.count.textContent, /^\$[\d,]*\.\d{2}$/);
});

test('prefers-reduced-motion: reduce does nothing at all: no tween, no trigger, no timer', () => {
  const w = world({ reduce: true });
  run(w);
  assert.equal(w.tweens.length, 0);
  assert.equal(w.triggers.length, 0);
  assert.equal(w.timers.length, 0);
});

test('with no gsap loaded the page just stays complete', () => {
  const w = world({ noGsap: true });
  assert.doesNotThrow(() => run(w));
  assert.equal(w.tweens.length, 0);
});

test('without ScrollTrigger everything plays at once, so nothing waits for a scroll that never comes', () => {
  const w = world({ noScrollTrigger: true });
  run(w);
  assert.ok(w.tweens.find((t) => t.target === w.bar).plays);
});

test('the script text is the contract: reduced motion first, a 3000 ms safety, no network', () => {
  assert.match(MOTION_SCRIPT, /prefers-reduced-motion: reduce/);
  assert.match(MOTION_SCRIPT, /3000/);
  assert.doesNotMatch(MOTION_SCRIPT, /https?:\/\/|<\/script/i);
  assert.ok(MOTION_SCRIPT.indexOf('prefers-reduced-motion') < MOTION_SCRIPT.indexOf('gsap.fromTo'));
});
