// Huddle: `huddle team`, `huddle team add|remove` and the doctor «team» check (Issue #36), on the fake gh and the fake glab.
import test from 'node:test';
import assert from 'node:assert/strict';
import { run } from '../../lib/cli/run.mjs';
import { harness } from './harness.mjs';

const LABELS = ['ready', 'assigned', 'in progress', 'in review', 'blocked', 'needs decision', 'changes requested from AI Manager'];
// The team commands read the platform and never write to it: any other operation of the adapter fails the test.
const READ_ONLY = new Set(['findUser', 'canAssign', 'me']);
const readOnly = (adapter) => new Proxy(adapter, {
  get: (a, op) => (READ_ONLY.has(op) || typeof a[op] !== 'function' ? a[op] : () => { throw new Error(`the team command called ${String(op)}`); }),
});
const mk = (opts = {}) => harness({ wrap: readOnly, ...opts });
const lineOf = (h, login) => h.out.join('\n').split('\n').find((l) => l.startsWith(login));

// huddle.json as a team would write it, with Windows line endings and a final newline.
const FILE = '{\r\n  "$schema": "./huddle.schema.json",\r\n  "platform": "github",\r\n  "project": "acme/app",\r\n  "ai_manager": "SrProfessional",\r\n  "assignees": ["ana", "luis"],\r\n  "max_open_per_person": 2,\r\n  "default_branch": "main"\r\n}\r\n';

// --- huddle team (list) -----------------------------------------------------------------------------------------------------------------

test('team lists the AI Manager and the assignees, each with ✔ for «exists» and «can be assigned» (GitHub)', async () => {
  const h = mk();
  assert.equal(await run(['team'], h.ctx), 0);
  assert.match(lineOf(h, 'SrProfessional'), /AI Manager.*exists ✔.*can be assigned ✔/);
  assert.match(lineOf(h, 'ana'), /assignee.*exists ✔.*can be assigned ✔/);
  assert.match(lineOf(h, 'luis'), /assignee.*exists ✔.*can be assigned ✔/);
  assert.doesNotMatch(h.text(), /✖/);
});

test('team marks ✖ for someone who is not a collaborator, and prints the exact GitHub step (GitHub)', async () => {
  const h = mk({ setup: (w) => w.user('eva'), config: { platform: 'github', project: 'acme/app', ai_manager: 'SrProfessional', assignees: ['ana', 'eva'] } });
  assert.equal(await run(['team'], h.ctx), 0);
  assert.match(lineOf(h, 'ana'), /can be assigned ✔/);
  assert.match(lineOf(h, 'eva'), /exists ✔.*can be assigned ✖/);
  assert.match(h.text(), /Settings → Collaborators/);
  assert.match(h.text(), /gh api -X PUT repos\/acme\/app\/collaborators\/eva/);
});

test('team marks ✖ ✖ for a login that does not exist, and says so instead of inviting (GitHub)', async () => {
  const h = mk({ config: { platform: 'github', project: 'acme/app', ai_manager: 'SrProfessional', assignees: ['ghost'] } });
  assert.equal(await run(['team'], h.ctx), 0);
  assert.match(lineOf(h, 'ghost'), /exists ✖.*can be assigned ✖/);
  assert.match(h.text(), /no user "ghost"/i);
  assert.doesNotMatch(h.text(), /gh api -X PUT/);
});

test('team on GitLab: a Reporter exists but cannot be assigned, a Developer can; the step names Manage → Members and Developer (GitLab)', async () => {
  const h = mk({ gitlab: true, setup: (w) => w.member('luis', 'reporter') });
  assert.equal(await run(['team'], h.ctx), 0);
  assert.match(lineOf(h, 'ana'), /exists ✔.*can be assigned ✔/);
  assert.match(lineOf(h, 'luis'), /exists ✔.*can be assigned ✖/);
  assert.match(h.text(), /Manage → Members/);
  assert.match(h.text(), /role Developer/);
});

test('team on GitLab: a stranger with an account and a login without one (GitLab)', async () => {
  const h = mk({ gitlab: true, setup: (w) => w.user('outsider'), config: { platform: 'gitlab', project: 'acme/app', ai_manager: 'SrProfessional', assignees: ['outsider', 'ghost'] } });
  assert.equal(await run(['team'], h.ctx), 0);
  assert.match(lineOf(h, 'outsider'), /exists ✔.*can be assigned ✖/);
  assert.match(lineOf(h, 'ghost'), /exists ✖.*can be assigned ✖/);
});

