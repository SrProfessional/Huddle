import test from 'node:test';
import assert from 'node:assert/strict';
import { run } from '../../lib/cli/run.mjs';
import { harness } from './harness.mjs';

// Issue #113: `huddle labels --issue <n>` reads and changes one Issue (and, when it is closed, the Issues that wait for it).
const dep = (...ns) => `## Goal\n\nx\n\n## Depends on\n\n${ns.length ? ns.map((n) => `- #${n}`).join('\n') : '- None'}\n`;
const ask = '🔁 Changes requested\n\n## Prompt for Claude Code\n\n```text\nDo X\n```\n';

/** Wraps the adapter so every operation is recorded as `name(args)`: tests assert what was read and changed, not only the result. */
const recorder = (log) => (adapter) => new Proxy(adapter, {
  get: (target, prop) => (typeof target[prop] === 'function' ? (...args) => { log.push(`${String(prop)}(${args.map((a) => JSON.stringify(a)).join(',')})`); return target[prop](...args); } : target[prop]),
});
const names = (log) => [...new Set(log.map((l) => l.slice(0, l.indexOf('('))))];
const callsOf = (log, op) => log.filter((l) => l.startsWith(`${op}(`));

// A repo with: 10 open + started, 11 in review, 12 stopped for a decision, 13 with a request pending, 20 closed (merged),
// 21 waits for 20 only, 22 waits for 20 and for 30, 30 open, 40 open and unrelated, 50 open and unmanaged, 99 closed and outside any scope.
const world = (w) => {
  w.issue({ number: 10, body: dep(), assignees: ['ana'], labels: ['in progress'] });
  w.issue({ number: 11, body: dep(), assignees: ['ana'], labels: ['in progress'], reviews: [61] });
  w.review({ number: 61 });
  w.issue({ number: 12, body: dep(), assignees: ['ana'], labels: ['in progress', 'needs decision'] });
  w.comment(12, { id: 700, author: 'ana', body: '❓ Decision for the AI Manager: which one?', createdAt: '2026-11-05T10:00:00Z' });
  w.issue({ number: 13, body: dep(), assignees: ['ana'], labels: ['in review'], reviews: [62] });
  w.review({ number: 62 });
  w.comment(13, { id: 701, author: 'SrProfessional', body: ask, createdAt: '2026-11-05T11:00:00Z' });
  w.issue({ number: 20, state: 'merged', labels: ['in review', 'needs decision'] });
  w.issue({ number: 21, body: dep(20), labels: ['blocked'] });
  w.issue({ number: 22, body: dep(20, 30), labels: ['blocked'] });
  w.issue({ number: 30, body: dep() });
  w.issue({ number: 40, body: dep(), labels: ['ready'] });
  w.issue({ number: 50, body: 'No sections here.' });
  w.issue({ number: 99, state: 'merged', labels: ['ready'] });
};

