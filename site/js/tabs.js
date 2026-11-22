// Huddle: tabs for the Get started page (Issue #273). Plain browser JavaScript, no dependency.
// The page ships all its text. This script turns every [data-tabs] group into an ARIA tablist: the panes are its
// direct children with data-tab-label. Without the script, every pane stays on screen.

const STORE = 'huddle-tab:';

// The tab to move to for a key, or -1 when the key is not one of the tablist keys.
export function keyIndex(key, i, n) {
  if (key === 'ArrowRight' || key === 'ArrowDown') return (i + 1) % n;
  if (key === 'ArrowLeft' || key === 'ArrowUp') return (i - 1 + n) % n;
  if (key === 'Home') return 0;
  if (key === 'End') return n - 1;
  return -1;
}

function storage(win) {
  try { return win.localStorage || null; } catch { return null; }
}

export function enhance(doc, win) {
  const infos = [...doc.querySelectorAll('[data-tabs]')].map((group, g) => {
    const panes = group.children.filter((c) => c.hasAttribute('data-tab-label'));
    const list = doc.createElement('div');
    list.className = 'tablist';
    list.setAttribute('role', 'tablist');
    if (group.getAttribute('data-tabs-label')) list.setAttribute('aria-label', group.getAttribute('data-tabs-label'));
    const tabs = panes.map((pane, p) => {
      if (!pane.id) pane.id = `tabpane-${g}-${p}`;
      const tab = doc.createElement('button');
      tab.className = 'tab';
      tab.setAttribute('type', 'button');
      tab.setAttribute('role', 'tab');
      tab.id = `tab-${pane.id}`;
      tab.setAttribute('aria-controls', pane.id);
      tab.textContent = pane.getAttribute('data-tab-label');
      pane.setAttribute('role', 'tabpanel');
      pane.setAttribute('aria-labelledby', tab.id);
      pane.setAttribute('tabindex', '0');
      list.appendChild(tab);
      return tab;
    });
    group.insertBefore(list, group.children[0]);
    group.classList.add('is-enhanced');
    return { group, name: group.getAttribute('data-tabs'), panes, tabs, list };
  });

  const paneInfo = (pane) => infos.find((i) => i.panes.includes(pane));

  function show(info, index, focus) {
    info.panes.forEach((pane, i) => {
      const on = i === index;
      pane.hidden = !on;
      info.tabs[i].setAttribute('aria-selected', on ? 'true' : 'false');
      info.tabs[i].setAttribute('tabindex', on ? '0' : '-1');
    });
    if (focus) info.tabs[index].focus();
  }

  // Open the pane with this id and every pane around it. Returns false when the id is not a pane.
  function open(id) {
    let pane = id ? doc.getElementById(id) : null;
    if (!pane || !paneInfo(pane)) return false;
    const chain = [];
    for (; pane; pane = pane.parentNode) if (paneInfo(pane)) chain.unshift(pane);
    for (const p of chain) {
      const info = paneInfo(p);
      show(info, info.panes.indexOf(p), false);
    }
    return true;
  }

  function choose(info, index, focus) {
    show(info, index, focus);
    const id = info.panes[index].id;
    try { win.history.replaceState(null, '', `#${id}`); } catch { /* the hash is a convenience */ }
    const s = storage(win);
    try { if (s) s.setItem(STORE + info.name, id); } catch { /* blocked: the tabs still work */ }
  }

  const idFromHash = () => decodeURIComponent((win.location.hash || '').replace(/^#/, ''));

  for (const info of infos) {
    info.tabs.forEach((tab, i) => tab.addEventListener('click', () => choose(info, i, false)));
    info.list.addEventListener('keydown', (e) => {
      const from = info.tabs.indexOf(e.target);
      if (from < 0) return;
      const to = keyIndex(e.key, from, info.tabs.length);
      if (to < 0) return;
      e.preventDefault();
      choose(info, to, true);
    });
    let start = 0;
    try {
      const s = storage(win);
      const saved = s ? s.getItem(STORE + info.name) : null;
      const found = info.panes.findIndex((p) => p.id === saved);
      if (found >= 0) start = found;
    } catch { /* blocked: start on the first tab */ }
    show(info, start, false);
  }

  // The URL hash wins over what was remembered.
  const first = idFromHash();
  if (open(first)) doc.getElementById(first).scrollIntoView();
  win.addEventListener('hashchange', () => { open(idFromHash()); });
  return { open };
}

if (typeof document !== 'undefined' && typeof window !== 'undefined') enhance(document, window);
