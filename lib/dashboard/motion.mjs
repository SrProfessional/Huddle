// Huddle: the motion of the dashboard (docs/design.md §26, Issue #232), as the text of the one inline script of the page.
// The rules, from the approved mockup: one tween per element with explicit end values; the styles are cleared when a tween ends; a 3 s safety
// ends every tween that did not finish, so a throttled tab never leaves a card out of place; prefers-reduced-motion: reduce gets no motion at all
// and a complete page. The light that drifts, the pulse of the watch and the breathing savings card are CSS (page.mjs), not tweens.
// No template placeholders and no closing script tag below: the text goes into the page as it is.

export const MOTION_SCRIPT = String.raw`(function () {
  'use strict';
  if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) { return; }
  if (typeof gsap === 'undefined') { return; }
  var hasScroll = typeof ScrollTrigger !== 'undefined';
  if (hasScroll) { gsap.registerPlugin(ScrollTrigger); }

  var CLEAR = 'opacity,transform,width,height';
  var live = [];
  var timer = null;

  function all(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }
  function shown(el) { return !(el.closest && el.closest('[hidden]')); }

  function done(entry) {
    var i = live.indexOf(entry);
    if (i >= 0) { live.splice(i, 1); }
    if (entry.text !== null) { entry.el.textContent = entry.text; } else { gsap.set(entry.el, { clearProps: CLEAR }); }
  }

  // The safety: whatever started and did not finish 3 s later is ended where it should end, and its styles are cleared.
  function sweep() {
    timer = null;
    live.slice().forEach(function (entry) { entry.tween.kill(); done(entry); });
  }
  function guard() {
    if (timer !== null && typeof clearTimeout === 'function') { clearTimeout(timer); }
    timer = setTimeout(sweep, 3000);
  }
  function start(entry) { live.push(entry); entry.tween.play(); guard(); }

  function make(el, from, to, delay) {
    var entry = { el: el, tween: null, text: null };
    var vars = Object.assign({ duration: 0.7, delay: delay || 0, ease: 'power3.out', paused: true, clearProps: CLEAR, onComplete: function () { done(entry); } }, to);
    entry.tween = gsap.fromTo(el, from, vars);
    return entry;
  }

  // A number counts up to the number already written in the page; its prefix, separators and decimals stay as they are.
  function counter(el, delay) {
    var original = el.textContent;
    var parts = /^([^0-9-]*)(-?[0-9][0-9,]*(?:\.([0-9]+))?)(.*)$/.exec(original);
    var end = Number(el.dataset.count);
    if (!parts || !isFinite(end)) { return null; }
    var decimals = parts[3] ? parts[3].length : 0;
    var grouped = parts[2].indexOf(',') >= 0;
    var proxy = { v: 0 };
    var entry = { el: el, tween: null, text: original };
    function text(v) {
      var s = v.toFixed(decimals);
      if (grouped) { var p = s.split('.'); p[0] = p[0].replace(/\B(?=(\d{3})+(?!\d))/g, ','); s = p.join('.'); }
      return parts[1] + s + parts[4];
    }
    entry.tween = gsap.fromTo(proxy, { v: 0 }, { v: end, duration: 1.1, delay: delay || 0, ease: 'power2.out', paused: true,
      onUpdate: function () { el.textContent = text(proxy.v); },
      onComplete: function () { done(entry); } });
    return entry;
  }

  // A bar grows to its own value: its width, or its height when it is a column of a chart (data-h).
  function bar(el, delay) {
    var column = el.dataset.h !== undefined;
    var from = {};
    var to = { duration: 0.9, ease: 'power2.out' };
    from[column ? 'height' : 'width'] = '0%';
    to[column ? 'height' : 'width'] = (column ? el.dataset.h : (el.dataset.w || '0')) + '%';
    return make(el, from, to, delay);
  }

  var owned = [];
  function own(list) { list.forEach(function (el) { owned.push(el); }); return list; }

  // The header and the summary cards enter at once, in a stagger, and their numbers count up.
  all('[data-m="head"]').filter(shown).forEach(function (el) { start(make(el, { opacity: 0, y: -18 }, { opacity: 1, y: 0 })); });
  all('[data-m="card"]').filter(shown).forEach(function (el, i) { start(make(el, { opacity: 0, y: 26 }, { opacity: 1, y: 0 }, 0.12 + i * 0.08)); });

  // Each section reveals when it arrives; its rows slide in and its bars grow, one tween each. Without ScrollTrigger they all play at once.
  all('[data-m="section"]').filter(shown).forEach(function (section) {
    var rows = own(all('[data-m="row"]', section)).filter(shown);
    var bars = own(all('[data-m="bar"]', section)).filter(shown);
    var counts = own(all('[data-m="count"]', section)).filter(shown);
    var entries = [make(section, { opacity: 0, y: 30 }, { opacity: 1, y: 0 })];
    rows.forEach(function (el, i) { entries.push(make(el, { opacity: 0, x: -26 }, { opacity: 1, x: 0 }, 0.1 + Math.min(i, 12) * 0.04)); });
    bars.forEach(function (el, i) { entries.push(bar(el, 0.2 + Math.min(i, 12) * 0.04)); });
    counts.forEach(function (el) { var c = counter(el, 0.15); if (c) { entries.push(c); } });
    function play() { entries.forEach(start); }
    if (hasScroll) { ScrollTrigger.create({ trigger: section, start: 'top 88%', once: true, onEnter: play }); } else { play(); }
  });

  // What is not inside a section (the summary): numbers and bars play at once.
  all('[data-m="bar"]').filter(shown).filter(function (el) { return owned.indexOf(el) < 0; }).forEach(function (el) {
    start(bar(el, 0.3));
  });
  all('[data-m="count"]').filter(shown).filter(function (el) { return owned.indexOf(el) < 0; }).forEach(function (el, i) {
    var c = counter(el, 0.25 + i * 0.05);
    if (c) { start(c); }
  });

  // The light follows the scroll and, a little, the mouse. Plain style writes, no tween.
  var glow = document.querySelector('[data-m="glow"]');
  var sy = 0; var mx = 0; var my = 0;
  function place() { if (glow) { glow.style.transform = 'translate3d(' + mx + 'px,' + (my - sy * 0.12) + 'px,0)'; } }
  window.addEventListener('mousemove', function (e) { mx = (e.clientX / (window.innerWidth || 1) - 0.5) * 36; my = (e.clientY / (window.innerHeight || 1) - 0.5) * 36; place(); });
  if (typeof Lenis !== 'undefined') {
    var lenis = new Lenis();
    lenis.on('scroll', function (e) { sy = e.scroll || 0; place(); if (hasScroll) { ScrollTrigger.update(); } });
    gsap.ticker.add(function (t) { lenis.raf(t * 1000); });
    gsap.ticker.lagSmoothing(0);
  } else {
    window.addEventListener('scroll', function () { sy = window.scrollY || 0; place(); });
  }
})();`;
