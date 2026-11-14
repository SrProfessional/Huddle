// Issue #119: GitHub counts the worst case of a GraphQL query (every `first:` multiplied down a nested path) and refuses one over 500,000 nodes.
// Fakes only: the adapter gets canned `gh` answers, never a real GitHub.
import test from 'node:test';
import assert from 'node:assert/strict';
import { fakeGithub } from './fake-gh.mjs';
import { createGithub } from '../../lib/platform/github.mjs';

const NODE_LIMIT = 500000;
const worstCase = (query) => [...query.matchAll(/\bfirst: (\d+)/g)].reduce((product, m) => product * Number(m[1]), 1);

for (const [label, config] of [['with a staging branch', { staging_branch: 'staging' }], ['without one', {}]]) {
  test(`[github] the milestone query ${label} stays well under GitHub's node limit, and paging still reaches every milestone and Issue`, async () => {
    const { run, world } = fakeGithub();
    const queries = [];
    const adapter = createGithub({ project: 'acme/app', ...config }, { run: (args, opts) => { queries.push(...args.filter((a) => /^query=.*milestones\(/.test(a))); return run(args, opts); } });
    for (const title of ['A', 'B', 'C', 'D', 'E']) world.milestone({ title });
    for (let n = 1; n <= 7; n++) world.issue({ number: n, milestone: n % 2 ? 'A' : 'E', state: 'merged' });
    const found = await adapter.listMilestones();
    assert.deepEqual(found.map((m) => m.title).sort(), ['A', 'B', 'C', 'D', 'E']);
    assert.equal(found.reduce((sum, m) => sum + m.issues.length, 0), 7);
    assert.ok(queries.length >= 1);
    for (const q of queries) assert.ok(worstCase(q) < NODE_LIMIT * 0.8, `worst case ${worstCase(q)} leaves no room under ${NODE_LIMIT}`);
  });
}