test('team shows the AI Manager once when they are also an assignee, and reports a failed platform call as an error', async () => {
  const h = mk({ config: { platform: 'github', project: 'acme/app', ai_manager: 'SrProfessional', assignees: ['SrProfessional'] } });
  assert.equal(await run(['team'], h.ctx), 0);
  assert.equal(h.text().split('\n').filter((l) => l.startsWith('SrProfessional')).length, 1);
  assert.match(lineOf(h, 'SrProfessional'), /AI Manager.*assignee/);
  const down = mk({ wrap: (a) => ({ ...a, canAssign: async () => { throw new Error('network down'); } }) });
  assert.equal(await run(['team'], down.ctx), 1);
  assert.match(down.errText(), /network down/);
});

// --- huddle team add ---------------------------------------------------------------------------------------------------------------------

test('team add writes the login to assignees and changes nothing else: other keys, their order and the CRLF line endings stay', async () => {
  const h = mk({ file: FILE, setup: (w) => w.member('eva') });
  assert.equal(await run(['team', 'add', 'eva'], h.ctx), 0);
  assert.equal(h.huddleJson(), FILE.replace('["ana", "luis"]', '["ana", "luis", "eva"]'));
  assert.match(h.text(), /Added eva/);
  assert.equal(h.writes.length, 1);
});

test('team add keeps a multi-line array, an LF file and the final newline', async () => {
  const file = '{\n  "platform": "github",\n  "project": "acme/app",\n  "ai_manager": "SrProfessional",\n  "assignees": [\n    "ana"\n  ]\n}\n';
  const h = mk({ file, setup: (w) => w.member('eva') });
  assert.equal(await run(['team', 'add', 'eva'], h.ctx), 0);
  assert.equal(h.huddleJson(), file.replace('"ana"\n', '"ana",\n    "eva"\n'));
});

test('team add of someone already there says so and changes nothing, whatever the case (no write, no platform call)', async () => {
  const h = mk({ file: FILE, wrap: () => { throw new Error('must not reach the platform'); } });
  h.ctx.createPlatform = async () => { throw new Error('must not reach the platform'); };
  assert.equal(await run(['team', 'add', 'ANA'], h.ctx), 0);
  assert.match(h.text(), /already in assignees/);
  assert.equal(h.huddleJson(), FILE);
  assert.equal(h.writes.length, 0);
});

test('team add of someone who cannot be assigned refuses, prints the step and leaves the file alone (GitHub)', async () => {
  const h = mk({ file: FILE, setup: (w) => w.user('eva') });
  assert.equal(await run(['team', 'add', 'eva'], h.ctx), 1);
  assert.equal(h.huddleJson(), FILE);
  assert.match(h.text(), /Settings → Collaborators/);
  assert.match(h.text(), /gh api -X PUT repos\/acme\/app\/collaborators\/eva/);
  assert.match(h.text(), /--anyway/);
  assert.equal(h.writes.length, 0);
});

test('team add --anyway writes the file although the login cannot be assigned, and still prints the step', async () => {
  const h = mk({ file: FILE, setup: (w) => w.user('eva') });
  assert.equal(await run(['team', 'add', 'eva', '--anyway'], h.ctx), 0);
  assert.equal(h.huddleJson(), FILE.replace('["ana", "luis"]', '["ana", "luis", "eva"]'));
  assert.match(h.text(), /Settings → Collaborators/);
  assert.match(h.text(), /stays ready|cannot be assigned/);
});

test('team add on GitLab refuses a Reporter and accepts a Developer, --anyway overrides (GitLab)', async () => {
  const file = FILE.replace('"github"', '"gitlab"');
  const h = mk({ gitlab: true, file, setup: (w) => { w.member('rep', 'reporter'); w.member('dev', 'developer'); } });
  assert.equal(await run(['team', 'add', 'rep'], h.ctx), 1);
  assert.equal(h.huddleJson(), file);
  assert.match(h.text(), /Manage → Members/);
  assert.equal(await run(['team', 'add', 'dev'], h.ctx), 0);
  assert.match(h.huddleJson(), /"ana", "luis", "dev"/);
  assert.equal(await run(['team', 'add', 'rep', '--anyway'], h.ctx), 0);
  assert.match(h.huddleJson(), /"ana", "luis", "dev", "rep"/);
});

test('team add of a login that does not exist refuses and says so; it never invites anyone', async () => {
  const h = mk({ file: FILE });
  assert.equal(await run(['team', 'add', 'ghost'], h.ctx), 1);
  assert.equal(h.huddleJson(), FILE);
  assert.match(h.text(), /no user "ghost"/i);
});

test('team add creates the assignees key when huddle.json has none', async () => {
  const file = '{\n  "platform": "github",\n  "project": "acme/app",\n  "ai_manager": "SrProfessional"\n}\n';
  const h = mk({ file });
  assert.equal(await run(['team', 'add', 'ana'], h.ctx), 0);
  assert.equal(h.huddleJson(), '{\n  "platform": "github",\n  "project": "acme/app",\n  "ai_manager": "SrProfessional",\n  "assignees": ["ana"]\n}\n');
});

