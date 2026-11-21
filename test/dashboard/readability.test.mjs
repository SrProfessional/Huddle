import test from 'node:test';
import assert from 'node:assert/strict';
import { runInNewContext } from 'node:vm';
import { buildModel } from '../../lib/dashboard/model.mjs';
import { renderPage } from '../../lib/dashboard/page.mjs';

const tokenRow = (tool, model) => ({ day: '2026-11-20', tool, model, input: 1000000, output: 0 });
const page = ({ complete = false } = {}) => renderPage(buildModel({
  now: new Date('2026-11-21T12:00:00Z'),
  project: 'acme/app', me: 'ana',
  progress: { areas: [] },
  usage: { people: { ana: [tokenRow('Claude Code', 'missing-claude'), tokenRow('Codex', 'gpt-5')] } },
  prices: { source: 'fixture', date: '2026-11-21', models: {
    'openai/gpt-5': { input: 0.00001812, output: 0 },
    ...(complete ? { 'missing-claude': { input: 0.000001, output: 0 } } : {}),
  } },
  plans: { plans: [{ tool: 'codex', plan: 'plus', monthly_usd: 20 }, { tool: 'claude', plan: 'max5', monthly_usd: 100 }],
    personal: { codex: 'plus', claude: 'max5' } },
  merged: [{ pr: 17, issues: [10, 11], mergedAt: '2026-11-21T10:00:00Z' }],
}));
const section = (html, id) => html.match(new RegExp('<section id="' + id + '"[^>]*>([\\s\\S]*?)</section>'))?.[1] ?? '';

test('token grids fit their cards with a column per header and wrap long values', () => {
  const html = page({ complete: true });
  const tokens = section(html, 'tokens');
  assert.match(tokens, /Each person<\/h3><div class="table" style="--cols:4">/);
  assert.match(tokens, /Each tool<\/h3><div class="table" style="--cols:3">/);
  assert.match(tokens, /Paid in plans/);
  assert.match(html, /\.thead,\.trow\{[^}]*repeat\(calc\(var\(--cols\) - 1\),minmax\(0,1fr\)\)/);
  assert.match(html, /\.thead > span,\.trow > span\{[^}]*overflow-wrap:anywhere/);
});

test('partial API data names the missing tool and model and separates plan costs', () => {
  const html = page();
  const summary = section(html, 'summary');
  const tokens = section(html, 'tokens');
  assert.match(summary, /\$18\.12<\/span> partial|\$18\.12 partial<\/span>/);
  assert.match(summary, /Claude Code: missing-claude/);
  assert.match(summary, /class="cost-breakdown"/);
  assert.doesNotMatch(summary, /Difference|plans cost (less|more)/);
  assert.doesNotMatch(tokens, /class="thead"[^>]*>[^\n]*Would cost by API[^\n]*Paid in plans<\/span><\/div>[^\n]*class="trow"/);
  for (const content of [summary, tokens]) {
    assert.match(content, /what these tokens would cost at API list prices/i);
    assert.match(content, /what the plans cost for the period/i);
  }
});

test('complete costs retain the comparison and both columns', () => {
  const html = page({ complete: true });
  assert.match(section(html, 'summary'), /Difference/);
  assert.match(section(html, 'tokens'), /Would cost by API<\/span><span class="num">Paid in plans/);
});

test('the daily chart exposes every UTC date and count, including zero, and localizes the axis', () => {
  const html = page();
  const pace = section(html, 'pace');
  const dates = [...pace.matchAll(/<button type="button" class="day-bar"[^>]*data-date="([^"]+)"[^>]*>/g)];
  assert.equal(dates.length, 37);
  assert.match(pace, /Sat 21 Nov/);
  assert.match(pace, /November/);
  assert.match(pace, /Saturday, 21 November 2026: 2 Issues closed/);
  assert.match(pace, /Friday, 20 November 2026: No Issues closed/);
  assert.match(pace, /data-h="100" style="--h:100%"/);
  assert.match(html, /\.day-bar:is\(:hover,:focus,\[aria-pressed="true"\]\)/);

  const script = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]).find((s) => s.includes('[data-day-chart]'));
  const date = { dataset: { date: '2026-11-21' }, textContent: '' };
  const month = { dataset: { month: '2026-11-01' }, textContent: '' };
  const bar = { dataset: { date: '2026-11-21', count: '2' }, attrs: {}, setAttribute(k, v) { this.attrs[k] = v; } };
  const friday = { dataset: { date: '2026-11-20', count: '0' }, setAttribute() {} };
  const detail = { textContent: 'Chart hint' };
  const activate = {};
  const chart = {
    querySelector: () => detail,
    querySelectorAll: (selector) => ({ '[data-day-label]': [date], '[data-month]': [month], '.day-bar': [friday, bar] })[selector],
    addEventListener: (event, handler) => { activate[event] = handler; },
  };
  for (const [language, label, heading] of [['en-US', 'Sat 21 Nov', 'November'], ['es-CO', 'sáb 21 nov', 'noviembre'], ['!', 'Sat 21 Nov', 'November']]) {
    runInNewContext(script, { navigator: { language }, document: { querySelectorAll: () => [chart] } });
    assert.equal(date.textContent, label);
    assert.equal(month.textContent, heading);
  }
  const target = { closest: () => bar };
  activate.pointerover({ target, pointerType: 'mouse' });
  assert.match(detail.textContent, /2 Issues closed/);
  activate.pointerout({ pointerType: 'mouse' });
  assert.equal(detail.textContent, 'Chart hint');
  activate.focusin({ target });
  assert.match(detail.textContent, /2 Issues closed/);
  activate.focusout({});
  assert.equal(detail.textContent, 'Chart hint');
  activate.click({ target: { closest: () => bar } });
  assert.equal(bar.attrs['aria-pressed'], 'true');
  assert.match(detail.textContent, /2 Issues closed/);
  activate.click({ target: { closest: () => bar } });
  assert.equal(bar.attrs['aria-pressed'], 'false');

  const fridayTarget = { closest: () => friday };
  activate.pointerover({ target: fridayTarget, pointerType: 'mouse' });
  assert.equal(detail.textContent, 'Friday, 20 November 2026: No Issues closed');
  activate.focusin({ target });
  assert.equal(detail.textContent, 'Saturday, 21 November 2026: 2 Issues closed');
  activate.pointerout({ pointerType: 'mouse' });
  assert.equal(detail.textContent, 'Saturday, 21 November 2026: 2 Issues closed');
  activate.pointerover({ target: fridayTarget, pointerType: 'mouse' });
  assert.equal(detail.textContent, 'Friday, 20 November 2026: No Issues closed');
});
