// Huddle: the pure part of `huddle team` (Issue #36): editing `assignees` in the text of huddle.json, and the step the AI Manager does by hand.
// No network and no files here. huddle.json is edited as text, never parsed and printed again, so every other key, its order, its spacing
// and the file's line ending stay exactly as the team wrote them.

const WS = /\s/;

/** Where the value of the top-level key `key` starts and ends in `text` ({ start, end, keyStart }), or null. Strings are skipped whole. */
function findValue(text, key) {
  let depth = 0;
  for (let i = 0; i < text.length; i += 1) {
    const c = text[i];
    if (c === '"') {
      let j = i + 1;
      while (j < text.length && text[j] !== '"') j += text[j] === '\\' ? 2 : 1;
      const token = text.slice(i + 1, j);
      let k = j + 1;
      while (k < text.length && WS.test(text[k])) k += 1;
      if (depth === 1 && text[k] === ':' && JSON.parse(`"${token}"`) === key) {
        k += 1;
        while (k < text.length && WS.test(text[k])) k += 1;
        return { start: k, end: endOfValue(text, k), keyStart: i };
      }
      i = j;
    } else if (c === '{' || c === '[') depth += 1;
    else if (c === '}' || c === ']') depth -= 1;
  }
  return null;
}

/** The index just after the JSON value that starts at `from` (an array here, but any value works). */
function endOfValue(text, from) {
  if (text[from] !== '[' && text[from] !== '{') {
    let k = from;
    while (k < text.length && !/[,}\]\s]/.test(text[k])) k += 1;
    return k;
  }
  let depth = 0;
  for (let i = from; i < text.length; i += 1) {
    const c = text[i];
    if (c === '"') {
      i += 1;
      while (i < text.length && text[i] !== '"') i += text[i] === '\\' ? 2 : 1;
    } else if (c === '{' || c === '[') depth += 1;
    else if (c === '}' || c === ']') {
      depth -= 1;
      if (depth === 0) return i + 1;
    }
  }
  throw new Error('huddle.json: an array or object is never closed');
}

const eolOf = (text) => (text.includes('\r\n') ? '\r\n' : '\n');

/** The leading blanks of the line that holds `index`. */
function indentAt(text, index) {
  const lineStart = text.lastIndexOf('\n', index - 1) + 1;
  return /^[ \t]*/.exec(text.slice(lineStart))[0];
}

/** `text` (the content of huddle.json) with `assignees` set to `list`. Only the array changes; a missing key is added as the last one. */
export function withAssignees(text, list) {
  const items = list.map((login) => JSON.stringify(login));
  const eol = eolOf(text);
  const found = findValue(text, 'assignees');
  if (!found) {
    const close = text.lastIndexOf('}');
    if (close < 0) throw new Error('huddle.json: no object found');
    let last = close;
    while (last > 0 && WS.test(text[last - 1])) last -= 1;
    const indent = /\n([ \t]+)"/.exec(text)?.[1] ?? '  ';
    return `${text.slice(0, last)},${eol}${indent}"assignees": [${items.join(', ')}]${text.slice(last)}`;
  }
  const old = text.slice(found.start, found.end);
  let next;
  if (!items.length) next = '[]';
  else if (/[\r\n]/.test(old)) {
    const itemIndent = /\n([ \t]*)"/.exec(old)?.[1] ?? `${indentAt(text, found.keyStart)}  `;
    next = `[${eol}${items.map((i) => `${itemIndent}${i}`).join(`,${eol}`)}${eol}${indentAt(text, found.keyStart)}]`;
  } else next = `[${items.join(/",\S/.test(old) ? ',' : ', ')}]`;
  return text.slice(0, found.start) + next + text.slice(found.end);
}

const webHost = (config) => config.host || (config.platform === 'gitlab' ? 'gitlab.com' : 'github.com');

/**
 * What the AI Manager does so that `login` can be assigned. Huddle never does it: it does not invite anyone or change a platform setting.
 * `exists` false: the login is not on the platform at all, so there is nothing to invite yet.
 */
export function assignStep(config, login, exists) {
  if (!exists) return `There is no user "${login}" on ${webHost(config)}. Check the spelling, or ask them to create the account first.`;
  if (config.platform === 'gitlab') {
    return `Step for the AI Manager: open https://${webHost(config)}/${config.project}/-/project_members (Manage → Members), invite ${login} with the role Developer or higher.`;
  }
  const hostFlag = config.host ? ` --hostname ${config.host}` : '';
  return `Step for the AI Manager: Settings → Collaborators → Add people (https://${webHost(config)}/${config.project}/settings/access), or run: gh api${hostFlag} -X PUT repos/${config.project}/collaborators/${login}`;
}
