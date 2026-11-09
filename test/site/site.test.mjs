// Huddle: checks on the website in site/ (Issue #56). They only read files; nothing here calls a network.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));
const site = path.join(root, 'site');
const BASE = 'https://srprofessional.github.io/Huddle/';
const REQUIRED = ['index.html', 'get-started/index.html', 'how-it-works/index.html', '404.html'];

const read = (rel) => readFileSync(path.join(root, rel), 'utf8');

// Every page of the site: an .html file under site/, except the share image source in site/og/.
function pagesOf(dir = site, out = []) {
  if (!existsSync(dir)) return out;
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) {
      if (name !== 'og') pagesOf(full, out);
    } else if (name.endsWith('.html')) {
      out.push(path.relative(site, full).split(path.sep).join('/'));
    }
  }
  return out.sort();
}

const pages = pagesOf();
const html = (p) => readFileSync(path.join(site, p), 'utf8');
const titleOf = (t) => (t.match(/<title>([^<]*)<\/title>/i) || [])[1];
const meta = (t, attr, name) => {
  const m = t.match(new RegExp(`<meta\\s+[^>]*${attr}="${name}"[^>]*>`, 'i'));
  if (!m) return null;
  const c = m[0].match(/content="([^"]*)"/i);
  return c ? c[1] : null;
};
const urlOf = (p) => BASE + (p === 'index.html' ? '' : p.endsWith('/index.html') ? p.slice(0, -'index.html'.length) : p);
const idsOf = (t) => new Set([...t.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]));

test('the site has its four required pages', () => {
  for (const p of REQUIRED) assert.ok(pages.includes(p), `site/${p} is missing`);
});

test('every page: lang, viewport, title (≤ 60) and meta description (≤ 155)', () => {
  assert.ok(pages.length >= REQUIRED.length, 'no pages yet');
  for (const p of pages) {
    const t = html(p);
    assert.match(t, /^<!doctype html>/i, `${p}: doctype`);
    assert.match(t, /<html[^>]*\slang="en"/i, `${p}: lang="en"`);
    assert.match(t, /<meta\s+charset="utf-8"/i, `${p}: charset`);
    assert.match(t, /<meta\s+name="viewport"\s+content="[^"]*width=device-width/i, `${p}: viewport`);
    const title = titleOf(t);
    assert.ok(title && title.length >= 10 && title.length <= 60, `${p}: title length ${title && title.length}`);
    const d = meta(t, 'name', 'description');
    assert.ok(d && d.length >= 70 && d.length <= 155, `${p}: description length ${d && d.length}`);
  }
});

test('every page: canonical, Open Graph and Twitter card', () => {
  for (const p of pages) {
    const t = html(p);
    const canon = (t.match(/<link\s+rel="canonical"\s+href="([^"]*)"/i) || [])[1];
    assert.equal(canon, urlOf(p), `${p}: canonical`);
    assert.equal(meta(t, 'property', 'og:url'), canon, `${p}: og:url`);
    assert.ok(meta(t, 'property', 'og:type'), `${p}: og:type`);
    assert.equal(meta(t, 'property', 'og:title'), titleOf(t), `${p}: og:title`);
    assert.equal(meta(t, 'property', 'og:description'), meta(t, 'name', 'description'), `${p}: og:description`);
    assert.equal(meta(t, 'property', 'og:image'), BASE + 'og.png', `${p}: og:image`);
    assert.ok(meta(t, 'property', 'og:image:alt'), `${p}: og:image:alt`);
    assert.ok(meta(t, 'property', 'og:site_name'), `${p}: og:site_name`);
    assert.equal(meta(t, 'name', 'twitter:card'), 'summary_large_image', `${p}: twitter:card`);
    assert.equal(meta(t, 'name', 'twitter:title'), titleOf(t), `${p}: twitter:title`);
    assert.ok(meta(t, 'name', 'twitter:description'), `${p}: twitter:description`);
    assert.equal(meta(t, 'name', 'twitter:image'), BASE + 'og.png', `${p}: twitter:image`);
  }
});

