// Huddle: the dashboard page (docs/design.md §26, Issue #232). One HTML file, dark only, built from the model of model.mjs.
// Everything comes from the model and is escaped; nothing is loaded from the network: the three scripts sit next to the page (copied from site/vendor/).
import { RANGES } from './model.mjs';
import { MOTION_SCRIPT } from './motion.mjs';

// The approved style. Text colours are checked at 4.5:1 on the background and on both card colours (test/dashboard/page.test.mjs).
export const STYLE_TOKENS = {
  bg: '#0F1117', card: '#1A1D26', card2: '#1D2130', text: '#F2F4F8', muted: '#A3A8B6',
  blue: '#2F6BFF', blueText: '#4C8DFF', orange: '#F5A524', pink: '#F0476B', pinkText: '#F25A7A', green: '#5FD068',
};

const esc = (v) => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const trim = (s) => s.replace(/\.?0+$/, '');
const grouped = (n, digits = 0) => Number(n).toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits });

/** 2640000 -> 2.64M, 12500 -> 12.5K, 950 -> 950. */
export function fmtTokens(n) {
  const v = Number(n) || 0;
  if (v >= 1e9) return `${trim((v / 1e9).toFixed(2))}B`;
  if (v >= 1e6) return `${trim((v / 1e6).toFixed(2))}M`;
  if (v >= 1e4) return `${trim((v / 1e3).toFixed(1))}K`;
  return grouped(v);
}

/** 1234.5 -> $1,234.50; no price is said, never shown as zero. */
export function fmtMoney(v) {
  return v === null || v === undefined || !Number.isFinite(v) ? 'no price' : `${v < 0 ? '-' : ''}$${grouped(Math.abs(v), 2)}`;
}

const fmtHours = (h) => (h === null ? '—' : h >= 48 ? `${trim((h / 24).toFixed(1))} d` : `${trim(h.toFixed(1))} h`);
const fmtNumber = (v) => (v === null || v === undefined ? '—' : trim(Number(v).toFixed(1)));
const day = (iso) => String(iso ?? '').slice(0, 10);
const ago = (seconds) => (seconds === null || seconds === undefined ? '' : seconds < 90 ? `${Math.round(seconds)} s ago` : seconds < 5400 ? `${Math.round(seconds / 60)} min ago` : `${Math.round(seconds / 3600)} h ago`);

/** The number inside a shown text, for the counter of the motion script: «$1,234.50» -> 1234.5; null when the text has none. */
const countOf = (text) => { const m = /-?\d[\d,]*(?:\.\d+)?/.exec(text); return m ? Number(m[0].replace(/,/g, '')) : null; };
const count = (text) => { const c = countOf(text); return c === null ? esc(text) : `<span data-m="count" data-count="${c}">${esc(text)}</span>`; };

const pill = (text, tone) => `<span class="pill ${tone}">${esc(text)}</span>`;
const bar = (percent, tone = '') => `<span class="track"><i class="fill ${tone}" data-m="bar" data-w="${Math.max(0, Math.min(100, Math.round(percent)))}" style="--w:${Math.max(0, Math.min(100, Math.round(percent)))}%"></i></span>`;
const share = (value, max) => (max > 0 ? (value / max) * 100 : 0);
const ref = (n) => `#${esc(n)}`;
const empty = (text) => `<p class="empty">${esc(text)}</p>`;

/** A money value; a known subtotal of an incomplete sum says «partial», and nothing known says `none`. */
function partial(value, incomplete, none) {
  if (value === null || value === undefined) return none;
  return incomplete ? `${fmtMoney(value)} partial` : fmtMoney(value);
}

function summary(r) {
  const s = r.summary;
  const diff = s.difference;
  const cards = [
    ['Issues closed', String(s.closed), 'merged in this range'],
    ['Team tokens', fmtTokens(s.tokens), `${r.people.length} ${r.people.length === 1 ? 'person' : 'people'}`],
    ['Would cost by API', partial(s.apiCost, s.apiPartial, 'no price'), s.unpriced.length ? `partial: no price for ${s.unpriced.join(', ')}` : 'at list prices per token'],
    ['Paid in plans', partial(s.paid > 0 || !s.paidPartial ? s.paid : null, s.paidPartial, 'plan not set'), s.paidUnknown.length ? `partial: plan not set for ${s.paidUnknown.join(', ')}` : `for ${r.days} day${r.days === 1 ? '' : 's'}`],
  ];
  const html = cards.map(([label, value, note]) => `<div class="card stat" data-m="card"><span class="label">${esc(label)}</span><strong class="value">${count(value)}</strong><span class="note">${esc(note)}</span></div>`);
  html.push(`<div class="card stat savings" data-m="card"><span class="label">Difference</span><strong class="value">${diff === null ? '—' : count(fmtMoney(Math.abs(diff)))}</strong><span class="note">${diff === null ? 'not shown until every plan and every API price is known' : diff >= 0 ? 'the plans cost less than the API' : 'the plans cost more than the API'}</span></div>`);
  return `<div class="stats">${html.join('')}</div>`;
}

