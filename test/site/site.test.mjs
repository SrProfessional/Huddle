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

// ---- Issue #61 (H27): the home page as a parallax landing page ----

const strip = (t) => t.replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
const VENDOR = [
  ['gsap.min.js', /GSAP 3\.15\.0\b/, '3.15.0'],
  ['ScrollTrigger.min.js', /ScrollTrigger 3\.15\.0\b/, '3.15.0'],
  ['lenis.min.js', /var e=`1\.3\.27`/, '1.3.27'],
];

test('H27: GSAP, ScrollTrigger and Lenis are vendored in site/vendor with a pinned version and a licence', () => {
  const dir = path.join(site, 'vendor');
  for (const [file, banner, version] of VENDOR) {
    const f = path.join(dir, file);
    assert.ok(existsSync(f), `site/vendor/${file} is missing`);
    assert.match(readFileSync(f, 'utf8'), banner, `${file}: the version inside the file is not ${version}`);
  }
  assert.ok(existsSync(path.join(dir, 'LICENSE-lenis.txt')), 'LICENSE-lenis.txt is missing');
  assert.match(readFileSync(path.join(dir, 'LICENSE-lenis.txt'), 'utf8'), /MIT License/i);
  assert.ok(existsSync(path.join(dir, 'LICENSE-gsap.txt')), 'LICENSE-gsap.txt is missing');
  assert.match(readFileSync(path.join(dir, 'LICENSE-gsap.txt'), 'utf8'), /gsap\.com\/standard-license/);
  const readme = readFileSync(path.join(dir, 'README.md'), 'utf8');
  assert.match(readme, /gsap\.com\/standard-license/, 'README must note the GSAP licence');
  for (const [file, , version] of VENDOR) {
    assert.match(readme, new RegExp('`' + file.replace(/\./g, '\\.') + '`[^\\n]*' + version.replace(/\./g, '\\.')), `README must pin ${file} to ${version}`);
  }
  assert.doesNotMatch(readFileSync(path.join(root, 'package.json'), 'utf8'), /gsap|lenis/i, 'no npm dependency');
});

test('H27: the home page loads only local scripts, all deferred, and landing.js is the last one', () => {
  const t = html('index.html');
  const tags = t.match(/<script\b[^>]*\ssrc="[^"]*"[^>]*>/gi) || [];
  assert.ok(tags.length >= 4, 'expected gsap, ScrollTrigger, lenis and landing.js');
  for (const s of tags) {
    const src = s.match(/\ssrc="([^"]*)"/i)[1];
    assert.doesNotMatch(src, /^(https?:)?\/\//i, `script from another origin: ${src}`);
    assert.match(s, /\sdefer\b|type="module"/i, `script is not deferred: ${s}`);
  }
  const last = tags[tags.length - 1];
  assert.match(last, /src="js\/landing\.js"/);
  assert.match(last, /type="module"/);
  assert.match(last, /\sdefer\b/);
  assert.ok(existsSync(path.join(site, 'js', 'landing.js')), 'site/js/landing.js is missing');
  for (const [file] of VENDOR) assert.ok(tags.some((s) => s.includes(`vendor/${file}`)), `${file} is not loaded`);
});

