// Issue #283: the machine id and the claim a session leaves on an Issue (docs/design.md §24). A fake shared folder, no real disk.
import test from 'node:test';
import assert from 'node:assert/strict';
import { machineOf, setMachineName, claimBody, newestClaim } from '../../lib/core/machine.mjs';

const folder = (extra = {}) => {
  const files = new Map();
  let n = 0;
  const key = (p) => p.split(String.fromCharCode(92)).join('/');
  return { files, sharedDir: '/home/.huddle', readFile: (p) => files.get(key(p)) ?? null, writeFile: (p, t) => files.set(key(p), t), hostName: () => 'ana-pc', ...extra, newMachineId: extra.newMachineId ?? (() => `id-${++n}`) };
};

test('the id is made once and kept; the name defaults to the host name', () => {
  const ctx = folder();
  assert.deepEqual(machineOf(ctx), { id: 'id-1', name: 'ana-pc' });
  assert.deepEqual(machineOf(ctx), { id: 'id-1', name: 'ana-pc' }, 'the same id the second time');
  assert.ok([...ctx.files.keys()].every((p) => p.startsWith('/home/.huddle/')), 'it lives in the shared folder');
});

test('two shared folders get two ids (with the real random id too)', () => {
  const a = folder({ newMachineId: undefined });
  const b = folder({ newMachineId: undefined });
  delete a.newMachineId; delete b.newMachineId;
  assert.notEqual(machineOf(a).id, machineOf(b).id);
  assert.match(machineOf(a).id, /^[0-9a-f-]{20,}$/);
});

test('the name can be set, and survives', () => {
  const ctx = folder();
  const id = machineOf(ctx).id;
  assert.deepEqual(setMachineName(ctx, 'mac-mini'), { id, name: 'mac-mini' });
  assert.deepEqual(machineOf(ctx), { id, name: 'mac-mini' });
});

test('a broken file is replaced by a new id, never a crash', () => {
  const ctx = folder();
  ctx.files.set('/home/.huddle/machine.json', 'not json');
  assert.equal(machineOf(ctx).id, 'id-1');
});

test('the claim has the visible line and the hidden marker, and is read back', () => {
  const body = claimBody({ id: 'abc', name: 'ana-pc' });
  assert.match(body, /🖥️ Working on this from ana-pc/);
  assert.match(body, /<!-- huddle-machine: abc -->/);
  assert.deepEqual(newestClaim([{ body, createdAt: '2026-11-22T10:00:00Z' }]), { id: 'abc', name: 'ana-pc' });
});

test('the newest claim wins, and comments without a marker are ignored', () => {
  const c = (id, name, at) => ({ body: claimBody({ id, name }), createdAt: at });
  const comments = [c('b', 'mac', '2026-11-22T12:00:00Z'), { body: 'hello', createdAt: '2026-11-22T13:00:00Z' }, c('a', 'pc', '2026-11-22T11:00:00Z')];
  assert.deepEqual(newestClaim(comments), { id: 'b', name: 'mac' });
  assert.equal(newestClaim([{ body: 'hello' }]), null);
  assert.equal(newestClaim([]), null);
});