function progress(p) {
  if (!p.areas.length) return empty('No areas yet: write milestones, then /huddle-areas.');
  const rows = [...p.areas, { title: 'Total', ...p.total }].map((a, i, all) => `<li class="row${i === all.length - 1 ? ' total' : ''}" data-m="row"><span class="name">${esc(a.title)}</span>${bar(a.percent ?? 0, i === all.length - 1 ? 'blue' : '')}<span class="meta">${a.merged}/${a.total} +${a.remaining}</span><span class="pct">${a.percent === null ? '—' : `${a.percent}%`}</span></li>`);
  return `<ul class="rows">${rows.join('')}</ul>${p.noArea ? `<p class="note">${p.noArea} open Issue${p.noArea === 1 ? '' : 's'} without an area, left out of the percent.</p>` : ''}`;
}

const beat = (state, text) => `<li class="row" data-m="row"><span class="dot ${state === 'on' ? 'on pulse' : state === 'off' ? 'off' : 'warn'}"></span><span class="name">${esc(text)}</span></li>`;

function nowSection(n) {
  const groups = [
    ['In progress', 'orange', n.working, (i) => `${ref(i.number)} ${esc(i.title)}${i.assignees?.length ? ` <span class="meta">${esc(i.assignees.join(', '))}</span>` : ''}`],
    ['Changes requested', 'pink', n.changes, (i) => `${ref(i.number)} ${esc(i.title)}${i.assignees?.length ? ` <span class="meta">${esc(i.assignees.join(', '))}</span>` : ''}`],
    ['Waiting for review', 'blue', n.review, (i) => `${ref(i.number)} ${esc(i.title)}${i.pr ? ` <span class="meta">PR #${esc(i.pr)}</span>` : ''}`],
    ['Waiting for a decision', 'pink', n.decision, (i) => `${ref(i.number)} ${esc(i.title)}`],
    ['Waiting for triage', 'pink', n.triage, (i) => `${ref(i.number)} ${esc(i.title)}`],
  ].filter(([, , list]) => list.length);
  const lists = groups.map(([title, tone, list, line]) => `<div class="card group"><h3>${pill(title, tone)} <span class="meta">${list.length}</span></h3><ul class="rows">${list.map((i) => `<li class="row" data-m="row">${line(i)}</li>`).join('')}</ul></div>`);
  const w = n.watch;
  const state = (s) => ({ on: 'on', stale: 'stale', failing: 'failing', off: 'off' }[s] ?? 'off');
  const lines = [
    beat(w.state, `Watch ${state(w.state)}${w.always ? ' (always)' : ''}${w.tool ? ` in ${w.tool === 'codex' ? 'Codex' : 'Claude Code'}` : ''}${w.ageSeconds ? `, last check ${ago(w.ageSeconds)}` : ''}`),
    ...(n.player.state === 'off' ? [] : [beat(n.player.state, `Player watch ${state(n.player.state)}${n.player.ageSeconds ? `, last check ${ago(n.player.ageSeconds)}` : ''}`)]),
    ...n.waits.map((x) => beat(x.state, `Waiting on #${x.issue}: ${state(x.state)}${x.ageSeconds ? `, last check ${ago(x.ageSeconds)}` : ''}`)),
  ];
  const watch = `<div class="card group"><h3>Watch and waits</h3><ul class="rows">${lines.join('')}</ul></div>`;
  return `<div class="grid">${lists.length ? lists.join('') : `<div class="card group">${empty('Nothing is in progress and nothing waits for the Coach.')}</div>`}${watch}</div>`;
}

const table = (head, rows) => `<div class="table"><div class="thead">${head.map((h, i) => `<span class="${i ? 'num' : ''}">${esc(h)}</span>`).join('')}</div>${rows.join('')}</div>`;

function tokens(r, prices) {
  if (!r.people.length) return empty('No token usage in this range.');
  const maxTokens = Math.max(...r.people.map((p) => p.tokens));
  const people = r.people.map((p) => `<div class="trow" data-m="row"><span class="name"><span class="avatar">${esc(p.login.slice(0, 1).toUpperCase())}</span>${esc(p.login)}</span><span class="num">${fmtTokens(p.tokens)}</span><span class="num">${fmtMoney(p.cost)}</span><span class="num">${p.paid === null ? '—' : fmtMoney(p.paid)}</span>${bar(share(p.tokens, maxTokens), 'blue')}</div>`);
  const maxTool = Math.max(...r.tools.map((t) => t.tokens));
  const tools = r.tools.map((t) => `<div class="trow" data-m="row"><span class="name">${esc(t.name)}</span><span class="num">${fmtTokens(t.tokens)}</span><span class="num">${fmtMoney(t.cost)}</span>${bar(share(t.tokens, maxTool))}</div>`);
  const maxModel = Math.max(...r.models.map((m) => m.tokens));
  const models = r.models.map((m) => `<div class="trow" data-m="row"><span class="name">${esc(m.name)} <span class="meta">${esc(m.tool)}</span></span><span class="num">${fmtTokens(m.tokens)}</span><span class="num">${fmtMoney(m.cost)}</span>${bar(share(m.tokens, maxModel))}</div>`);
  const source = prices ? `API prices: ${esc(prices.source)}, ${esc(day(prices.date))}.` : 'No API prices could be read, so costs say «no price».';
  return `<div class="grid"><div class="card"><h3>Each person</h3>${table(['Person', 'Tokens', 'Would cost by API', 'Paid in plans'], people)}</div>
<div class="card"><h3>Each tool</h3>${table(['Tool', 'Tokens', 'Would cost by API'], tools)}</div>
<div class="card wide"><h3>Each model</h3>${table(['Model', 'Tokens', 'Would cost by API'], models)}</div></div><p class="note">${source} A shared plan is split per seat. Cached tokens without a listed price cost nothing here.</p>`;
}

function perIssueBlock(r) {
  const { issues, noIssue } = r.perIssue;
  if (!issues.length && !noIssue.tokens) return empty('No token usage by Issue in this range.');
  const max = Math.max(1, ...issues.map((i) => i.cost ?? 0));
  const rows = issues.slice(0, 25).map((i) => `<div class="trow" data-m="row"><span class="name">${ref(i.issue)}</span><span class="num">${fmtTokens(i.tokens)}</span><span class="num">${fmtMoney(i.cost)}</span><span class="num">${i.effort ?? '—'}</span><span class="num">${i.perPoint === null ? '—' : fmtMoney(i.perPoint)}</span>${bar(share(i.cost ?? 0, max), 'blue')}</div>`);
  if (noIssue.tokens) rows.push(`<div class="trow" data-m="row"><span class="name">no Issue</span><span class="num">${fmtTokens(noIssue.tokens)}</span><span class="num">${fmtMoney(noIssue.cost)}</span><span class="num">—</span><span class="num">—</span></div>`);
  return `<div class="card">${table(['Issue', 'Tokens', 'API cost', 'Effort', 'Per point'], rows)}</div>${issues.length > 25 ? `<p class="note">The 25 most expensive of ${issues.length} Issues.</p>` : ''}<p class="note">Cost per point is the API cost divided by the Issue's effort points; sorted by cost.</p>`;
}

function paceBlock(r) {
  const p = r.pace;
  const cards = [['Issues closed', String(p.closed)], ['Per week', fmtNumber(p.perWeek)], ['Median, start to merge', fmtHours(p.medianHours)], ['Review rounds, median per PR', fmtNumber(p.medianRounds)], ['Review rounds in all', String(p.rounds)]]
    .map(([label, value]) => `<div class="card stat"><span class="label">${esc(label)}</span><strong class="value">${count(value)}</strong></div>`);
  const max = Math.max(1, ...p.series.map((d) => d.count));
  const chart = p.series.length
    ? `<div class="card"><h3>Issues closed ${r.days === null || r.key === 'all' ? 'per week' : 'per day'}</h3><div class="chart">${p.series.map((d) => `<span class="col" title="${esc(d.label)}: ${d.count}"><i class="column" data-m="bar" data-h="${Math.round(share(d.count, max))}" style="--h:${Math.round(share(d.count, max))}%"></i></span>`).join('')}</div><div class="axis"><span>${esc(p.series[0].label)}</span><span>${esc(p.series.at(-1).label)}</span></div></div>`
    : empty('Nothing merged in this range.');
  return `<div class="stats">${cards.join('')}</div>${chart}`;
}

function releases(rel) {
  const staged = rel.staging
    ? `<div class="card group"><h3>${esc(rel.staging)} <span class="meta">not yet in ${esc(rel.base)}</span></h3><p class="big">${rel.total ? `${rel.tested} of ${rel.total} tested` : 'Nothing waits in staging'}</p>${rel.issues.length ? `<ul class="rows">${rel.issues.map((i) => `<li class="row" data-m="row">${ref(i.issue)} <span class="meta">PR #${esc(i.pr)}</span> ${i.tested ? pill('tested', 'green') : pill('not tested', 'orange')}</li>`).join('')}</ul>` : ''}${rel.warnings.map((w) => `<p class="warn">${esc(w.message)}</p>`).join('')}</div>`
    : '<div class="card group"><h3>No staging branch</h3><p class="note">Every merge goes straight to the default branch.</p></div>';
  const last = rel.last
    ? `<div class="card group"><h3>Last release</h3><p class="big">${esc(rel.last.tag)}</p><p class="note">${[rel.last.number ? `PR #${esc(rel.last.number)}` : '', rel.last.mergedAt ? esc(day(rel.last.mergedAt)) : ''].filter(Boolean).join(', ')}</p></div>`
    : '<div class="card group"><h3>Last release</h3><p class="note">No release found.</p></div>';
  return `<div class="grid">${staged}${last}</div>`;
}

/** A section whose content depends on the range: one pane per range, the chosen one shown. */
const panes = (model, build) => RANGES.map((r) => `<div class="pane" data-pane="${r.key}"${r.key === '30' ? '' : ' hidden'}>${build(model.ranges[r.key])}</div>`).join('');
const section = (id, title, body, { motion = true, sub = '' } = {}) => `<section id="${id}" class="sec"${motion ? ' data-m="section"' : ''}><h2>${esc(title)}</h2>${sub ? `<p class="sub">${esc(sub)}</p>` : ''}${body}</section>`;

const CSS = `
:root{color-scheme:dark;--bg:${STYLE_TOKENS.bg};--card:${STYLE_TOKENS.card};--card2:${STYLE_TOKENS.card2};--text:${STYLE_TOKENS.text};--muted:${STYLE_TOKENS.muted};--blue:${STYLE_TOKENS.blue};--blue2:${STYLE_TOKENS.blueText};--orange:${STYLE_TOKENS.orange};--pink:${STYLE_TOKENS.pink};--pink-text:${STYLE_TOKENS.pinkText};--green:${STYLE_TOKENS.green};--line:rgba(255,255,255,.05)}
*{box-sizing:border-box}
html{background:var(--bg)}
body{margin:0;background:var(--bg);color:var(--text);font:16px/1.5 system-ui,-apple-system,"Segoe UI",Roboto,"Helvetica Neue",Arial,sans-serif;-webkit-font-smoothing:antialiased;overflow-x:hidden}
.glows{position:fixed;inset:-10vmax;z-index:0;pointer-events:none;will-change:transform}
.glows i{position:absolute;width:55vmax;height:55vmax;border-radius:50%;filter:blur(90px);opacity:.34;animation:drift 26s ease-in-out infinite alternate}
.glows .g1{left:-8vmax;top:-6vmax;background:#7B4DFF}
.glows .g2{right:-10vmax;top:20vmax;background:#F0476B;animation-duration:32s;animation-delay:-8s;opacity:.22}
.glows .g3{left:25vmax;bottom:-18vmax;background:#2F6BFF;animation-duration:38s;animation-delay:-15s}
@keyframes drift{from{transform:translate3d(0,0,0) scale(1)}to{transform:translate3d(6vmax,-4vmax,0) scale(1.12)}}
main{position:relative;z-index:1;max-width:1120px;margin:0 auto;padding:28px 16px 72px}
header{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:16px;margin-bottom:28px}
h1{margin:0;font-size:clamp(26px,4vw,38px);letter-spacing:-.02em}
h2{margin:0 0 14px;font-size:22px;letter-spacing:-.01em}
h3{margin:0 0 10px;font-size:15px;font-weight:600;color:var(--text)}
.sub,.note,.meta,.label,.empty,.axis{color:var(--muted)}
.sub{margin:-8px 0 14px;font-size:14px}
.note{font-size:13px;margin:10px 0 0}
.meta{font-size:13px;font-weight:400}
.sec{margin-top:40px}
.card{background:var(--card);border:1px solid var(--line);border-radius:24px;padding:20px 22px;box-shadow:0 18px 40px rgba(0,0,0,.35);transition:transform .25s ease,box-shadow .25s ease}
.card:hover{transform:translateY(-3px);box-shadow:0 24px 50px rgba(0,0,0,.45)}
.card.stat{background:linear-gradient(160deg,var(--card2),var(--card))}
.stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));gap:16px;margin-bottom:16px}
.stat{display:flex;flex-direction:column;gap:4px}
.label{font-size:13px}
.value{font-size:clamp(24px,3.4vw,32px);letter-spacing:-.02em;font-variant-numeric:tabular-nums}
.savings{border-color:rgba(76,141,255,.35);animation:breathe 4.5s ease-in-out infinite}
.savings .value{color:var(--blue2)}
@keyframes breathe{0%,100%{box-shadow:0 18px 40px rgba(0,0,0,.35),0 0 0 rgba(47,107,255,0)}50%{box-shadow:0 18px 44px rgba(0,0,0,.4),0 0 38px rgba(47,107,255,.35)}}
.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:16px}
.grid .wide{grid-column:1/-1}
.rows{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:8px}
.row{display:flex;flex-wrap:wrap;align-items:center;gap:8px 12px;padding:8px 0;border-bottom:1px solid var(--line)}
.row:last-child{border-bottom:0}
.row .name{flex:1 1 140px;min-width:0;overflow-wrap:anywhere}
.row .track{flex:2 1 120px}
.row .pct{min-width:44px;text-align:right;font-variant-numeric:tabular-nums}
.row.total{font-weight:600}
.pill{display:inline-block;border-radius:999px;padding:2px 12px;font-size:13px;font-weight:600;background:rgba(255,255,255,.06)}
.pill.orange{color:var(--orange);background:rgba(245,165,36,.12)}
.pill.pink{color:var(--pink-text);background:rgba(240,71,107,.12)}
.pill.green{color:var(--green);background:rgba(95,208,104,.12)}
.pill.blue{color:var(--blue2);background:rgba(47,107,255,.16)}
.track{display:block;height:8px;border-radius:999px;background:rgba(255,255,255,.07);overflow:hidden}
.fill{display:block;height:100%;width:var(--w,0%);border-radius:999px;background:linear-gradient(90deg,#5A6CFF,var(--blue2))}
.fill.blue{background:linear-gradient(90deg,var(--blue),var(--blue2));box-shadow:0 0 14px rgba(47,107,255,.55)}
.dot{width:10px;height:10px;border-radius:50%;background:var(--muted);flex:none}
.dot.on{background:var(--green);box-shadow:0 0 10px var(--green)}
.dot.warn{background:var(--orange)}
.pulse{animation:pulse 1.8s ease-in-out infinite}
@keyframes pulse{0%,100%{opacity:1;transform:scale(1)}50%{opacity:.45;transform:scale(1.35)}}
.table{display:flex;flex-direction:column}
.thead,.trow{display:grid;grid-template-columns:minmax(120px,2fr) repeat(4,minmax(64px,1fr));gap:4px 12px;align-items:center}
.thead{font-size:12px;color:var(--muted);padding-bottom:8px;border-bottom:1px solid var(--line)}
.trow{padding:10px 0;border-bottom:1px solid var(--line)}
.trow:last-child{border-bottom:0}
.trow .track{grid-column:1/-1}
.num{text-align:right;font-variant-numeric:tabular-nums}
.avatar{display:inline-grid;place-items:center;width:26px;height:26px;margin-right:8px;border-radius:50%;background:linear-gradient(135deg,var(--blue),#7B4DFF);font-size:13px;font-weight:700}
.chart{display:flex;align-items:flex-end;gap:3px;height:150px;padding-top:6px}
.col{flex:1;display:flex;align-items:flex-end;height:100%;min-width:2px}
.column{display:block;width:100%;height:var(--h,0%);min-height:2px;border-radius:6px 6px 0 0;background:linear-gradient(180deg,var(--blue2),var(--blue));box-shadow:0 0 12px rgba(47,107,255,.45)}
.axis{display:flex;justify-content:space-between;font-size:12px;margin-top:8px}
.big{font-size:26px;font-weight:700;margin:4px 0}
.warn{color:var(--orange);font-size:14px}
.filter{position:relative;display:inline-flex;padding:4px;border-radius:999px;background:var(--card);border:1px solid var(--line)}
.filter .hl{position:absolute;top:4px;bottom:4px;left:0;width:0;border-radius:999px;background:linear-gradient(135deg,var(--blue),var(--blue2));box-shadow:0 0 18px rgba(47,107,255,.6);transition:transform .35s cubic-bezier(.2,.8,.2,1),width .35s cubic-bezier(.2,.8,.2,1)}
.filter button{position:relative;z-index:1;border:0;background:none;color:var(--muted);font:inherit;font-size:14px;padding:6px 16px;border-radius:999px;cursor:pointer}
.filter button[aria-pressed="true"]{color:#fff;font-weight:600}
.filter button:focus-visible{outline:2px solid var(--blue2);outline-offset:2px}
footer{margin-top:48px;color:var(--muted);font-size:13px}
[hidden]{display:none!important}
@media (max-width:640px){.thead,.trow{grid-template-columns:minmax(90px,2fr) repeat(4,minmax(52px,1fr));font-size:14px}.card{padding:16px}}
@media (prefers-reduced-motion: reduce){*,*::before,*::after{animation:none!important;transition:none!important;scroll-behavior:auto!important}}
`;

const FILTER_SCRIPT = `(function () {
  var root = document.querySelector('[data-filter]');
  if (!root) { return; }
  var buttons = Array.prototype.slice.call(root.querySelectorAll('button'));
  var hl = root.querySelector('.hl');
  function choose(key) {
    buttons.forEach(function (b) {
      var on = b.getAttribute('data-range') === key;
      b.setAttribute('aria-pressed', on ? 'true' : 'false');
      if (on && hl) { hl.style.width = b.offsetWidth + 'px'; hl.style.transform = 'translateX(' + b.offsetLeft + 'px)'; }
    });
    Array.prototype.forEach.call(document.querySelectorAll('[data-pane]'), function (p) {
      if (p.getAttribute('data-pane') === key) { p.removeAttribute('hidden'); } else { p.setAttribute('hidden', ''); }
    });
  }
  buttons.forEach(function (b) { b.addEventListener('click', function () { choose(b.getAttribute('data-range')); }); });
  choose('30');
})();`;

/** The whole page, as text. */
export function renderPage(model) {
  const filter = `<div class="filter" data-filter role="group" aria-label="Range"><span class="hl"></span>${RANGES.map((r) => `<button type="button" data-range="${r.key}" aria-pressed="${r.key === '30' ? 'true' : 'false'}">${esc(r.label)}</button>`).join('')}</div>`;
  const body = [
    `<header data-m="head"><div><h1>Huddle dashboard</h1><p class="sub">${esc(model.project)} · ${esc(day(model.generatedAt))}</p></div>${filter}</header>`,
    section('summary', 'Summary', panes(model, summary), { motion: false }),
    section('progress', 'Progress by area', progress(model.progress)),
    section('now', 'Who does what now', nowSection(model.now)),
    section('tokens', 'Tokens and cost', panes(model, (r) => tokens(r, model.prices))),
    section('per-issue', 'Cost per Issue', panes(model, perIssueBlock)),
    section('pace', 'Pace', panes(model, paceBlock), { sub: 'From the merged PRs/MRs: the work starts at the first commit of the PR/MR; a review round is a request for changes by the Coach.' }),
    section('releases', 'Releases', releases(model.releases)),
    `<footer>Written by huddle dashboard on this machine${model.prices ? `, API prices from ${esc(model.prices.source)}` : ''}. Nothing here leaves your computer.</footer>`,
  ].join('\n');
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="dark">
<title>Huddle dashboard</title>
<style>${CSS}</style>
</head>
<body>
<div class="glows" data-m="glow" aria-hidden="true"><i class="g1"></i><i class="g2"></i><i class="g3"></i></div>
<main>
${body}
</main>
<script>${FILTER_SCRIPT}</script>
<script src="gsap.min.js"></script>
<script src="ScrollTrigger.min.js"></script>
<script src="lenis.min.js"></script>
<script>${MOTION_SCRIPT}</script>
</body>
</html>
`;
}