test('H27: the home page has the eight scenes, in order, and every scene has its text in the HTML', () => {
  const t = html('index.html');
  const order = ['hero', 'problem', 'flow', 'steps', 'roles', 'platforms', 'install', 'faq'];
  const found = [...t.matchAll(/<(?:section|div)\b[^>]*\sdata-scene="([^"]+)"/g)].map((m) => m[1]);
  assert.deepEqual(found, order);
  const parts = t.split(/<(?:section|div)\b[^>]*\sdata-scene="/).slice(1);
  assert.equal(parts.length, 8);
  parts.forEach((p, i) => {
    assert.match(p, /<h[12][\s>]/, `scene ${order[i]} has no heading`);
    assert.ok(strip(p.split(/<footer/)[0]).length >= 150, `scene ${order[i]} has too little text in the HTML`);
  });
  for (const s of ['Five developers, five Claude Code sessions', 'How it works in four steps', 'GitHub and GitLab', 'Install it in two commands', 'Questions people ask', 'The same commands everywhere', 'The AI Manager', "The developer's session"]) {
    assert.ok(t.includes(s), `missing text «${s}»`);
  }
  // the label-flow scene has a text equivalent that names every stop and both side roads
  const flow = parts[2];
  assert.match(flow, /<ol[^>]*class="[^"]*road/, 'the label-flow scene needs a text list of the road');
  for (const l of ['ready', 'assigned', 'in progress', 'in review', 'merged', 'needs decision', 'changes requested']) assert.ok(flow.includes(l), `flow lacks ${l}`);
  // the two install commands are real text in a <pre>, with a Copy button the script reveals and a live region
  assert.match(parts[6], /<pre[\s\S]*claude plugin marketplace add SrProfessional\/Huddle[\s\S]*claude plugin install huddle@huddle[\s\S]*<\/pre>/);
  assert.match(parts[6], /<button[^>]*data-copy[^>]*\shidden\b/, 'Copy button, hidden until the script runs');
  assert.match(parts[6], /role="status"/, 'a live region to announce Copied');
  assert.match(parts[7], /class="btn"[^>]*>Get started</, 'closing Get started button');
});

test('H27: the script never writes copy into the page', () => {
  const f = path.join(root, 'site', 'js', 'landing.js');
  assert.ok(existsSync(f), 'site/js/landing.js is missing');
  const js = readFileSync(f, 'utf8');
  assert.doesNotMatch(js, /innerHTML|outerHTML|insertAdjacentHTML|document\.write|createTextNode/);
  const writes = [...js.matchAll(/\.textContent\s*=\s*([^;\n]+)/g)].map((m) => m[1].trim());
  for (const w of writes) assert.match(w, /^'(Copied|Copy|Could not copy)'$|^''$/, `textContent written with: ${w}`);
  assert.doesNotMatch(js, /https?:\/\//, 'landing.js must not reach another origin');
  assert.match(js, /prefers-reduced-motion:\s*reduce/);
});

test('H27: every decorative layer is aria-hidden', () => {
  const t = html('index.html');
  const deco = t.match(/<[a-z0-9]+\b[^>]*\sclass="[^"]*\bdeco\b[^"]*"[^>]*>/gi) || [];
  assert.ok(deco.length >= 8, `only ${deco.length} decorative layers`);
  for (const d of deco) assert.match(d, /\saria-hidden="true"/, `decorative layer without aria-hidden: ${d}`);
  assert.match(t, /<[a-z]+[^>]*\sclass="[^"]*hero-layers[^"]*"[^>]*aria-hidden="true"/, 'hero layers');
  assert.match(t, /<[a-z]+[^>]*\sclass="[^"]*\borbs\b[^"]*"[^>]*aria-hidden="true"/, 'session orbs');
});

test('H27: the CSS turns every effect off under prefers-reduced-motion and hides nothing without the script', () => {
  const css = read('site/style.css');
  const i = css.indexOf('@media (prefers-reduced-motion: reduce)');
  assert.ok(i > -1, 'no reduced-motion block');
  const block = css.slice(i);
  assert.match(block, /animation:\s*none|animation-duration:\s*0/, 'reduced motion must stop the CSS animations');
  assert.match(block, /\.deco/, 'reduced motion must settle the decorative layers');
  // nothing is hidden with opacity 0 in plain CSS except inside @keyframes (the no-JS page is fully visible)
  const bare = css.replace(/@keyframes[^{]+\{(?:[^{}]*\{[^{}]*\})*[^{}]*\}/g, '');
  for (const m of bare.matchAll(/([^{}]+)\{[^{}]*\bopacity:\s*0\s*[;}]/g)) {
    assert.match(m[1], /:hover|:focus|\.sr-only|\.copy/, `opacity:0 in plain CSS for «${m[1].trim()}»`);
  }
  // will-change is only set on the scene that is active
  for (const m of css.matchAll(/([^{}]+)\{[^{}]*will-change/g)) assert.match(m[1], /\.is-active/, `will-change outside .is-active: ${m[1].trim()}`);
  // the other pages do not load the motion scripts
  for (const p of pages.filter((x) => x !== 'index.html')) assert.doesNotMatch(html(p), /vendor\/|landing\.js/, `${p} should not load the motion scripts`);
});

test('H27: the fonts are served from the site itself, with their licences, and preloaded (no layout shift from a font swap)', () => {
  for (const p of pages) {
    const t = html(p);
    assert.doesNotMatch(t, /fonts\.googleapis\.com|fonts\.gstatic\.com/, `${p}: loads fonts from another origin`);
    assert.match(t, /<link rel="preload" href="[^"]*fonts\/bricolage-grotesque-latin\.woff2" as="font" type="font\/woff2" crossorigin>/, `${p}: preload of the display font`);
    assert.match(t, /<link rel="preload" href="[^"]*fonts\/source-serif-4-latin\.woff2" as="font" type="font\/woff2" crossorigin>/, `${p}: preload of the text font`);
  }
  const css = read('site/style.css');
  assert.match(css, /@font-face\s*\{[^}]*Bricolage Grotesque[^}]*fonts\/bricolage-grotesque-latin\.woff2/);
  assert.match(css, /@font-face\s*\{[^}]*Source Serif 4[^}]*fonts\/source-serif-4-latin\.woff2/);
  for (const f of ['bricolage-grotesque-latin.woff2', 'source-serif-4-latin.woff2']) {
    const b = readFileSync(path.join(site, 'fonts', f));
    assert.equal(b.subarray(0, 4).toString(), 'wOF2', `${f} is not a woff2 file`);
  }
  for (const f of ['OFL-bricolage-grotesque.txt', 'OFL-source-serif-4.txt']) {
    assert.match(readFileSync(path.join(site, 'fonts', f), 'utf8'), /SIL OPEN FONT LICENSE Version 1\.1/i, `${f}: licence text`);
  }
});

// ---- Issue #61, review request: links that leave the site open in a new tab, and say so ----

const anchors = (t) => [...t.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi)].map((m) => ({ attrs: m[1], inner: m[2], tag: m[0] }));
const hrefOf = (a) => (a.attrs.match(/\shref="([^"]*)"/i) || a.attrs.match(/^href="([^"]*)"/i) || [])[1];
const isExternal = (href) => /^https?:\/\//i.test(href || '') && !href.startsWith(BASE);

