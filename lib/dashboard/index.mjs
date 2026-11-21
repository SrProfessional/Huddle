// Huddle: writing the dashboard to the repo's private folder (docs/design.md §26, Issue #232). `.huddle/` is ignored by git (setup and update add it).
import path from 'node:path';

/** The scripts the page loads, copied from site/vendor/ next to it, so nothing is loaded from the network. */
export const VENDOR = ['gsap.min.js', 'ScrollTrigger.min.js', 'lenis.min.js'];

/** Writes the page and copies the scripts; returns the page's path. `writeFile` and `copyFile` are the context's, so a test never touches the disk. */
export function writeDashboard({ root, pluginRoot, html, writeFile, copyFile }) {
  const dir = path.join(root, '.huddle', 'dashboard');
  const index = path.join(dir, 'index.html');
  writeFile(index, html);
  for (const name of VENDOR) copyFile(path.join(pluginRoot, 'site', 'vendor', name), path.join(dir, name));
  return index;
}

/** My rows: the ones read from my own machine, plus the shared ones of the days my transcripts no longer have (a day I have locally is never counted twice). */
export function mergeMine(shared = [], local = []) {
  const days = new Set(local.map((r) => r.day));
  return [...shared.filter((r) => !days.has(r.day)), ...local];
}
