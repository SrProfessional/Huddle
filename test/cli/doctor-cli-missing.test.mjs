// Issue #41: doctor's «login» check tells «not installed or not on the PATH» (ENOENT) from «not logged in», for gh and glab.
import test from 'node:test';
import assert from 'node:assert/strict';
import { run } from '../../lib/cli/run.mjs';
import { harness, CONFIG, GITLAB_CONFIG } from './harness.mjs';
import { createGithub } from '../../lib/platform/github.mjs';
import { createGitlab } from '../../lib/platform/gitlab.mjs';

const LABELS = ['ready', 'assigned', 'in progress', 'in review', 'blocked', 'needs decision', 'changes requested from AI Manager'];
// What execFile gives when the program is missing: the runner keeps its message, the code rides on the error.
const missing = (cli) => () => { throw Object.assign(new Error(`${cli} api user failed: spawn ${cli} ENOENT`), { code: 'ENOENT' }); };
const notLoggedIn = (cli) => () => { throw new Error(`${cli} api user failed: ${cli === 'gh' ? 'To get started with GitHub CLI, please run:  gh auth login' : '401 Unauthorized'}`); };
const offline = (cli) => () => { throw new Error(`${cli} api user failed: dial tcp: lookup api.example.com: no such host`); };

function doctorWith({ gitlab = false, config, platform, make }) {
  const cli = gitlab ? 'glab' : 'gh';
  const create = gitlab ? createGitlab : createGithub;
  const cfg = config ?? (gitlab ? GITLAB_CONFIG : CONFIG);
  const h = harness({ gitlab, config: cfg, wrap: () => ({ ...create(cfg, { run: make(cli) }), listLabels: async () => LABELS, findUser: async () => true, canAssign: async () => true }) });
  h.ctx.pluginInstalled = true;
  if (platform) h.ctx.platform = platform;
  return h;
}
const login = (h) => h.text().split('\n').filter((l) => /login/.test(l)).join('\n');

test('[gh, Windows] ENOENT: not installed or not on the PATH, the winget id, and the PATH reload', async () => {
  const h = doctorWith({ platform: 'win32', make: missing });
  assert.equal(await run(['doctor'], h.ctx), 1);
  const t = h.text();
  assert.match(t, /✖ login: gh is not installed or not on the PATH of this terminal/);
  assert.match(t, /winget install --id GitHub\.cli/);
  assert.match(t, /open a new terminal/);
  assert.ok(t.includes("$env:Path = [Environment]::GetEnvironmentVariable('Path','Machine') + ';' + [Environment]::GetEnvironmentVariable('Path','User')"));
  assert.doesNotMatch(t, /brew install/);
  assert.doesNotMatch(t, /is not usable/);
});

test('[gh, Mac] ENOENT: brew install gh, and no Windows steps', async () => {
  const h = doctorWith({ platform: 'darwin', make: missing });
  await run(['doctor'], h.ctx);
  assert.match(h.text(), /✖ login: gh is not installed or not on the PATH of this terminal/);
  assert.match(h.text(), /brew install gh/);
  assert.doesNotMatch(h.text(), /winget|\$env:Path|open a new terminal/);
});

test('[gh, Linux] ENOENT: the official page', async () => {
  const h = doctorWith({ platform: 'linux', make: missing });
  await run(['doctor'], h.ctx);
  assert.match(h.text(), /https:\/\/github\.com\/cli\/cli#installation/);
  assert.doesNotMatch(h.text(), /winget|brew install/);
});

test('[glab, Windows] ENOENT: winget id GLab.GLab and the PATH reload', async () => {
  const h = doctorWith({ gitlab: true, platform: 'win32', make: missing });
  assert.equal(await run(['doctor'], h.ctx), 1);
  const t = h.text();
  assert.match(t, /✖ login: glab is not installed or not on the PATH of this terminal/);
  assert.match(t, /winget install --id GLab\.GLab/);
  assert.match(t, /open a new terminal/);
  assert.match(t, /\$env:Path = /);
});

test('[glab, Mac] ENOENT: brew install glab', async () => {
  const h = doctorWith({ gitlab: true, platform: 'darwin', make: missing });
  await run(['doctor'], h.ctx);
  assert.match(h.text(), /brew install glab/);
  assert.doesNotMatch(h.text(), /winget/);
});

test('[glab, Linux] ENOENT: the official page', async () => {
  const h = doctorWith({ gitlab: true, platform: 'linux', make: missing });
  await run(['doctor'], h.ctx);
  assert.match(h.text(), /https:\/\/gitlab\.com\/gitlab-org\/cli#installation/);
});

test('[gh] an auth failure says «gh is not logged in» with gh auth login', async () => {
  const h = doctorWith({ platform: 'darwin', make: notLoggedIn });
  assert.equal(await run(['doctor'], h.ctx), 1);
  assert.match(login(h), /✖ login: gh is not logged in/);
  assert.match(login(h), /gh auth login/);
  assert.doesNotMatch(login(h), /not installed/);
});

test('[glab] an auth failure says «glab is not logged in» with glab auth login', async () => {
  const h = doctorWith({ gitlab: true, platform: 'darwin', make: notLoggedIn });
  await run(['doctor'], h.ctx);
  assert.match(login(h), /✖ login: glab is not logged in/);
  assert.match(login(h), /glab auth login/);
  assert.doesNotMatch(login(h), /--hostname/);
});

test('[glab] with a host in huddle.json the login step has --hostname <host>', async () => {
  const config = { ...GITLAB_CONFIG, host: 'gitlab.example.com' };
  const h = doctorWith({ gitlab: true, config, platform: 'linux', make: notLoggedIn });
  await run(['doctor'], h.ctx);
  assert.match(login(h), /glab auth login --hostname gitlab\.example\.com/);
});

test('[gh] with a host in huddle.json the login step has --hostname <host> too', async () => {
  const config = { ...CONFIG, host: 'ghe.example.com' };
  const h = doctorWith({ config, platform: 'linux', make: notLoggedIn });
  await run(['doctor'], h.ctx);
  assert.match(login(h), /gh auth login --hostname ghe\.example\.com/);
});

test('any other failure keeps today\'s «is not usable» line', async () => {
  for (const gitlab of [false, true]) {
    const h = doctorWith({ gitlab, platform: 'win32', make: offline });
    assert.equal(await run(['doctor'], h.ctx), 1);
    assert.match(h.text(), /✖ login: (gh|glab) is not usable: .*no such host/);
    assert.doesNotMatch(h.text(), /not installed|not logged in/);
  }
});

test('ctx.platform defaults to process.platform when the context does not set it', async () => {
  const h = doctorWith({ make: missing });
  await run(['doctor'], h.ctx);
  const t = h.text();
  if (process.platform === 'win32') assert.match(t, /winget install --id GitHub\.cli/);
  else if (process.platform === 'darwin') assert.match(t, /brew install gh/);
  else assert.match(t, /github\.com\/cli\/cli#installation/);
});
