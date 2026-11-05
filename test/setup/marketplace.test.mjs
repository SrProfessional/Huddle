// Huddle: the repo is its own plugin marketplace (Issue #22). It only reads files.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const read = (rel) => readFileSync(fileURLToPath(new URL(`../../${rel}`, import.meta.url)), 'utf8');
const marketplace = () => JSON.parse(read('.claude-plugin/marketplace.json'));

test('marketplace.json names the marketplace «huddle» and its owner', () => {
  const m = marketplace();
  assert.equal(m.name, 'huddle');
  assert.ok(m.owner && typeof m.owner.name === 'string' && m.owner.name.length > 0, 'owner.name is required');
});

test('marketplace.json lists exactly one plugin, «huddle», whose source is the repo root', () => {
  const { plugins } = marketplace();
  assert.equal(plugins.length, 1);
  assert.equal(plugins[0].name, 'huddle');
  assert.match(plugins[0].source, /^\.\/?$/, 'a relative source must start with ./ and here point at the root');
  assert.ok(plugins[0].description.length > 0);
});

test('the versions of plugin.json, marketplace.json and package.json are equal', () => {
  const plugin = JSON.parse(read('.claude-plugin/plugin.json')).version;
  const entry = marketplace().plugins[0].version;
  const pkg = JSON.parse(read('package.json')).version;
  assert.match(pkg, /^\d+\.\d+\.\d+/);
  assert.equal(entry, pkg);
  assert.equal(plugin, pkg);
});

test('the docs show the install through the marketplace and the project settings snippet', () => {
  const all = ['README.md', 'docs/first-day.md', 'docs/team-guide.md'].map(read);
  assert.match(all[0], /\/plugin marketplace add SrProfessional\/Huddle/);
  assert.match(all[0], /\/plugin install huddle@huddle/);
  assert.match(all[0], /"extraKnownMarketplaces"/);
  assert.match(all[0], /"huddle@huddle": true/);
  assert.match(all[2], /\/plugin marketplace update huddle/);
  for (const t of all) assert.doesNotMatch(t, /SrProfessional\/huddle\b/, 'the clone URL case is SrProfessional/Huddle');
});
