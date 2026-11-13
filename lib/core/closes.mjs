// Huddle: which Issues a PR/MR body closes (docs/design.md §21, «how the link is read»). Pure: no network, no files.
//
// GitHub and GitLab link a PR/MR to an Issue, and close it, only when it targets the default branch. With a staging branch the
// adapters read the link themselves, from the body, with the same keywords the platforms use.

const KEYWORD = /(?<![A-Za-z0-9_])(?:close[sd]?|fix(?:e[sd])?|resolve[sd]?)[ \t]*:?[ \t]+((?:[\w.-]+(?:\/[\w.-]+)+)?)#(\d+)(?![\w])/gi;

/** Removes what the platforms do not read as a link: HTML comments, fenced code blocks and inline code. */
function readable(text) {
  let out = '';
  let i = 0;
  while (i < text.length) {
    if (text.startsWith('<!--', i)) { // an unfinished comment hides the rest, like the platforms
      const end = text.indexOf('-->', i + 4);
      i = end < 0 ? text.length : end + 3;
      out += ' ';
      continue;
    }
    if (i === 0 || text[i - 1] === '\n') {
      const eol = text.indexOf('\n', i);
      const line = text.slice(i, eol < 0 ? text.length : eol);
      const open = /^ {0,3}(`{3,}[^`]*|~{3,}.*)$/.exec(line.replace(/\r$/, ''));
      if (open) {
        const mark = /^ {0,3}(`+|~+)/.exec(line)[1];
        const close = new RegExp(`^ {0,3}${mark[0]}{${mark.length},}[ \\t]*$`);
        let next = eol < 0 ? text.length : eol + 1; // the lines after the opening one, up to the closing fence (or the end)
        while (next < text.length) {
          const end = text.indexOf('\n', next);
          const row = text.slice(next, end < 0 ? text.length : end).replace(/\r$/, '');
          next = end < 0 ? text.length : end + 1;
          if (close.test(row)) break;
        }
        i = next;
        out += '\n';
        continue;
      }
    }
    if (text[i] === '`') { // inline code: closed by a run of backticks of the same length; with none, the backticks are plain text
      let run = i;
      while (text[run] === '`') run++;
      const width = run - i;
      let search = run;
      let found = -1;
      while (search < text.length) {
        const at = text.indexOf('`', search);
        if (at < 0) break;
        let end = at;
        while (text[end] === '`') end++;
        if (end - at === width) { found = end; break; }
        search = end;
      }
      if (found >= 0) { i = found; out += ' '; continue; }
      out += text.slice(i, run);
      i = run;
      continue;
    }
    out += text[i++];
  }
  return out;
}

/**
 * The Issue numbers that a PR/MR body closes with the platform keywords (close, closes, closed, fix, fixes, fixed, resolve, resolves,
 * resolved; any case) followed by `#N`, or `owner/repo#N` when that is `project`. A bare `#N` is only a mention. Ascending, no duplicates.
 */
export function closesIn(text, project) {
  const mine = String(project ?? '').toLowerCase();
  const found = new Set();
  for (const [, repo, number] of readable(String(text ?? '')).matchAll(KEYWORD)) {
    if (repo && repo.toLowerCase() !== mine) continue;
    found.add(Number(number));
  }
  return [...found].sort((a, b) => a - b);
}