test('every page: one h1, ordered headings, alt text on every image, no third-party scripts', () => {
  for (const p of pages) {
    const t = html(p);
    assert.equal((t.match(/<h1[\s>]/gi) || []).length, 1, `${p}: exactly one h1`);
    let prev = 0;
    for (const m of t.matchAll(/<h([1-6])[\s>]/gi)) {
      const n = Number(m[1]);
      assert.ok(n <= prev + 1, `${p}: heading h${n} comes after h${prev}`);
      prev = n;
    }
    for (const img of t.match(/<img\b[^>]*>/gi) || []) {
      assert.match(img, /\salt="[^"]*"/i, `${p}: image without alt: ${img}`);
      assert.match(img, /\swidth="\d+"/i, `${p}: image without width: ${img}`);
      assert.match(img, /\sheight="\d+"/i, `${p}: image without height: ${img}`);
    }
    for (const svg of t.match(/<svg\b[^>]*>/gi) || []) {
      assert.match(svg, /role="img"|aria-hidden="true"/i, `${p}: svg needs role="img" or aria-hidden: ${svg}`);
    }
    for (const s of t.match(/<script\b[^>]*>/gi) || []) {
      assert.doesNotMatch(s, /\ssrc="https?:/i, `${p}: third-party script ${s}`);
    }
  }
});

test('every internal link and asset resolves to a file in site/, and every #fragment to an id', () => {
  for (const p of pages) {
    const t = html(p);
    for (const m of t.matchAll(/\s(?:href|src)="([^"]*)"/gi)) {
      let ref = m[1];
      if (!ref || /^(mailto:|tel:|data:|javascript:)/i.test(ref)) continue;
      if (/^https?:\/\//i.test(ref)) {
        if (!ref.startsWith(BASE)) continue; // an external link
        ref = '/' + ref.slice(BASE.length); // the site's own address: from the root of site/
      } else if (ref.startsWith('//')) {
        continue;
      }
      const [file, frag] = ref.split('#');
      let target;
      if (file === '') target = p;
      else if (file.startsWith('/')) target = file.replace(/^\/Huddle\//, '').replace(/^\//, '');
      else target = path.posix.normalize(path.posix.join(path.posix.dirname(p), file));
      if (target === '' || target.endsWith('/')) target += 'index.html';
      const full = path.join(site, target);
      assert.ok(existsSync(full) && statSync(full).isFile(), `${p}: «${m[1]}» does not resolve to site/${target}`);
      if (frag) {
        const ids = target.endsWith('.html') ? idsOf(readFileSync(full, 'utf8')) : new Set();
        assert.ok(ids.has(frag), `${p}: «${m[1]}» points to a missing id`);
      }
    }
  }
});

test('external links are https', () => {
  for (const p of pages) {
    for (const m of html(p).matchAll(/<a\b[^>]*\shref="(https?:[^"]*)"[^>]*>/gi)) {
      assert.match(m[1], /^https:\/\//, `${p}: ${m[1]} is not https`);
    }
  }
});

test('sitemap.xml lists every page except the 404, and robots.txt points to it', () => {
  assert.ok(existsSync(path.join(site, 'sitemap.xml')), 'site/sitemap.xml is missing');
  const sm = readFileSync(path.join(site, 'sitemap.xml'), 'utf8');
  assert.match(sm, /<urlset[^>]*sitemaps\.org\/schemas\/sitemap\/0\.9/);
  const locs = [...sm.matchAll(/<loc>([^<]*)<\/loc>/g)].map((m) => m[1]).sort();
  const want = pages.filter((p) => p !== '404.html').map(urlOf).sort();
  assert.deepEqual(locs, want);
  assert.ok(existsSync(path.join(site, 'robots.txt')), 'site/robots.txt is missing');
  const rb = readFileSync(path.join(site, 'robots.txt'), 'utf8');
  assert.match(rb, /^User-agent: \*$/m);
  assert.match(rb, new RegExp(`^Sitemap: ${BASE.replace(/[.]/g, '\\.')}sitemap\\.xml$`, 'm'));
});

test('the 404 page is not indexed and its links do not depend on the folder', () => {
  const t = html('404.html');
  assert.match(t, /<meta\s+name="robots"\s+content="noindex/i);
  for (const m of t.matchAll(/\s(?:href|src)="([^"]*)"/gi)) {
    if (/^(https?:|#|mailto:)/i.test(m[1])) continue;
    assert.ok(m[1].startsWith('/'), `404.html: «${m[1]}» must be absolute so it works at any depth`);
  }
});

test('the home page has JSON-LD SoftwareApplication', () => {
  const t = html('index.html');
  const m = t.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/);
  assert.ok(m, 'no JSON-LD block');
  const j = JSON.parse(m[1]);
  assert.equal(j['@context'], 'https://schema.org');
  assert.equal(j['@type'], 'SoftwareApplication');
  assert.ok(j.name && j.description);
  assert.equal(j.applicationCategory, 'DeveloperApplication');
  assert.equal(j.operatingSystem, 'Windows, macOS, Linux');
  assert.equal(j.offers.price, '0');
  assert.ok(j.offers.priceCurrency);
  assert.match(j.license, /MIT/);
  assert.equal(j.codeRepository, 'https://github.com/SrProfessional/Huddle');
});

test('the home page has what the Issue asks for', () => {
  const t = html('index.html');
  assert.match(t, /Decision-led development for teams coding with AI/);
  assert.match(t, /<svg[^>]*role="img"[^>]*aria-labelledby/i, 'label-flow diagram as inline svg with a title');
  for (const l of ['ready', 'assigned', 'in progress', 'in review', 'needs decision', 'changes requested']) {
    assert.ok(t.includes(l), `diagram or text lacks the label «${l}»`);
  }
  assert.match(t, /claude plugin marketplace add SrProfessional\/Huddle/);
  assert.match(t, /claude plugin install huddle@huddle/);
  assert.match(t, /GitHub/);
  assert.match(t, /GitLab/);
  assert.ok((t.match(/<details\b/g) || []).length >= 5, 'FAQ with at least 5 questions');
  assert.match(t, /href="https:\/\/github\.com\/SrProfessional\/Huddle"/);
  assert.match(t, /href="https:\/\/github\.com\/SrProfessional\/Huddle\/releases/);
  assert.match(t, /href="get-started\/"/);
  assert.match(t, /href="how-it-works\/"/);
});

test('the style sheet has light and dark, visible focus, reduced motion, and no trackers', () => {
  const cssFiles = existsSync(site) ? readdirSync(site).filter((f) => f.endsWith('.css')) : [];
  assert.ok(cssFiles.length >= 1, 'no style sheet in site/');
  const css = cssFiles.map((f) => readFileSync(path.join(site, f), 'utf8')).join('\n');
  assert.match(css, /prefers-color-scheme:\s*dark/);
  assert.match(css, /:focus-visible/);
  assert.match(css, /prefers-reduced-motion/);
  for (const p of pages) {
    const t = html(p);
    assert.match(t, /<meta\s+name="color-scheme"\s+content="light dark"/i, `${p}: color-scheme`);
    assert.doesNotMatch(t, /google-analytics|googletagmanager|plausible|hotjar|segment\.com/i, `${p}: tracker`);
  }
});

test('the share image is a 1200 x 630 PNG and its source is kept', () => {
  const f = path.join(site, 'og.png');
  assert.ok(existsSync(f), 'site/og.png is missing');
  const b = readFileSync(f);
  assert.equal(b.subarray(1, 4).toString(), 'PNG');
  assert.equal(b.readUInt32BE(16), 1200, 'width');
  assert.equal(b.readUInt32BE(20), 630, 'height');
  assert.ok(existsSync(path.join(site, 'og', 'og.html')), 'site/og/og.html (the source) is missing');
  assert.ok(existsSync(path.join(site, 'og', 'README.md')), 'site/og/README.md (how to make it again) is missing');
});

test('the Pages workflow deploys site/ from main with pinned actions', () => {
  const f = '.github/workflows/pages.yml';
  assert.ok(existsSync(path.join(root, f)), `${f} is missing`);
  const t = read(f);
  assert.match(t, /branches:\s*\[main\]/);
  assert.match(t, /paths:\s*\n\s*-\s*['"]?site\/\*\*/);
  assert.match(t, /workflow_dispatch:/);
  assert.match(t, /pages:\s*write/);
  assert.match(t, /id-token:\s*write/);
  for (const a of ['configure-pages', 'upload-pages-artifact', 'deploy-pages']) {
    assert.match(t, new RegExp(`uses: actions/${a}@[0-9a-f]{40}`), `${a} must be pinned to a commit`);
  }
  assert.match(t, /path:\s*site\/?\s*$/m);
});

test('the README opens with the words people search for, links the site and has a Website badge', () => {
  const t = read('README.md');
  const top = t.split('\n').slice(0, 14).join('\n');
  assert.match(top, /Claude Code plugin/i);
  assert.match(top, /AI coding/i);
  assert.match(top, /decision-led/i);
  assert.match(top, /https:\/\/srprofessional\.github\.io\/Huddle\//);
  assert.match(top, /\[!\[Website\]\(https:\/\/img\.shields\.io\/[^)]*\)\]\(https:\/\/srprofessional\.github\.io\/Huddle\/\)/);
});

test('the CHANGELOG mentions the website under Unreleased', () => {
  assert.match(read('CHANGELOG.md').split('## [0.3.0]')[0], /website/i);
});
