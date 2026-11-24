// Issue #333: a path with spaces under «Allowed files» is read whole, not cut at its first space (docs/design.md §24). Canned bodies only.
import test from 'node:test';
import assert from 'node:assert/strict';
import { allowedFilesOf, suggestEffort } from '../../lib/core/effort.mjs';
import { sharedFiles, conflictReport } from '../../lib/core/conflicts.mjs';
import { schedule } from '../../lib/core/schedule.mjs';

const body = (...items) => `## Depends on\n\n- None\n\n## Allowed files\n\n${items.map((i) => `- ${i}`).join('\n')}\n\n## Contract or spec\n\nx\n`;
const files = (...items) => allowedFilesOf(body(...items));

test('a path with spaces is read whole, bare or annotated', () => {
  assert.deepEqual(files('Assets/1 Scenes/Mentor Dashboard/Mentor Dashboard.unity'), ['Assets/1 Scenes/Mentor Dashboard/Mentor Dashboard.unity']);
  assert.deepEqual(files('Assets/1 Scenes/Mentor Dashboard/Mentor Dashboard.unity (new)'), ['Assets/1 Scenes/Mentor Dashboard/Mentor Dashboard.unity']);
  assert.deepEqual(files('Assets/My Folder/x.cs — the reader', 'Assets/My Folder/y.cs – the writer', 'Assets/My Folder/z.cs - the tests'), ['Assets/My Folder/x.cs', 'Assets/My Folder/y.cs', 'Assets/My Folder/z.cs']);
});

test('the real GoSprout-style items', () => {
  assert.deepEqual(files(
    'GoSprout-Academy/Assets/1 Scenes/Mentor/Mentor Dashboard.unity (history row / Log Panel objects only)',
    'GoSprout-Academy/Assets/Scripts/Scenes/Apprentice Dashboard/Activity Section/ (ActivitiesController.cs, ApprenticeLogPanelController.cs)',
    'GoSprout-Academy/Assets/Scripts/Scenes/Apprentice Dashboard/Apprentice Data/ (the OJT model, only to drop the fallback field)',
  ), [
    'GoSprout-Academy/Assets/1 Scenes/Mentor/Mentor Dashboard.unity',
    'GoSprout-Academy/Assets/Scripts/Scenes/Apprentice Dashboard/Activity Section/',
    'GoSprout-Academy/Assets/Scripts/Scenes/Apprentice Dashboard/Apprentice Data/',
  ]);
});

test('a code span still wins, and a leading ./ is dropped', () => {
  assert.deepEqual(files('`Assets/1 Scenes/A.unity` (new)', '`./lib/a.mjs` the reader', './lib/b.mjs (x)'), ['Assets/1 Scenes/A.unity', 'lib/a.mjs', 'lib/b.mjs']);
});

test('a path followed by plain words keeps the old reading when its first word is a complete path', () => {
  // Safest reading: «lib/a.mjs the reader» has no parenthesis or dash, so nothing says where the path ends; a first word that ends in a file extension or «/» is complete (what every old Issue meant).
  assert.deepEqual(files('lib/a.mjs the reader', 'lib/dir/ the folder', 'README.md'), ['lib/a.mjs', 'lib/dir/', 'README.md']);
  // A first word that is not complete (no extension, no «/» at the end) keeps the whole text: this is how a bare path with spaces is read.
  assert.deepEqual(files('Assets/1 Scenes/Mentor/Main.unity'), ['Assets/1 Scenes/Mentor/Main.unity']);
});

test('old bodies give the same files as before wherever the first word was a complete path', () => {
  const old = (item) => (/`([^`]+)`/.exec(item)?.[1] ?? item.split(/\s+/)[0]).replace(/^\.\//, '');
  const corpus = ['lib/core/effort.mjs', '`lib/core/effort.mjs`', '`test/core/x.test.mjs` (new)', 'docs/design.md (§22 and §24 only)', 'lib/x.mjs — the reader', 'lib/x.mjs - the reader',
    'lib/x/ (A.mjs, B.mjs)', 'CHANGELOG.md', 'package.json (version only)', 'skills/huddle-play/SKILL.md, the start section', 'test/core/a.test.mjs (new), test/core/b.test.mjs (new)', 'None', '(none)', 'bin/huddle.'];
  for (const item of corpus) assert.equal(files(item).join(), [old(item)].filter((f) => !/^\(?none\)?\.?$/i.test(f)).join(), item);
});

test('a directory item covers what is under it, spaces included, and nothing else', () => {
  assert.deepEqual(sharedFiles(['Assets/1 Scenes/'], ['Assets/1 Scenes/Mentor Dashboard/x.unity']), ['Assets/1 Scenes/Mentor Dashboard/x.unity']);
  assert.deepEqual(sharedFiles(['Assets/1 Scenes/'], ['Assets/1 Other/x.unity']), []);
});

const issue = (number, ...items) => ({ number, title: `Issue ${number}`, labels: [], assignees: [], body: body(...items) });

test('two Issues on different scenes of a Unity-style tree no longer clash; the same file still does', () => {
  const a = issue(92, 'GoSprout-Academy/Assets/1 Scenes/Mentor Dashboard/Mentor Dashboard.unity');
  const b = issue(95, 'GoSprout-Academy/Assets/1 Scenes/Apprentice Dashboard/Apprentice Dashboard.unity');
  const c = issue(96, 'GoSprout-Academy/Assets/1 Scenes/Mentor Dashboard/Mentor Dashboard.unity (more)');
  assert.deepEqual(conflictReport([a, b]).rows, []);
  assert.deepEqual(conflictReport([a, c]).rows.map((r) => r.files), [['GoSprout-Academy/Assets/1 Scenes/Mentor Dashboard/Mentor Dashboard.unity']]);
  const { start, wait } = schedule({ active: [a], candidates: [b], capacity: 10 });
  assert.deepEqual(start.map((i) => i.number), [95]);
  assert.deepEqual(wait, []);
  const clash = schedule({ active: [a], candidates: [c], capacity: 10 });
  assert.equal(clash.wait.length, 1);
  assert.match(clash.wait[0].why, /shares GoSprout-Academy\/Assets\/1 Scenes\/Mentor Dashboard\/Mentor Dashboard\.unity with #92/);
});

test('suggestEffort counts a path with spaces once', () => {
  const n = (b) => Number(/(\d+) allowed files/.exec(suggestEffort(b).reasons.join(' '))?.[1] ?? 0);
  assert.equal(n(body('A/1 B/x.cs', 'A/1 B/y.cs', 'A/1 B/z.cs')), 3);
});