test('every link that leaves the site opens in a new tab, with noopener and a hidden «opens in a new tab»', () => {
  let count = 0;
  for (const p of pages) {
    for (const a of anchors(html(p))) {
      const href = hrefOf(a);
      if (!isExternal(href)) continue;
      count++;
      assert.match(a.attrs, /\starget="_blank"/, `${p}: ${href} lacks target="_blank"`);
      const rel = (a.attrs.match(/\srel="([^"]*)"/i) || [])[1] || '';
      assert.ok(rel.split(/\s+/).includes('noopener'), `${p}: ${href} lacks rel="noopener"`);
      assert.match(a.inner, /<span class="sr-only">\s*\(opens in a new tab\)<\/span>/, `${p}: ${href} lacks the hidden «(opens in a new tab)»`);
      if (!/\sclass="[^"]*\bbtn\b/.test(a.attrs) && !/\sclass="[^"]*\bbrand\b/.test(a.attrs)) {
        assert.match(a.inner, /<span class="ext" aria-hidden="true">↗<\/span>/, `${p}: text link ${href} lacks the aria-hidden ↗ mark`);
      } else {
        assert.doesNotMatch(a.inner, /class="ext"/, `${p}: a button must not get the ↗ mark`);
      }
    }
  }
  assert.ok(count >= 20, `only ${count} external links found`);
});