for (const gitlab of [false, true]) {
  const kind = gitlab ? 'gitlab' : 'github';
  const make = (extra = {}) => { const log = []; return { log, h: harness({ gitlab, setup: world, wrap: recorder(log), ...extra }) }; };

  test(`[${kind}] without --issue the full run is what it was: it reads the closed list and the comments of every managed Issue`, async () => {
    const { log, h } = make();
    assert.equal(await run(['labels'], h.ctx), 0);
    assert.ok(names(log).includes('listClosedIssues'));
    assert.ok(!names(log).includes('issueLabels'));
    assert.ok(callsOf(log, 'comments').some((l) => l.startsWith('comments(40')), 'it reads the comments of Issue 40');
    assert.deepEqual(h.world.labelsOf(99), [], 'the full run cleans every closed Issue');
  });

  test(`[${kind}] open n: only n is read and changed (assigned, then started)`, async () => {
    const { log, h } = make();
    h.world.issue({ number: 14, body: dep(), assignees: ['ana'], labels: [] });
    assert.equal(await run(['labels', '--issue', '14'], h.ctx), 0);
    assert.deepEqual(h.world.labelsOf(14), ['assigned']);
    assert.match(h.text(), /1 label change\(s\)\./);
    for (const bad of ['listClosedIssues', 'assign', 'listLabels', 'ensureLabels', 'findIssuesByTitle', 'listMilestones']) assert.ok(!names(log).includes(bad), `${bad} was called`);
    assert.deepEqual(callsOf(log, 'comments'), ['comments(14)']);
    assert.deepEqual(h.world.labelsOf(40), ['ready'], 'an Issue outside the scope is untouched');
    assert.equal(await run(['labels', '--issue', '10'], h.ctx), 0, 'started: «in progress» stays');
    assert.deepEqual(h.world.labelsOf(10), ['in progress']);
    assert.match(h.out.at(-1), /^0 label change\(s\)\.$/);
  });

  test(`[${kind}] open n: in review, stopped for a decision and a request pending come out right`, async () => {
    const { h } = make();
    assert.equal(await run(['labels', '--issue', '11'], h.ctx), 0);
    assert.deepEqual(h.world.labelsOf(11).sort(), ['in review']);
    assert.equal(await run(['labels', '--issue', '12'], h.ctx), 0);
    assert.deepEqual(h.world.labelsOf(12), ['needs decision'], 'a stop label stays on a pending question');
    assert.equal(await run(['labels', '--issue', '13'], h.ctx), 0);
    assert.deepEqual(h.world.labelsOf(13).sort(), ['changes requested from AI Manager']);
  });

  test(`[${kind}] open n: nothing else is read: no comment of another Issue, no assignment, no progress update, no cleanup`, async () => {
    const { log, h } = make();
    assert.equal(await run(['labels', '--issue', '13'], h.ctx), 0);
    assert.ok(callsOf(log, 'comments').every((l) => l.startsWith('comments(13') || l.startsWith('comments(62')), callsOf(log, 'comments').join(' '));
    assert.ok(!names(log).some((n) => ['assign', 'listClosedIssues', 'createIssue', 'updateIssue', 'findIssuesByTitle'].includes(n)));
    assert.deepEqual(h.world.labelsOf(20).sort(), ['in review', 'needs decision'], 'the closed Issue keeps its stale labels');
  });

  test(`[${kind}] closed n: its dependents are relabelled, the ready one is assigned by the AI Manager, the one still blocked is not`, async () => {
    const { log, h } = make();
    assert.equal(await run(['labels', '--issue', '20'], h.ctx), 0);
    assert.deepEqual(h.world.labelsOf(21), ['assigned']);
    assert.equal(h.world.assigneesOf(21).length, 1);
    assert.deepEqual(h.world.labelsOf(22), ['blocked']);
    assert.deepEqual(h.world.assigneesOf(22), []);
    assert.deepEqual(h.world.labelsOf(20), [], 'n loses its stale Huddle labels');
    assert.deepEqual(h.world.labelsOf(99), ['ready'], 'a closed Issue outside the scope is untouched');
    assert.deepEqual(h.world.labelsOf(40), ['ready']);
    assert.ok(!names(log).includes('listClosedIssues'));
    assert.ok(names(log).includes('issueLabels'));
    assert.ok(callsOf(log, 'issueState').every((l) => ['issueState(20)', 'issueState(30)'].includes(l)), 'only the dependencies of the scope are read');
    assert.ok(callsOf(log, 'comments').every((l) => /^comments\((21|22)\)/.test(l)));
  });

  test(`[${kind}] closed n: the progress Issue is updated`, async () => {
    const { log, h } = make();
    h.world.milestone({ title: 'Area' });
    assert.equal(await run(['labels', '--issue', '20'], h.ctx), 0);
    assert.ok(names(log).includes('findIssuesByTitle'));
    assert.equal(h.world.created().length, 1);
  });

  test(`[${kind}] closed n run by a login that is not the AI Manager: labels change, nothing is assigned, the skip line is printed`, async () => {
    const { h } = make({ wrap: (a) => ({ ...a, me: async () => 'ana' }) });
    assert.equal(await run(['labels', '--issue', '20'], h.ctx), 0);
    assert.deepEqual(h.world.labelsOf(21), ['ready']);
    assert.deepEqual(h.world.assigneesOf(21), []);
    assert.match(h.text(), /assignment skipped: only the AI Manager assigns/);
  });

  test(`[${kind}] n is not an Issue: one line, exit 1`, async () => {
    const { h } = make();
    assert.equal(await run(['labels', '--issue', '61'], h.ctx), 1);
    assert.equal(h.errText().split('\n').length, 1);
    assert.match(h.errText(), /#61 is not an Issue/);
    assert.equal(await run(['labels', '--issue', '777'], h.ctx), 1);
  });

  test(`[${kind}] open n without «Depends on»: said in one line, nothing changed, exit 0`, async () => {
    const { log, h } = make();
    assert.equal(await run(['labels', '--issue', '50'], h.ctx), 0, h.errText());
    assert.match(h.text(), /#50 has no «Depends on» section: not managed by Huddle, nothing changed/);
    assert.ok(!names(log).includes('setLabels'));
  });

  test(`[${kind}] --issue with a missing, non-numeric or zero value prints the usage and exits 2`, async () => {
    for (const argv of [['labels', '--issue'], ['labels', '--issue', 'abc'], ['labels', '--issue', '0'], ['labels', '--issue', '-3'], ['labels', '--issue', '5', '6']]) {
      const { h } = make();
      assert.equal(await run(argv, h.ctx), 2, argv.join(' '));
      assert.match(h.errText(), /^Usage: huddle labels \[--dry-run\] \| labels --issue <n> \[--dry-run\]/);
    }
  });

  test(`[${kind}] --dry-run: prints what it would do and changes nothing`, async () => {
    const { log, h } = make();
    assert.equal(await run(['labels', '--issue', '20', '--dry-run'], h.ctx), 0);
    assert.match(h.text(), /#21 assigned to /);
    assert.match(h.text(), /#20 \(closed\) loses in review, needs decision/);
    assert.match(h.text(), /label change\(s\) \(dry run: nothing was changed\)\./);
    assert.ok(!names(log).some((n) => ['setLabels', 'assign', 'ensureLabels', 'createIssue', 'updateIssue'].includes(n)));
    assert.deepEqual(h.world.labelsOf(21), ['blocked']);
  });

  test(`[${kind}] a platform error still stops it with one clear line and exit 1`, async () => {
    const { h } = make({ wrap: (a) => ({ ...a, issueState: async () => { throw new Error('gh api failed: no such host'); } }) });
    assert.equal(await run(['labels', '--issue', '10'], h.ctx), 1);
    assert.match(h.errText(), /no such host/);
  });
}
