// Huddle: the release rule (Issue #65). Claude Code only sees an update when `version` changes, so the newest released section of CHANGELOG.md
// must be the version in plugin.json, package.json and marketplace.json. Pure: the test reads the files.
import { parseVersion } from './update.mjs';

/** The headings «## [x.y.z]» of the changelog, in file order; «Unreleased» is not one. Anything else in brackets is kept so it can be reported. */
export function releasedVersions(changelog) {
  return [...String(changelog).matchAll(/^## \[([^\]]+)\]/gm)].map((m) => m[1]).filter((v) => v.toLowerCase() !== 'unreleased');
}

const cmp = (a, b) => { for (let i = 0; i < 3; i++) if (a.core[i] !== b.core[i]) return a.core[i] - b.core[i]; return 0; };

/** The problems (strings), none when the release is consistent. `versions`: { plugin, pkg, marketplace? } (a missing marketplace version is fine). */
export function releaseProblems(changelog, versions) {
  const problems = [];
  const released = releasedVersions(changelog);
  for (const v of released) if (!parseVersion(v)) problems.push(`CHANGELOG.md has a released section «${v}» that is not a version`);
  if (problems.length) return problems;
  for (let i = 1; i < released.length; i++) {
    if (cmp(parseVersion(released[i - 1]), parseVersion(released[i])) <= 0) problems.push(`CHANGELOG.md released sections are not in order, newest first: ${released[i - 1]} then ${released[i]}`);
  }
  if (!released.length) return problems;
  const newest = released[0];
  const files = { 'plugin.json': versions.plugin, 'package.json': versions.pkg, 'marketplace.json': versions.marketplace };
  for (const [file, v] of Object.entries(files)) {
    if (v === undefined && file === 'marketplace.json') continue;
    if (v !== newest) problems.push(`${file} has version ${v}, but the newest released section of CHANGELOG.md is ${newest}`);
  }
  return problems;
}
