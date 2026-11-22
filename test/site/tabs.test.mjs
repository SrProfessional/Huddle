// Huddle: checks on the tabs of the Get started page (Issue #273). They read the HTML and the script, and run the
// script against a small DOM stand-in; nothing here opens a browser or calls a network.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));
const read = (rel) => readFileSync(path.join(root, rel), 'utf8');
const page = read('site/get-started/index.html');
const css = read('site/style.css');
const { enhance, keyIndex } = await import(new URL('../../site/js/tabs.js', import.meta.url));

// ---- A small DOM stand-in with only what tabs.js uses ----
class El {
  constructor(tag) {
    this.tagName = tag.toUpperCase();
    this.attrs = new Map();
    this.children = [];
    this.parentNode = null;
    this.listeners = {};
    this.hidden = false;
    this.className = '';
    this.textContent = '';
    this.focused = false;
  }
  get id() { return this.attrs.get('id') || ''; }
  set id(v) { this.attrs.set('id', v); }
  setAttribute(k, v) { this.attrs.set(k, String(v)); }
  getAttribute(k) { return this.attrs.has(k) ? this.attrs.get(k) : null; }
  hasAttribute(k) { return this.attrs.has(k); }
  removeAttribute(k) { this.attrs.delete(k); }
  get classList() {
    const self = this;
    return {
      add(c) { if (!self.className.split(' ').includes(c)) self.className = (self.className + ' ' + c).trim(); },
      contains(c) { return self.className.split(' ').includes(c); },
    };
  }
  appendChild(c) { c.parentNode = this; this.children.push(c); return c; }
  insertBefore(c, ref) {
    c.parentNode = this;
    const i = this.children.indexOf(ref);
    this.children.splice(i < 0 ? this.children.length : i, 0, c);
    return c;
  }
  addEventListener(t, fn) { (this.listeners[t] ||= []).push(fn); }
  fire(t, ev = {}) {
    const e = { target: this, defaultPrevented: false, preventDefault() { this.defaultPrevented = true; }, ...ev };
    for (const fn of this.listeners[t] || []) fn(e);
    return e;
  }
  focus() { this.focused = true; }
  scrollIntoView() { this.scrolled = true; }
  walk(out = []) { out.push(this); for (const c of this.children) c.walk(out); return out; }
}
const el = (tag, attrs = {}, kids = []) => {
  const e = new El(tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  for (const k of kids) e.appendChild(k);
  return e;
};

// The same shape as step 1 of the page: install{ claude-code, codex{ codex-install, mac-codex } }.
function makeDoc({ hash = '', store = {} } = {}) {
  const pane = (id, label, kids = []) =>
    el('div', { id, 'data-tab-label': label, class: 'tab-pane', ...(id === 'codex-tab' ? { 'data-tab-hash': 'codex' } : {}) }, kids);
  const sub = el('div', { 'data-tabs': 'codex', 'data-tabs-label': 'Codex steps' }, [
    pane('codex-install', 'Install'),
    pane('mac-codex', 'macOS'),
  ]);
  const main = el('div', { 'data-tabs': 'install', 'data-tabs-label': 'Choose your tool' }, [
    pane('claude-code', 'Claude Code'),
    pane('codex-tab', 'OpenAI Codex', [el('h3', { id: 'codex' }), sub]),
  ]);
  const body = el('body', {}, [main]);
  const all = () => body.walk();
  const doc = {
    body,
    createElement: (t) => new El(t),
    querySelectorAll: (sel) => (sel === '[data-tabs]' ? all().filter((e) => e.hasAttribute('data-tabs')) : []),
    getElementById: (id) => all().find((e) => e.id === id) || null,
  };
  const listeners = {};
  const win = {
    location: { hash },
    history: { replaceState: (_s, _t, url) => { win.location.hash = url; win.replaced = (win.replaced || 0) + 1; } },
    localStorage: {
      getItem: (k) => (k in store ? store[k] : null),
      setItem: (k, v) => { store[k] = v; },
    },
    addEventListener: (t, fn) => { (listeners[t] ||= []).push(fn); },
    fire: (t) => (listeners[t] || []).forEach((fn) => fn({})),
  };
  return { doc, win, main, sub };
}
const tabsOf = (group) => group.children[0].children;
const paneOf = (doc, id) => doc.getElementById(id);
const openIds = (doc) =>
  doc.querySelectorAll('[data-tabs]').flatMap((g) => g.children.filter((c) => c.hasAttribute('data-tab-label') && !c.hidden).map((c) => c.id));

// ---- The HTML ----
test('step 1 marks two tabs and, inside Codex, two sub-tabs, with the ids the links need', () => {
  assert.match(page, /<div class="tabs" data-tabs="install"/);
  assert.match(page, /<div class="tabs tabs-sub" data-tabs="codex"/);
  for (const [id, label] of [['claude-code', 'Claude Code'], ['codex-tab', 'OpenAI Codex'], ['codex-install', 'Install'], ['mac-codex', 'macOS']]) {
    assert.match(page, new RegExp(`class="tab-pane" id="${id}"(?: data-tab-hash="codex")? data-tab-label="${label}"`), `pane ${id}`);
  }
  assert.equal((page.match(/\sid="codex"/g) || []).length, 1);
  assert.equal((page.match(/\sid="mac-codex"/g) || []).length, 1);
});

test('without the script the HTML still holds all the text and no pane is hidden', () => {
  assert.doesNotMatch(page, /<div class="tab-pane"[^>]*\shidden/);
  for (const s of ['In Claude Code', 'In OpenAI Codex', 'Set up Huddle on a Mac with Codex', 'brew install node gh git', 'claude plugin install huddle@huddle', 'codex plugin add huddle@huddle', '/huddle-update']) {
    assert.ok(page.includes(s), `missing: ${s}`);
  }
  assert.doesNotMatch(page, /role="tab(list|panel)?"/, 'the roles are added by the script, not the markup');
});

test('the page loads only its own script, as a module, with no dependency', () => {
  assert.match(page, /<script type="module" defer src="\.\.\/js\/tabs\.js"><\/script>/);
  assert.doesNotMatch(read('site/index.html'), /tabs\.js/);
  assert.doesNotMatch(read('site/js/tabs.js'), /\bimport\s|require\(|https?:\/\//);
});

test('the style has the tab row, the accent line, the focus ring, the wrap on phones and reduced motion', () => {
  assert.match(css, /\.tablist\b/);
  assert.match(css, /\.tab\[aria-selected="true"\]/);
  assert.match(css, /\.tab:focus-visible/);
  assert.match(css, /\.tab-pane\[hidden\]\s*\{\s*display:\s*none/);
  assert.match(css, /\.tabs\.is-enhanced \.tab-title/);
  assert.match(css, /prefers-reduced-motion:\s*no-preference\)\s*\{[^}]*\.tab\b/);
});

test('the links to #codex and #mac-codex elsewhere in the site still point to existing ids', () => {
  assert.match(read('site/how-it-works/index.html'), /get-started\/#codex/);
  assert.match(page, /href="#mac-codex"/);
});

// ---- The script ----
test('enhance builds ARIA tablists, Claude Code open by default', () => {
  const { doc, win, main, sub } = makeDoc();
  enhance(doc, win);
  const top = tabsOf(main);
  assert.equal(main.children[0].getAttribute('role'), 'tablist');
  assert.equal(main.children[0].getAttribute('aria-label'), 'Choose your tool');
  assert.deepEqual(top.map((t) => t.textContent), ['Claude Code', 'OpenAI Codex']);
  assert.deepEqual(tabsOf(sub).map((t) => t.textContent), ['Install', 'macOS']);
  for (const g of [main, sub]) {
    for (const t of tabsOf(g)) {
      assert.equal(t.getAttribute('role'), 'tab');
      const p = doc.getElementById(t.getAttribute('aria-controls'));
      assert.equal(p.getAttribute('role'), 'tabpanel');
      assert.equal(p.getAttribute('aria-labelledby'), t.id);
      assert.equal(p.getAttribute('tabindex'), '0');
    }
  }
  assert.equal(top[0].getAttribute('aria-selected'), 'true');
  assert.equal(top[0].getAttribute('tabindex'), '0');
  assert.equal(top[1].getAttribute('aria-selected'), 'false');
  assert.equal(top[1].getAttribute('tabindex'), '-1');
  assert.ok(main.classList.contains('is-enhanced'));
  assert.deepEqual(openIds(doc), ['claude-code', 'codex-install']);
  assert.equal(win.replaced, undefined, 'the first paint does not touch the hash');
});

test('#codex opens the Codex tab and #mac-codex opens Codex then macOS', () => {
  let { doc, win } = makeDoc({ hash: '#codex' });
  enhance(doc, win);
  assert.deepEqual(openIds(doc), ['codex-tab', 'codex-install']);
  ({ doc, win } = makeDoc({ hash: '#mac-codex' }));
  enhance(doc, win);
  assert.deepEqual(openIds(doc), ['codex-tab', 'mac-codex']);
  assert.ok(paneOf(doc, 'mac-codex').scrolled, 'the target is brought into view');
});

test('a click changes the tab and updates the hash without a page jump', () => {
  const { doc, win, main, sub } = makeDoc();
  enhance(doc, win);
  tabsOf(main)[1].fire('click');
  assert.equal(win.location.hash, '#codex');
  tabsOf(sub)[1].fire('click');
  assert.equal(win.location.hash, '#mac-codex');
  assert.deepEqual(openIds(doc), ['codex-tab', 'mac-codex']);
  assert.equal(paneOf(doc, 'mac-codex').scrolled, undefined);
  assert.equal(tabsOf(sub)[1].getAttribute('aria-selected'), 'true');
  assert.equal(tabsOf(sub)[0].getAttribute('aria-selected'), 'false');
});

test('keyIndex: arrows wrap, Home and End jump, other keys do nothing', () => {
  assert.equal(keyIndex('ArrowRight', 0, 2), 1);
  assert.equal(keyIndex('ArrowRight', 1, 2), 0);
  assert.equal(keyIndex('ArrowLeft', 0, 2), 1);
  assert.equal(keyIndex('ArrowDown', 0, 3), 1);
  assert.equal(keyIndex('ArrowUp', 0, 3), 2);
  assert.equal(keyIndex('Home', 2, 3), 0);
  assert.equal(keyIndex('End', 0, 3), 2);
  assert.equal(keyIndex('Tab', 0, 3), -1);
});

test('arrow keys move focus and selection in the tab list', () => {
  const { doc, win, main } = makeDoc();
  enhance(doc, win);
  const [a, b] = tabsOf(main);
  const e = main.children[0].fire('keydown', { key: 'ArrowRight', target: a });
  assert.ok(e.defaultPrevented);
  assert.ok(b.focused);
  assert.equal(b.getAttribute('aria-selected'), 'true');
  main.children[0].fire('keydown', { key: 'Home', target: b });
  assert.ok(a.focused);
  assert.equal(a.getAttribute('aria-selected'), 'true');
  const t = main.children[0].fire('keydown', { key: 'Tab', target: a });
  assert.ok(!t.defaultPrevented);
});

test('the last tab is remembered, and the URL hash wins over it', () => {
  const store = {};
  let { doc, win, main } = makeDoc({ store });
  enhance(doc, win);
  tabsOf(main)[1].fire('click');
  assert.ok(Object.values(store).includes('codex-tab'));
  ({ doc, win } = makeDoc({ store }));
  enhance(doc, win);
  assert.deepEqual(openIds(doc), ['codex-tab', 'codex-install']);
  ({ doc, win } = makeDoc({ store, hash: '#claude-code' }));
  enhance(doc, win);
  assert.deepEqual(openIds(doc), ['claude-code', 'codex-install']);
});

test('a missing or throwing localStorage does not break the tabs; a stale stored id is ignored', () => {
  let { doc, win, main } = makeDoc();
  win.localStorage = { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); } };
  enhance(doc, win);
  tabsOf(main)[1].fire('click');
  assert.deepEqual(openIds(doc), ['codex-tab', 'codex-install']);
  ({ doc, win } = makeDoc());
  delete win.localStorage;
  enhance(doc, win);
  assert.deepEqual(openIds(doc), ['claude-code', 'codex-install']);
  ({ doc, win } = makeDoc({ store: { 'huddle-tab:install': 'nope' } }));
  enhance(doc, win);
  assert.deepEqual(openIds(doc), ['claude-code', 'codex-install']);
});

test('a hashchange (the Mac link inside the page) opens the right tabs', () => {
  const { doc, win } = makeDoc();
  enhance(doc, win);
  win.location.hash = '#mac-codex';
  win.fire('hashchange');
  assert.deepEqual(openIds(doc), ['codex-tab', 'mac-codex']);
  win.location.hash = '#unrelated';
  win.fire('hashchange');
  assert.deepEqual(openIds(doc), ['codex-tab', 'mac-codex'], 'a hash that is not a tab changes nothing');
});
