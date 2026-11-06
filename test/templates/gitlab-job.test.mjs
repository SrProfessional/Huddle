// Huddle: the GitLab labels job (Issue #32). Reads the template as text and runs its script with stubs on PATH.
// Nothing here calls a real GitLab or GitHub.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdtempSync, chmodSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, delimiter } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const TEMPLATE = fileURLToPath(new URL('../../templates/gitlab/huddle-labels.gitlab-ci.yml', import.meta.url));
const text = readFileSync(TEMPLATE, 'utf8');
const SKIP_LINE = 'Huddle: HUDDLE_TOKEN is only available on protected branches; the schedule on the default branch updates the labels.';

// The `script:` items joined the way GitLab runs them: one shell script, one line (or block) per item.
function scriptLines() {
  const lines = text.split('\n');
  const start = lines.findIndex((l) => /^ {2}script:\s*$/.test(l));
  assert.ok(start >= 0, 'the job has a script');
  const out = [];
  for (let i = start + 1; i < lines.length; i++) {
    const l = lines[i];
    if (/^\S/.test(l) || /^ {2}\S/.test(l)) break;
    const item = l.match(/^ {4}- (.*)$/);
    if (!item) { if (/^ {6}/.test(l) || l.trim() === '') { out.push(l.replace(/^ {6}/, '')); } continue; }
    if (item[1].trim() === '|') continue;
    out.push(item[1]);
  }
  return out.join('\n');
}

function run(env) {
  const dir = mkdtempSync(join(tmpdir(), 'huddle-glci-'));
  try {
    const log = join(dir, 'calls.log');
    for (const name of ['curl', 'dpkg', 'git', 'node']) {
      const f = join(dir, name);
      writeFileSync(f, `#!/bin/sh\necho "${name} $*" >> "${log.replace(/\\/g, '/')}"\nexit 0\n`);
      chmodSync(f, 0o755);
    }
    const script = join(dir, 'job.sh');
    writeFileSync(script, scriptLines() + '\n');
    const clean = { PATH: dir + delimiter + process.env.PATH, CI_SERVER_FQDN: 'gitlab.example.com', HUDDLE_REF: 'main', GLAB_VERSION: '1.50.0' };
    const r = spawnSync('sh', [script.replace(/\\/g, '/')], { env: { ...clean, ...env }, encoding: 'utf8' });
    return { status: r.status, out: (r.stdout || '') + (r.stderr || ''), log: existsSync(log) ? readFileSync(log, 'utf8') : '' };
  } finally { rmSync(dir, { recursive: true, force: true }); }
}

test('the job runs in the default `test` stage, not .pre/.post, and says why', () => {
  assert.match(text, /^ {2}stage: test$/m);
  assert.doesNotMatch(text, /stage:\s*\.(pre|post)/);
  const comments = text.split('\n').filter((l) => l.trim().startsWith('#')).join('\n');
  assert.match(comments, /\.pre/);
  assert.match(comments, /\.post/);
  assert.match(comments, /empty/i);
});

test('the job clones Huddle with the repo\'s own case', () => {
  assert.match(text, /git clone [^\n]*https:\/\/github\.com\/SrProfessional\/Huddle\.git/);
  assert.doesNotMatch(text, /SrProfessional\/huddle\b/);
});

test('the skip line and the protected-ref rule are in the template; shell tracing stays off', () => {
  assert.ok(text.includes(SKIP_LINE));
  assert.match(text, /CI_COMMIT_REF_PROTECTED/);
  assert.doesNotMatch(scriptLines(), /set -x|xtrace/);
});

test('MR pipeline without a token: green, prints the line, changes nothing', () => {
  const r = run({ CI_PIPELINE_SOURCE: 'merge_request_event', CI_COMMIT_REF_PROTECTED: 'false', HUDDLE_TOKEN: '' });
  assert.equal(r.status, 0, r.out);
  assert.ok(r.out.includes(SKIP_LINE), r.out);
  assert.equal(r.log, '', 'no curl, git or node ran');
});

test('schedule without a token: fails', () => {
  const r = run({ CI_PIPELINE_SOURCE: 'schedule', CI_COMMIT_REF_PROTECTED: 'false', HUDDLE_TOKEN: '' });
  assert.equal(r.status, 1, r.out);
  assert.match(r.out, /HUDDLE_TOKEN is not set/);
  assert.equal(r.log, '');
});

test('protected ref without a token: fails', () => {
  const r = run({ CI_PIPELINE_SOURCE: 'push', CI_COMMIT_REF_PROTECTED: 'true', HUDDLE_TOKEN: '' });
  assert.equal(r.status, 1, r.out);
  assert.equal(r.log, '');
});

test('with a token: installs glab, clones Huddle and runs labels, and never prints the token', () => {
  const secret = 'glpat-SECRET-DO-NOT-PRINT';
  const r = run({ CI_PIPELINE_SOURCE: 'schedule', CI_COMMIT_REF_PROTECTED: 'true', HUDDLE_TOKEN: secret });
  assert.equal(r.status, 0, r.out);
  assert.match(r.log, /^node .*bin\/huddle labels$/m);
  assert.match(r.log, /github\.com\/SrProfessional\/Huddle\.git/);
  assert.ok(!r.out.includes(secret) && !r.log.includes(secret));
});
