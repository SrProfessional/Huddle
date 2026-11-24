// Issue #325, docs/design.md §20: a huddle.json written by a newer Huddle makes an older one warn, not fail. Both platforms run on the fake gh and glab.
import test from 'node:test';
import assert from 'node:assert/strict';
import { run } from '../../lib/cli/run.mjs';
import { harness, CONFIG, GITLAB_CONFIG } from './harness.mjs';

const LINE = 'huddle.json was written by Huddle 9.9.9 and this session runs 0.9.5: it ignores future_key. Reload the plugin (/reload-plugins, or open a new session) to use the new version.';
const LABELS = ['ready', 'assigned', 'in progress', 'in review', 'blocked', 'needs decision', 'changes requested from Coach'];

/** A harness whose huddle.json has a key this Huddle does not know, and whose plugin.json says `installed`. */
function mk(base, extra, installed = '0.9.5', opts = {}) {
  const h = harness({ gitlab: base.platform === 'gitlab', file: JSON.stringify({ ...base, ...extra }), wrap: (a) => ({ ...a, listLabels: async () => LABELS }), ...opts });
  const read = h.ctx.readFile;
  h.ctx.pluginRoot = '/plugin';
  h.ctx.readFile = (p) => (p.replaceAll('\\', '/') === '/plugin/.claude-plugin/plugin.json' ? JSON.stringify({ version: installed }) : read(p));
  return h;
}
const NEWER = { setup_version: '9.9.9', future_key: 'x' };

for (const [name, base] of [['github', CONFIG], ['gitlab', GITLAB_CONFIG]]) {
  test(`${name}: a command works with a newer huddle.json and says one line on stderr`, async () => {
    const h = mk(base, NEWER);
    assert.equal(await run(['queue'], h.ctx), 0);
    assert.deepEqual(h.err, [LINE]);
  });

  test(`${name}: --json output stays clean JSON, the line is not in it`, async () => {
    const h = mk(base, NEWER);
    assert.equal(await run(['queue', '--json'], h.ctx), 0);
    assert.doesNotThrow(() => JSON.parse(h.text()));
    assert.doesNotMatch(h.text(), /huddle\.json was written/);
    assert.deepEqual(h.err, [LINE]);
  });

  test(`${name}: an unknown key with a setup_version that is not newer fails exactly as before`, async () => {
    for (const extra of [{ future_key: 'x' }, { setup_version: '0.9.5', future_key: 'x' }, { setup_version: '0.9.4', future_key: 'x' }]) {
      const h = mk(base, extra);
      assert.equal(await run(['queue'], h.ctx), 1);
      assert.deepEqual(h.err, ['huddle queue: huddle.json: "future_key" is not allowed']);
    }
  });

  test(`${name}: a wrong value stays an error when the file is newer`, async () => {
    const h = mk(base, { ...NEWER, max_open_per_person: 'two' });
    assert.equal(await run(['queue'], h.ctx), 1);
    assert.match(h.errText(), /"max_open_per_person" must be of type integer/);
  });

  test(`${name}: doctor warns once, names both versions and the action`, async () => {
    const h = mk(base, { setup_version: '1.0.3', future_key: 'x' });
    h.ctx.setupStatus = () => ({ state: 'newer', setupVersion: '1.0.3', installed: '0.9.5', pending: [], changed: [] });
    assert.equal(await run(['doctor'], h.ctx), 0);
    const lines = h.text().split('\n').filter((l) => /setup:/.test(l));
    assert.deepEqual(lines, ['⚠ setup: this session runs 0.9.5 but the repo is set up for 1.0.3: reload the plugin (/reload-plugins, or open a new session)']);
    assert.match(h.text(), /✔ huddle\.json: valid/);
    assert.deepEqual(h.err, [], 'doctor says it in its own line, not twice');
  });
}

test('doctor says the same when setupStatus cannot be read', async () => {
  const h = mk(CONFIG, { setup_version: '1.0.3', future_key: 'x' });
  h.ctx.setupStatus = () => null;
  await run(['doctor'], h.ctx);
  assert.match(h.text(), /⚠ setup: this session runs 0\.9\.5 but the repo is set up for 1\.0\.3: reload the plugin/);
});

test('doctor: a newer repo with no unknown key still says reload the plugin', async () => {
  const h = mk(CONFIG, { setup_version: '1.0.3' });
  h.ctx.setupStatus = () => ({ state: 'newer', setupVersion: '1.0.3', installed: '0.9.5', pending: [], changed: [] });
  await run(['doctor'], h.ctx);
  assert.match(h.text(), /⚠ setup: this session runs 0\.9\.5 but the repo is set up for 1\.0\.3: reload the plugin/);
});

test('doctor: equal versions with files to refresh name the files, not the versions again', async () => {
  const h = mk(CONFIG, {}, '1.0.3');
  h.ctx.setupStatus = () => ({ state: 'needs', setupVersion: '1.0.3', installed: '1.0.3', pending: [], changed: ['CLAUDE.md', '.github/ISSUE_TEMPLATE/bug.yml'] });
  await run(['doctor'], h.ctx);
  const line = h.text().split('\n').find((l) => / setup:/.test(l));
  assert.match(line, /^⚠ setup: the version is the same \(1\.0\.3\), but these files differ from what this Huddle writes: CLAUDE\.md, \.github\/ISSUE_TEMPLATE\/bug\.yml; run \/huddle-update to refresh them/);
});

test('doctor: equal versions with a pending question name the question', async () => {
  const h = mk(CONFIG, {}, '1.0.3');
  h.ctx.setupStatus = () => ({ state: 'needs', setupVersion: '1.0.3', installed: '1.0.3', pending: ['language'], changed: [] });
  await run(['doctor'], h.ctx);
  assert.match(h.text(), /⚠ setup: .*question.*language.*\/huddle-update/);
});

test('the hook stays silent about a newer file', async () => {
  const h = mk(CONFIG, NEWER);
  await run(['hook'], h.ctx);
  assert.doesNotMatch(h.errText(), /written by Huddle/);
});
