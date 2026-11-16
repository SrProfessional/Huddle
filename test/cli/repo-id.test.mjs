// Issue #185: one repo, one id on this machine, whatever the case or the slashes of its path. On Windows the same folder comes as
// d:\x\repo or D:\x\repo (VS Code and a terminal differ); the per-repo files (marks, heartbeats, stamps) must be the same.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { labelsFiles, run } from '../../lib/cli/run.mjs';
import { harness, CONFIG } from './harness.mjs';

const at = (root, platform = 'win32') => ({ root, platform, updateCachePath: '/data/huddle-update.json' });

test('on Windows, d:\\x\\repo, D:\\x\\repo and D:/x/repo/ give the same files', () => {
  const { legacy, ...a } = labelsFiles(at('d:\\x\\repo'));
  void legacy;
  for (const form of ['D:\\x\\repo', 'D:/x/repo/', 'd:/X/Repo']) {
    const { legacy: old, ...b } = labelsFiles(at(form));
    void old;
    assert.deepEqual(b, a, form);
  }
});

test('a different folder gives another id; on Linux the case still matters', () => {
  assert.notEqual(labelsFiles(at('D:\\x\\other')).watchAlways, labelsFiles(at('D:\\x\\repo')).watchAlways);
  assert.notEqual(labelsFiles(at('/x/Repo', 'linux')).watchAlways, labelsFiles(at('/x/repo', 'linux')).watchAlways);
});

test('«always» set under the id of the old code (the raw root) is still read, and off clears both', async () => {
  const h = harness();
  h.ctx.updateCachePath = '/data/huddle-update.json';
  h.ctx.platform = 'win32';
  h.ctx.root = 'D:\\GitHub\\shop';
  const oldId = createHash('sha1').update('D:\\GitHub\\shop').digest('hex').slice(0, 12);
  h.ctx.writeFile(path.join('/data', `huddle-watch-${oldId}.always`), '1');
  h.ctx.root = 'd:\\GitHub\\shop'; // the same folder, written as another session writes it
  h.ctx.writeFile(path.join(h.ctx.root, 'huddle.json'), JSON.stringify(CONFIG)); // the commands load the config of this root
  assert.equal(await run(['status'], h.ctx), 0);
  assert.match(h.text(), /«always» is set/);
  await run(['queue', '--wait-off'], h.ctx);
  h.out.length = 0;
  h.ctx.root = 'D:\\GitHub\\shop';
  await run(['status'], h.ctx);
  assert.doesNotMatch(h.text(), /«always» is set/);
});
