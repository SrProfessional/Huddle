// Huddle: the managed block of CLAUDE.md, between `<!-- huddle:start vN -->` and `<!-- huddle:end -->` (docs/design.md §5).
// An update replaces only what sits between the markers; the project's own text is never touched.

const START = /<!-- huddle:start v\d+ -->/;
const END = '<!-- huddle:end -->';
const WHOLE = /<!-- huddle:start v\d+ -->[\s\S]*?<!-- huddle:end -->\r?\n?/;

export const hasBlock = (text) => START.test(text ?? '') && (text ?? '').includes(END);

/** `text` (the CLAUDE.md, or null) with `block` inserted at the end, or swapped in place when a block is already there. */
export function insertBlock(text, block) {
  const body = `${block.trimEnd()}\n`;
  const own = text ?? '';
  const hasStart = START.test(own);
  const hasEnd = own.includes(END);
  if (hasStart !== hasEnd) throw new Error(`CLAUDE.md has a Huddle marker without its pair (${hasStart ? END : 'huddle:start'}). Fix it by hand; nothing was changed.`);
  if (hasStart) return own.replace(WHOLE, () => body);
  if (own.trim() === '') return body;
  return `${own}${own.endsWith('\n') ? '' : '\n'}\n${body}`;
}
