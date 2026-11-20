// Issue #209: each person's language, in Claude Code and in OpenAI Codex. First that is set: the person's own choice (`huddle language`,
// or Claude Code's `language` setting), the team's (`language` in huddle.json), the machine's locale. The session start says it.
import test from 'node:test';
import assert from 'node:assert/strict';
import { run, resolveLanguage } from '../../lib/cli/run.mjs';
import { harness, CONFIG } from './harness.mjs';
import { QUESTIONS, pendingQuestions } from '../../lib/setup/questions.mjs';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const PERSONAL = '/home/.huddle/language.json';
const CLAUDE = '/home/.claude/settings.json';
function mk({ team, personal, claude, locale = 'en-US' } = {}) {
  const h = harness({ config: { ...CONFIG, ...(team !== undefined && { language: team }) }, setup: (w) => w.issue({ number: 5 }) });
  Object.assign(h.ctx, { languageFile: PERSONAL, claudeSettingsPath: CLAUDE, locale });
  if (personal) h.ctx.writeFile(PERSONAL, JSON.stringify({ language: personal }));
  if (claude) h.ctx.writeFile(CLAUDE, JSON.stringify({ language: claude, model: 'x' }));
  return h;
}
const config = (h) => JSON.parse(h.huddleJson());

test('the order: the person\'s own choice, then Claude Code\'s language, then the team\'s, then the machine\'s', () => {
  assert.deepEqual(resolveLanguage(mk({ personal: 'es', claude: 'french', team: 'de' }).ctx, { language: 'de' }), { language: 'es', source: 'personal' });
  let h = mk({ claude: 'spanish', team: 'de' });
  assert.deepEqual(resolveLanguage(h.ctx, config(h)), { language: 'spanish', source: 'claude' });
  h = mk({ team: 'es' });
  assert.deepEqual(resolveLanguage(h.ctx, config(h)), { language: 'es', source: 'team' });
  h = mk({ locale: 'en-US' });
  assert.deepEqual(resolveLanguage(h.ctx, config(h)), { language: 'en-US', source: 'machine' });
  h = mk({ team: '', locale: 'pt-BR' });
  assert.deepEqual(resolveLanguage(h.ctx, config(h)), { language: 'pt-BR', source: 'machine' }, 'an empty team answer means each machine');
});

test('huddle language prints it with its source, sets the personal one and clears it', async () => {
  const h = mk({ team: 'es' });
  assert.equal(await run(['language'], h.ctx), 0);
  assert.match(h.text(), /es.*team.*huddle\.json/);
  h.out.length = 0;
  assert.equal(await run(['language', 'en'], h.ctx), 0);
  assert.deepEqual(JSON.parse(h.ctx.readFile(PERSONAL)), { language: 'en' });
  assert.deepEqual(resolveLanguage(h.ctx, config(h)), { language: 'en', source: 'personal' });
  assert.equal(await run(['language', '--clear'], h.ctx), 0);
  assert.deepEqual(resolveLanguage(h.ctx, config(h)), { language: 'es', source: 'team' });
  assert.equal(await run(['language', 'a', 'b'], h.ctx), 2);
});

for (const tool of ['claude', 'codex']) {
  test(`the session start in ${tool} tells the session which language to chat in`, async () => {
    const h = mk({ team: 'es' });
    h.ctx.tool = tool;
    h.ctx.pluginRoot = '/plugin';
    assert.equal(await run(['hook'], h.ctx), 0);
    const out = JSON.parse(h.text());
    assert.match(out.hookSpecificOutput.additionalContext, /Huddle: chat with this person in es \(the team's language, from huddle\.json\)/);
    assert.match(out.hookSpecificOutput.additionalContext, /everything written to the repo stays in English/);
    assert.equal(out.systemMessage, undefined, 'the person does not see it');
  });
}

test('the update asks the team language once, in a repo set up before 0.9.6 that has no language key', () => {
  const q = QUESTIONS.find((x) => x.key === 'language');
  assert.ok(q);
  assert.equal(q.since, '0.9.6');
  assert.ok(pendingQuestions({ setup_version: '0.9.5' }).some((x) => x.key === 'language'));
  assert.ok(!pendingQuestions({ setup_version: '0.9.5', language: 'es' }).some((x) => x.key === 'language'));
  const schema = JSON.parse(readFileSync(fileURLToPath(new URL('../../huddle.schema.json', import.meta.url)), 'utf8'));
  assert.equal(schema.properties.language.type, 'string');
});

test('the block\'s Language rules give the same order', () => {
  const t = readFileSync(fileURLToPath(new URL('../../templates/CLAUDE.huddle.md', import.meta.url)), 'utf8').replace(/\s+/g, ' ');
  assert.match(t, /the language the session start names/);
  assert.match(t, /`huddle language`/);
  assert.match(t, /`language` in `huddle\.json`/);
});

test('the setup skill asks the team language on a first install and passes it as --language', () => {
  const t = readFileSync(fileURLToPath(new URL('../../skills/huddle-setup/SKILL.md', import.meta.url)), 'utf8').replace(/\s+/g, ' ');
  assert.match(t, /\*\*Language:\*\* «In which language should the sessions chat with the team/);
  assert.match(t, /`--language <code>`/);
});