test('no link inside the site opens a new tab, and the helper classes exist in the CSS', () => {
  for (const p of pages) {
    for (const a of anchors(html(p))) {
      const href = hrefOf(a);
      if (!href || isExternal(href) || /^mailto:/i.test(href)) continue;
      assert.doesNotMatch(a.attrs, /\starget=/, `${p}: internal link ${href} must stay in the same tab`);
    }
  }
  const css = read('site/style.css');
  assert.match(css, /\.sr-only\s*\{/);
  assert.match(css, /\.ext\s*\{/);
});

// H28 (Issue #63): the four steps had no side margin on a phone, with reduced motion or without JavaScript, because only
// the pinned wide-screen rule (.fx-h .steps) gave them one.
const rulesOf = (css) => [...css.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/([^{}@]+)\{([^{}]*)\}/g)].map((m) => ({ sel: m[1].trim(), body: m[2] }));

test('H28: the plain .steps rule (not under .fx-h) gives the list a side margin that uses --gutter, like .wrap', () => {
  const css = read('site/style.css');
  const rules = rulesOf(css);
  const plain = rules.filter((r) => r.sel.split(',').map((s) => s.trim()).includes('.steps'));
  assert.ok(plain.length > 0, 'no plain .steps rule');
  assert.ok(plain.some((r) => /--gutter/.test(r.body) && /(margin-inline|width|padding-inline)/.test(r.body)), 'the plain .steps rule does not use --gutter');
  assert.match(rules.find((r) => r.sel === '.wrap').body, /--gutter/);
});

test('H28: every block of a scene outside .wrap (and outside a .deco layer) has a plain rule that uses --gutter', () => {
  const t = html('index.html');
  const plainRules = rulesOf(read('site/style.css')).filter((r) => !/\.fx-/.test(r.sel));
  const VOID = new Set(['meta', 'link', 'img', 'br', 'hr', 'input', 'source', 'path', 'circle', 'rect', 'line', 'use', 'stop']);
  const PASS_THROUGH = new Set(['hpin', 'htrack']); // pure wrappers: what they hold is what needs the margin
  const stack = [];
  const offenders = [];
  for (const m of t.matchAll(/<(\/?)([a-zA-Z][a-zA-Z0-9]*)([^>]*?)(\/?)>/g)) {
    const [, close, name, attrs, selfClose] = m;
    const tag = name.toLowerCase();
    if (close) {
      while (stack.length && stack.pop().tag !== tag);
      continue;
    }
    const classes = ((attrs.match(/class="([^"]*)"/) || [])[1] || '').split(/\s+/).filter(Boolean);
    const inScene = stack.some((n) => n.tag === 'section');
    const skipped = stack.some((n) => n.classes.includes('wrap') || n.classes.includes('deco') || n.tag === 'svg');
    const exempt = classes.includes('wrap') || classes.includes('deco') || classes.some((c) => PASS_THROUGH.has(c));
    if (inScene && !skipped && !exempt) {
      const parent = stack[stack.length - 1];
      if (parent.tag === 'section' || parent.classes.some((c) => PASS_THROUGH.has(c))) {
        const ok = classes.some((c) => plainRules.some((r) => r.sel.split(',').some((s) => s.trim() === `.${c}`) && /--gutter/.test(r.body)));
        if (!ok) offenders.push(`<${tag}${classes.length ? ` class="${classes.join(' ')}"` : ''}>`);
      }
    }
    if (!VOID.has(tag) && !selfClose) stack.push({ tag, classes });
  }
  assert.deepEqual(offenders, [], `outside .wrap with no --gutter rule: ${offenders.join(', ')}`);
});

test('how-it-works names /huddle-watch and /huddle-play; get-started names the update steps (Issue #94)', () => {
  const how = html('how-it-works/index.html');
  const start = html('get-started/index.html');
  for (const s of ['/huddle-watch', '/huddle-play']) assert.ok(how.includes(s), `how-it-works does not name ${s}`);
  for (const s of ['/huddle-update', '--scope project']) assert.ok(start.includes(s), `get-started does not name ${s}`);
  assert.ok(start.includes('/plugins'), 'get-started does not name /plugins');
  for (const t of [how, start]) {
    assert.doesNotMatch(t, /has no <code>\/plugin<\/code>|no <code>\/plugin<\/code> command|has no \/plugin|no \/plugin command/);
    assert.doesNotMatch(t, /huddle watch/);
    assert.doesNotMatch(t, /\/huddle-queue/);
  }
});
