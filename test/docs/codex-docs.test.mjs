// Issue #227 (H93), docs/design.md §25: the README, the team guide and the website tell the 0.9.6 story: Huddle works in
// Claude Code and in OpenAI Codex, with the Codex install, one watch per repo and what is not yet tried live in Codex.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const raw = (rel) => readFileSync(fileURLToPath(new URL(`../../${rel}`, import.meta.url)), 'utf8');
/** The text a reader sees: tags dropped, a few entities decoded, whitespace collapsed. */
const flat = (rel) => raw(rel)
  .replace(/<script[\s\S]*?<\/script>/g, ' ').replace(/<style[\s\S]*?<\/style>/g, ' ')
  .replace(/<[^>]+>/g, ' ')
  .replace(/&laquo;/g, '«').replace(/&raquo;/g, '»').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
  .replace(/\s+/g, ' ');

test('the home page says «Claude Code and OpenAI Codex» in its hero and answers whether it works with Codex', () => {
  const t = raw('site/index.html');
  const hero = t.split('data-scene="problem"')[0];
  assert.match(hero, /<p class="lead">[^<]*Claude Code and OpenAI Codex/);
  assert.match(t, /<summary>Does it work with OpenAI Codex\?<\/summary>/);
  assert.match(flat('site/index.html'), /codex plugin marketplace add SrProfessional\/Huddle/);
});

test('the get-started page gives the Codex install next to Claude Code\'s', () => {
  const t = flat('site/get-started/index.html');
  assert.match(t, /codex plugin marketplace add SrProfessional\/Huddle/);
  assert.match(t, /codex plugin add huddle@huddle/);
  assert.match(t, /codex plugin marketplace upgrade huddle/);
  assert.match(t, /codex --no-daemon/);
  assert.match(t, /\$huddle-play/);
});

test('the README names both tools in its first paragraph', () => {
  const first = raw('README.md').split(/\r?\n\r?\n/).find((p) => p.startsWith('Huddle is'));
  assert.ok(first, 'no first paragraph starting with «Huddle is»');
  assert.match(first, /Claude Code and OpenAI Codex/);
});

test('the how-it-works page says sessions can be Claude Code or Codex, the Codex wake-up and one watch per repo', () => {
  const t = flat('site/how-it-works/index.html');
  assert.match(t, /Claude Code or OpenAI Codex/);
  assert.match(t, /huddle wait <n> --codex/);
  assert.match(t, /one watch per repo/i);
});

test('the README and the team guide list what is adapted but not yet tried live in Codex', () => {
  for (const f of ['README.md', 'docs/team-guide.md']) {
    const t = flat(f);
    assert.match(t, /not yet tried live in Codex/i, f);
    for (const w of ['/huddle-bug', '/huddle-areas', '/huddle-team', 'GitLab', 'macOS']) assert.ok(t.includes(w), `${f}: ${w}`);
  }
});

test('the team guide\'s mixed team covers take over, the Coach in Codex and a new chat after updating', () => {
  const g = raw('docs/team-guide.md');
  const m = g.match(/^## A mixed team: Claude Code and Codex\r?\n([\s\S]*?)(?=^## )/m);
  assert.ok(m, 'no «A mixed team» section');
  const s = m[1];
  assert.match(s, /--take-over/);
  assert.match(s, /Take over\?/);
  assert.match(s, /queue --wait --codex/);
  assert.match(s, /new chat/);
  assert.match(s, /\/huddle-update/);
  assert.doesNotMatch(g.split('\n').slice(0, 5).join('\n'), /works with Claude Code under Huddle/, 'the guide opens as Claude Code only');
});

test('the CHANGELOG has the Codex docs and website under «Unreleased»', () => {
  const unreleased = raw('CHANGELOG.md').split(/^## \[\d/m)[0];
  assert.match(unreleased, /#227/);
});

test('the home page says each person gets their language, and no longer asks for a label-job token', () => {
  const home = readFileSync(fileURLToPath(new URL('../../site/index.html', import.meta.url)), 'utf8').replace(/\s+/g, ' ');
  assert.match(home, /Does it speak my language\?/);
  assert.match(home, /chats with each person in their language from the first message/);
  assert.doesNotMatch(home, /only token is a GitLab CI variable/);
});
