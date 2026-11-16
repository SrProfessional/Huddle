// Issue #179: Huddle works on every branch of a set-up repo. When the working tree has no huddle.json, Huddle reads the default branch's copy
// from git (no network: what the last fetch left), validates it the same way and says so in one line; update and setup never write there.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { defaultBranchFile, loadConfig } from '../../lib/cli/config.mjs';
import { findRoot } from '../../lib/cli/main.mjs';
import { update } from '../../lib/setup/update.mjs';
import { run } from '../../lib/cli/run.mjs';
import { harness, CONFIG } from './harness.mjs';

const VALID = JSON.stringify({ platform: 'github', project: 'acme/app', coach: 'SrProfessional', assignees: ['ana'] });

/** A fake git: `refs` are the remote-tracking refs that exist, `head` is what origin/HEAD points to, `files` maps «ref:path» to text. */
const fakeGit = ({ head = null, refs = [], files = {} }) => (args) => {
  if (args[0] === 'symbolic-ref') { if (head) return `${head}\n`; throw new Error('not a symbolic ref'); }
  if (args[0] === 'rev-parse') { if (refs.includes(args.at(-1))) return 'abc\n'; throw new Error('unknown ref'); }
  if (args[0] === 'show') { if (args[1] in files) return files[args[1]]; throw new Error('no such path'); }
  throw new Error(`unexpected git ${args.join(' ')}`);
};

test('defaultBranchFile reads origin/HEAD first, then origin/main, then origin/master; none is null', () => {
  assert.deepEqual(defaultBranchFile('huddle.json', fakeGit({ head: 'origin/trunk', files: { 'origin/trunk:huddle.json': VALID } })), { text: VALID, ref: 'origin/trunk' });
  assert.deepEqual(defaultBranchFile('huddle.json', fakeGit({ refs: ['origin/main'], files: { 'origin/main:huddle.json': VALID } })), { text: VALID, ref: 'origin/main' });
  assert.deepEqual(defaultBranchFile('huddle.json', fakeGit({ refs: ['origin/master'], files: { 'origin/master:huddle.json': VALID } })), { text: VALID, ref: 'origin/master' });
  assert.equal(defaultBranchFile('huddle.json', fakeGit({ refs: ['origin/main'] })), null, 'the default branch has none either');
  assert.equal(defaultBranchFile('huddle.json', () => { throw new Error('not a git repo'); }), null);
});

test('loadConfig: with no file here it uses the default branch\'s copy, validated the same way, and says where it came from', () => {
  const c = loadConfig('/r', () => null, () => ({ text: VALID, ref: 'origin/main' }));
  assert.equal(c.project, 'acme/app');
  assert.equal(c.from_branch, 'origin/main');
  assert.throws(() => loadConfig('/r', () => null, () => ({ text: '{"platform":"svn"}', ref: 'origin/main' })), /origin\/main.*"platform"/s);
  assert.throws(() => loadConfig('/r', () => null, () => null), /huddle\.json not found/);
  assert.equal(loadConfig('/r', () => VALID, () => { throw new Error('never asked'); }).from_branch, undefined, 'a file here wins');
});

test('the CLI on a branch without huddle.json runs with the default branch\'s copy and prints one note on stderr', async () => {
  const h = harness({ file: null, setup: (w) => w.issue({ number: 1, body: '## Depends on\n\n- None\n', labels: ['ready'] }) });
  h.ctx.configFallback = () => ({ text: JSON.stringify(CONFIG), ref: 'origin/main' });
  assert.equal(await run(['queue'], h.ctx), 0);
  assert.match(h.errText(), /this branch has no huddle\.json; using the one on origin\/main/);
  assert.doesNotMatch(h.text(), /not found/);
});

test('doctor says which copy it read', async () => {
  const h = harness({ file: null });
  h.ctx.configFallback = () => ({ text: JSON.stringify(CONFIG), ref: 'origin/main' });
  await run(['doctor'], h.ctx);
  assert.match(h.text(), /huddle\.json: valid .* read from origin\/main \(this branch has none\)/);
});

