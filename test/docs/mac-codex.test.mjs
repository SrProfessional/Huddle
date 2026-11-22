// Issue #246: the macOS Codex setup and the Coach's watch across two computers.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');
const guide = read('docs/team-guide.md').split('## A mixed team: Claude Code and Codex')[1].split('\n## ')[0];
const readme = read('README.md').split('### In OpenAI Codex')[1].split('\n### ')[0];
const site = read('site/get-started/index.html').split('<h3 id="codex">In OpenAI Codex</h3>')[1].split('</section>')[0];
const macHeading = 'Set up Huddle on a Mac with Codex';
const language = 'node ~/.codex/plugins/cache/huddle/huddle/*/bin/huddle language es';

for (const [name, section, numberedStep] of [
  ['team guide', guide, /^\d+\. 🙋/m],
  ['get-started page', site, /<ol[^>]*>[\s\S]*?<li>[^\n]*🙋/],
]) {
  test(`${name} gives numbered Mac setup instructions through the first Codex chat`, () => {
    const [, steps] = section.split(macHeading);
    assert.ok(steps, 'missing Mac setup');
    assert.match(steps, numberedStep);
    for (const text of [
      'Homebrew', 'brew install node gh git', 'gh auth login', 'npm install -g @openai/codex',
      'VS Code', 'sign in', 'gh repo clone', '.codex/config.toml', 'codex plugin marketplace add SrProfessional/Huddle',
      'codex plugin marketplace upgrade huddle', 'codex plugin add huddle@huddle', '/hooks', 'SessionStart',
      '/exit', language, 'new Codex chat', 'You should see:', 'If you see something else:',
    ]) {
      assert.ok(steps.includes(text), `missing ${text}`);
    }
    assert.match(steps, /Codex on macOS[^.]*adapted[^.]*not yet tried live/i);
    assert.match(steps, /codex plugin marketplace add SrProfessional\/Huddle[\s\S]*codex plugin marketplace upgrade huddle[\s\S]*codex plugin add huddle@huddle[\s\S]*\/hooks[\s\S]*\/exit[\s\S]*language es[\s\S]*new Codex chat/);
  });
}

for (const [name, section] of [['README', readme], ['team guide', guide], ['get-started page', site]]) {
  test(`${name} gives the Coach the one-watch rule for two computers`, () => {
    const text = section.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ');
    assert.match(text, /one watch per repo per machine/i);
    assert.ok(text.includes('~/.huddle'));
    assert.match(text, /\$huddle-watch off.*\/huddle-watch off.*before.*other/i);
    assert.match(text, /Players may work on both/i);
  });
}

test('the README sends Mac users to the numbered setup', () => {
  assert.match(readme, /docs\/team-guide\.md#set-up-huddle-on-a-mac-with-codex/);
});
