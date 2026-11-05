// Huddle: the CLAUDE.md block between markers (docs/design.md §5): insert it, update only it, never touch the project's own text.
import test from 'node:test';
import assert from 'node:assert/strict';
import { insertBlock, hasBlock } from '../../lib/setup/block.mjs';

const BLOCK = '<!-- huddle:start v1 -->\n## Huddle\nrules v1\n<!-- huddle:end -->\n';
const NEW = '<!-- huddle:start v1 -->\n## Huddle\nrules v2\n<!-- huddle:end -->\n';

test('an empty or missing CLAUDE.md becomes just the block', () => {
  assert.equal(insertBlock(null, BLOCK), BLOCK);
  assert.equal(insertBlock('', BLOCK), BLOCK);
});

test('a CLAUDE.md without the block gets it appended after the project text, which stays byte for byte', () => {
  const own = '# My project\n\nOwn rule: use tabs.\n';
  const out = insertBlock(own, BLOCK);
  assert.ok(out.startsWith(own));
  assert.equal(out, `${own}\n${BLOCK}`);
  assert.equal(hasBlock(out), true);
  assert.equal(hasBlock(own), false);
});

test('text without a final newline still gets a blank line before the block', () => {
  assert.equal(insertBlock('# A', BLOCK), `# A\n\n${BLOCK}`);
});

test('running it again replaces only what sits between the markers', () => {
  const own = '# My project\n\nBefore.\n\n';
  const after = '\n## After\nMore own text.\n';
  const first = `${own}${BLOCK}${after}`;
  const out = insertBlock(first, NEW);
  assert.equal(out, `${own}${NEW}${after}`);
  assert.equal(insertBlock(out, NEW), out, 'idempotent');
});

test('a block of another version (v0) is found and replaced', () => {
  const old = 'Mine\n<!-- huddle:start v0 -->\nold\n<!-- huddle:end -->\nTail\n';
  assert.equal(insertBlock(old, NEW), `Mine\n${NEW}Tail\n`);
});

test('CRLF files keep their own text untouched', () => {
  const own = '# Mine\r\n\r\ntext\r\n';
  const out = insertBlock(`${own}${BLOCK}`, NEW);
  assert.ok(out.startsWith(own));
});

test('a start marker without its end marker is refused, so nothing is lost', () => {
  assert.throws(() => insertBlock('x\n<!-- huddle:start v1 -->\nhalf\n', NEW), /huddle:end/);
});