test('update never writes on a branch without the file, and says how to bring it', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'huddle-branch-'));
  try {
    assert.throws(() => update(dir, { fallback: () => ({ text: VALID, ref: 'origin/main' }) }), /this branch has no huddle\.json: update it from origin\/main \(git merge origin\/main\) or run \/huddle-update from a branch made from it/);
    assert.throws(() => update(dir, { fallback: () => null }), /there is no huddle\.json here/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('the session start says when this branch has no Huddle block in CLAUDE.md but the default branch has one', async () => {
  const h = harness();
  h.ctx.fileFallback = (name) => (name === 'CLAUDE.md' ? { text: '<!-- huddle:start v1 -->\nrules\n<!-- huddle:end -->\n', ref: 'origin/main' } : null);
  h.ctx.writeFile('/repo/CLAUDE.md', '# Old project notes\n');
  assert.equal(await run(['hook'], h.ctx), 0);
  const j = JSON.parse(h.text());
  assert.match(j.systemMessage, /This branch has no Huddle block in CLAUDE\.md; the team's rules are on origin\/main/);
  assert.match(j.hookSpecificOutput.additionalContext, /git show origin\/main:CLAUDE\.md/);
  const ok = harness();
  ok.ctx.fileFallback = h.ctx.fileFallback;
  ok.ctx.writeFile('/repo/CLAUDE.md', '<!-- huddle:start v1 -->\nrules\n<!-- huddle:end -->\n');
  await run(['hook'], ok.ctx);
  assert.doesNotMatch(ok.text(), /no Huddle block/);
});

test('findRoot: with no huddle.json up the tree, the git top-level', () => {
  const dir = realpathSync.native(mkdtempSync(path.join(tmpdir(), 'huddle-root-')));
  try {
    execFileSync('git', ['init', '-q'], { cwd: dir });
    mkdirSync(path.join(dir, 'a', 'b'), { recursive: true });
    assert.equal(realpathSync.native(findRoot(path.join(dir, 'a', 'b'))), dir);
    writeFileSync(path.join(dir, 'a', 'huddle.json'), VALID);
    assert.equal(realpathSync.native(findRoot(path.join(dir, 'a', 'b'))), path.join(dir, 'a'), 'a huddle.json up the tree still wins');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('setup never writes on a branch without huddle.json when the default branch has one', async () => {
  const { setup } = await import('../../lib/setup/index.mjs');
  const dir = mkdtempSync(path.join(tmpdir(), 'huddle-setup-branch-'));
  try {
    const answers = { platform: 'github', project: 'acme/app', coach: 'boss' };
    assert.throws(() => setup(dir, answers, { fallback: () => ({ text: VALID, ref: 'origin/main' }) }), /this branch has no huddle\.json: update it from origin\/main/);
    assert.equal(execFileSync('git', ['--version']).length > 0, true);
    assert.ok(setup(dir, answers, { fallback: () => null }).written.includes('huddle.json'), 'with none anywhere it is a first install');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('findRoot never climbs out of the git repo: a worktree inside the main checkout does not take the main checkout\'s huddle.json', () => {
  const outer = realpathSync.native(mkdtempSync(path.join(tmpdir(), 'huddle-outer-')));
  try {
    writeFileSync(path.join(outer, 'huddle.json'), VALID); // the main checkout's file
    const inner = path.join(outer, '.claude', 'worktrees', 'old');
    mkdirSync(path.join(inner, 'sub'), { recursive: true });
    execFileSync('git', ['init', '-q'], { cwd: inner }); // its own git top-level, like a worktree
    assert.equal(realpathSync.native(findRoot(path.join(inner, 'sub'))), inner);
  } finally { rmSync(outer, { recursive: true, force: true }); }
});