// --- huddle team remove ------------------------------------------------------------------------------------------------------------------

test('team remove takes the login out of assignees and keeps the rest of the file as it was', async () => {
  const h = mk({ file: FILE });
  assert.equal(await run(['team', 'remove', 'ana'], h.ctx), 0);
  assert.equal(h.huddleJson(), FILE.replace('["ana", "luis"]', '["luis"]'));
  assert.match(h.text(), /Removed ana/);
  assert.match(h.text(), /open Issues/i);
});

test('team remove of someone absent says so and changes nothing (no write, no platform call)', async () => {
  const h = mk({ file: FILE });
  h.ctx.createPlatform = async () => { throw new Error('must not reach the platform'); };
  assert.equal(await run(['team', 'remove', 'eva'], h.ctx), 0);
  assert.match(h.text(), /not in assignees/);
  assert.equal(h.huddleJson(), FILE);
  assert.equal(h.writes.length, 0);
});

test('team remove matches the login whatever its case, and can empty the list', async () => {
  const file = FILE.replace('["ana", "luis"]', '["Ana"]');
  const h = mk({ file });
  assert.equal(await run(['team', 'remove', 'ana'], h.ctx), 0);
  assert.equal(h.huddleJson(), FILE.replace('["ana", "luis"]', '[]'));
});

// --- usage -------------------------------------------------------------------------------------------------------------------------------

test('team with a missing login, a strange login, an unknown subcommand or a wrong flag prints the usage and exits 2', async () => {
  for (const argv of [['team', 'add'], ['team', 'remove'], ['team', 'add', 'a b'], ['team', 'add', '--anyway'], ['team', 'bogus'], ['team', 'remove', 'ana', '--anyway'], ['team', 'extra'], ['team', 'add', 'ana', '--force']]) {
    const h = mk({ file: FILE });
    assert.equal(await run(argv, h.ctx), 2, argv.join(' '));
    assert.match(h.errText(), /Usage:.*team/);
    assert.equal(h.writes.length, 0);
  }
});

test('team add with no huddle.json says so and exits 1', async () => {
  const h = mk({ file: null });
  assert.equal(await run(['team', 'add', 'ana'], h.ctx), 1);
  assert.match(h.errText(), /huddle\.json not found/);
});

// --- doctor ------------------------------------------------------------------------------------------------------------------------------

const withLabels = (a) => ({ ...a, listLabels: async () => LABELS });

test('doctor «team»: ✔ when every assignee can be assigned', async () => {
  const h = harness({ wrap: withLabels });
  assert.equal(await run(['doctor'], h.ctx), 0);
  assert.match(h.text(), /✔ team: .*2/);
});

test('doctor «team»: ⚠ for each assignee who cannot be assigned, with the step to fix it, and the exit code stays 0 (GitHub)', async () => {
  const h = harness({ wrap: withLabels, setup: (w) => w.user('eva'), config: { platform: 'github', project: 'acme/app', ai_manager: 'SrProfessional', assignees: ['ana', 'eva', 'ghost'] } });
  assert.equal(await run(['doctor'], h.ctx), 0);
  const warnings = h.text().split('\n').filter((l) => l.startsWith('⚠ team'));
  assert.equal(warnings.length, 2);
  assert.match(warnings.find((l) => l.includes('eva')), /gh api -X PUT repos\/acme\/app\/collaborators\/eva/);
  assert.match(warnings.find((l) => l.includes('ghost')), /no user "ghost"/i);
  assert.ok(!warnings.some((l) => /\bana\b/.test(l)));
});

test('doctor «team» on GitLab: a Reporter gets a ⚠ that names Manage → Members (GitLab)', async () => {
  const h = harness({ gitlab: true, wrap: withLabels, setup: (w) => w.member('luis', 'reporter') });
  assert.equal(await run(['doctor'], h.ctx), 0);
  assert.match(h.text(), /⚠ team: luis .*Manage → Members/);
});

test('doctor «team»: a failed lookup is one ⚠ «not checked», never a verdict on the assignee', async () => {
  const h = harness({ wrap: (a) => ({ ...withLabels(a), canAssign: async () => { throw new Error('network down'); } }) });
  assert.equal(await run(['doctor'], h.ctx), 0);
  assert.match(h.text(), /⚠ team: .*not checked.*network down/);
});

test('doctor «team»: no assignees is a ⚠ that says how to add one', async () => {
  const h = harness({ wrap: withLabels, config: { platform: 'github', project: 'acme/app', ai_manager: 'SrProfessional', assignees: [] } });
  assert.equal(await run(['doctor'], h.ctx), 0);
  assert.match(h.text(), /⚠ team: .*huddle team add/);
});
