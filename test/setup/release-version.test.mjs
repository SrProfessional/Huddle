// Issue #65: a release keeps the version moving. The newest released section of CHANGELOG.md must be the version in
// .claude-plugin/plugin.json, package.json and .claude-plugin/marketplace.json, because Claude Code only sees an update when `version` changes.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { releaseProblems, releasedVersions } from '../../lib/core/release.mjs';

const read = (rel) => readFileSync(fileURLToPath(new URL(`../../${rel}`, import.meta.url)), 'utf8');

const CHANGELOG = '# Changelog\n\n## [Unreleased]\n\n- x\n\n## [0.4.0] - 2026-11-10\n\n- y\n\n## [0.3.0] - 2026-11-09\n';
const SAME = { plugin: '0.4.0', pkg: '0.4.0', marketplace: '0.4.0' };

test('releasedVersions lists the released sections in file order and skips «Unreleased»', () => {
  assert.deepEqual(releasedVersions(CHANGELOG), ['0.4.0', '0.3.0']);
  assert.deepEqual(releasedVersions('## [Unreleased]\n'), []);
});

test('releaseProblems: none when the newest released section is the version of the three files', () => {
  assert.deepEqual(releaseProblems(CHANGELOG, SAME), []);
  assert.deepEqual(releaseProblems(CHANGELOG, { ...SAME, marketplace: undefined }), [], 'a marketplace entry without a version is fine: plugin.json wins');
});

test('releaseProblems: names each file whose version is not the newest released one', () => {
  const problems = releaseProblems(CHANGELOG, { plugin: '0.3.0', pkg: '0.4.0', marketplace: '0.3.0' });
  assert.equal(problems.length, 2);
  assert.match(problems.join('\n'), /plugin\.json/);
  assert.match(problems.join('\n'), /marketplace\.json/);
  assert.doesNotMatch(problems.join('\n'), /package\.json/);
});

test('releaseProblems: the released sections must go from newest to oldest, and a released section is a real version', () => {
  assert.match(releaseProblems('## [0.3.0] - x\n\n## [0.4.0] - y\n', { plugin: '0.3.0', pkg: '0.3.0' }).join('\n'), /order/);
  assert.match(releaseProblems('## [soon] - x\n', SAME).join('\n'), /soon/);
});

test('this repo: CHANGELOG.md, plugin.json, package.json and marketplace.json agree on the released version', () => {
  const versions = {
    plugin: JSON.parse(read('.claude-plugin/plugin.json')).version,
    pkg: JSON.parse(read('package.json')).version,
    marketplace: JSON.parse(read('.claude-plugin/marketplace.json')).plugins[0].version,
  };
  assert.deepEqual(releaseProblems(read('CHANGELOG.md'), versions), []);
});
