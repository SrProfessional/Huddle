// Builds docs/pdf/huddle-guide.pdf and docs/pdf/huddle-first-day.pdf from docs/pdf/src/.
// Huddle has no runtime dependencies, so Playwright is not installed here: point PLAYWRIGHT_DIR at any folder whose
// node_modules has it (for example a project that uses Playwright), then run: node docs/pdf/build.mjs
import { createRequire } from 'node:module';
import { readFileSync, writeFileSync, statSync, mkdtempSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const src = (f) => readFileSync(path.join(here, 'src', f), 'utf8');
const from = process.env.PLAYWRIGHT_DIR;
if (!from) {
  console.error('Set PLAYWRIGHT_DIR to a folder whose node_modules has playwright.');
  process.exit(1);
}
const { chromium } = createRequire(path.join(path.resolve(from), 'package.json'))('playwright');

const FONTS = '<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>'
  + '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Sora:wght@600;700&family=Plus+Jakarta+Sans:wght@400;500;600;700&display=swap">';
const section = src('first-day.section.html');
const page = (title, body) => `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${title}</title>`
  + `<meta name="viewport" content="width=device-width, initial-scale=1">${FONTS}<style>${src('style.css')}</style><style>${src('print.css')}</style></head>`
  + `<body>${body.replace('<!-- include: first-day.section.html -->', section)}</body></html>`;

const docs = [
  { title: 'Huddle guide', body: src('guide.html'), html: 'huddle-guide.html', pdf: 'huddle-guide.pdf' },
  { title: 'Huddle first day', body: src('first-day.html'), html: 'huddle-first-day.html', pdf: 'huddle-first-day.pdf' },
];

const tmp = mkdtempSync(path.join(os.tmpdir(), 'huddle-pdf-'));
const browser = await chromium.launch();
try {
  for (const d of docs) {
    const htmlPath = path.join(tmp, d.html);
    writeFileSync(htmlPath, page(d.title, d.body));
    const tab = await browser.newPage();
    await tab.emulateMedia({ colorScheme: 'light', media: 'print' });
    await tab.goto(pathToFileURL(htmlPath).href, { waitUntil: 'networkidle' });
    await tab.evaluate(() => document.fonts.ready);
    const out = path.join(here, d.pdf);
    await tab.pdf({ path: out, format: 'A4', printBackground: true, margin: { top: '16mm', bottom: '16mm', left: '14mm', right: '14mm' } });
    console.log(`${d.pdf}: ${statSync(out).size} bytes`);
  }
} finally {
  await browser.close();
}
