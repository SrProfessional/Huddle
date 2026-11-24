// Huddle: the steps only the person can do, kept as data in an Issue comment (Issue #338, docs/design.md §13 and §24).
//
// A session that stops because only the person can go on writes ONE comment: a visible numbered list («🙋 Step 1 of 3: …») and a hidden marker
// `<!-- huddle-steps {json} -->` that carries the list, the reason and what the Issue does when the list is done (`resume` or `none`). A later list
// replaces the earlier one. The Coach's session closes the steps one by one with a comment each, `<!-- huddle-step-done:i -->`,
// `huddle-step-failed:i` or `huddle-step-skipped:i` (i is the number of the step, from 1). Nothing here collides with the pause markers
// (`huddle-paused`, `huddle-resumed`, lib/core/pause.mjs) or the machine claim (`huddle-machine:`, lib/core/machine.mjs): the names are different and
// each reader matches only its own. Pure: no network, no clock.

export const CLOSE_KINDS = ['done', 'failed', 'skipped'];
const ENDINGS = ['resume', 'none'];
const STEPS = /<!--\s*huddle-steps\s+(\{[\s\S]*?\})\s*-->/;
const CLOSE = /<!--\s*huddle-step-(done|failed|skipped):(\d+)\s*-->/;
const SIGNS = { done: '✅', failed: '⚠️', skipped: '⏭️' };

// The commands of `bin/huddle`, to refuse a step that tells the person to type one. Lowercase and case sensitive on purpose: «the Huddle dashboard» is a page, not a command.
const COMMANDS = ['labels', 'wait', 'take', 'asked', 'pending', 'queue', 'progress', 'areas', 'team', 'land', 'tested', 'release', 'clean', 'update', 'notice', 'hook', 'doctor', 'effort', 'next', 'capacity', 'status', 'language', 'usage', 'dashboard', 'plan', 'prices', 'machine', 'pause', 'conflicts', 'steps'];
const HUDDLE_COMMAND = new RegExp(`(?:^|[^\\w/-])huddle\\s+(?:-{1,2}[a-z]|(?:${COMMANDS.join('|')})(?![\\w-]))|bin/huddle\\b|/huddle-[a-z]`);

// The verbs a step starts with when it is an action. A second sentence or a joined clause that starts with one is a second action.
const VERBS = 'open|click|tap|press|type|go|run|check|install|log|sign|select|choose|copy|paste|start|launch|create|send|write|take|connect|download|wait|restart|reproduce|enter|switch|scroll|drag|close|save|load|build|play|stop|reload|refresh|read|look|compare|count|find|use|set|turn|plug|unplug|tell|ask|upload|delete|add|remove|visit|navigate|put|try|repeat|note';
const SENTENCE_ACTION = new RegExp(`^(?:${VERBS})\\b`, 'i');
const JOINED_ACTION = new RegExp(`(?:\\band\\s+(?:then\\s+)?|\\bthen\\s+|[;,]\\s*then\\s+)(?:${VERBS})\\b`, 'i');
const THEN = /\band then\b|[;,]\s*then\b|\bafter that\b/i;

const clean = (v) => String(v ?? '').replace(/\s+/g, ' ').trim();
const esc = (v) => clean(v).replace(/</g, '&lt;');
const unesc = (v) => String(v ?? '').replace(/&lt;/g, '<');

/** Why a step is refused: an array of short reasons, empty when it is fine. `{ do, see, else }`, texts for a person with no technical background (§13). */
export function checkStep(step) {
  const why = [];
  const s = { do: clean(step?.do), see: clean(step?.see), else: clean(step?.else) };
  if (!s.do) why.push('it has no action');
  if (!s.see) why.push('it does not say what the person should see');
  if (!s.else) why.push('it does not say what to do if the person sees something else');
  for (const text of Object.values(s)) {
    if (text.includes('<!--')) { why.push('its text holds an HTML comment marker'); break; }
  }
  for (const text of Object.values(s)) {
    if (HUDDLE_COMMAND.test(text)) { why.push('it tells the person to type a huddle command: the session runs it itself after the person confirms'); break; }
  }
  if (s.do) {
    const sentences = s.do.split(/(?<=[.!?])\s+/).filter(Boolean);
    const actions = sentences.filter((x) => SENTENCE_ACTION.test(x.replace(/^\d+[.)]\s*/, ''))).length;
    const numbered = (s.do.match(/(?:^|\s)\d+[.)]\s/g) ?? []).length;
    if (THEN.test(s.do) || JOINED_ACTION.test(s.do) || actions > 1 || numbered > 1) why.push('it holds two actions: one step is one action');
  }
  return why;
}

/** The JSON of the marker: `<`, `>` and `-` are escaped, so the text can never close the comment early or look like another marker. */
const hide = (value) => JSON.stringify(value).replace(/[<>-]/g, (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, '0')}`);

/**
 * The comment of a list of steps: `{ reason, steps: [{ do, see, else }], then }` (`then`: `resume`, the default, or `none`). Throws with every refusal in one
 * message: a list with no step, a step with two actions or one that tells the person to type a huddle command (checkStep), an unknown ending, no reason.
 */
export function stepsBody({ reason, steps, then = 'resume' } = {}) {
  const problems = [];
  const why = clean(reason);
  if (!why) problems.push('the list needs a reason');
  else if (why.includes('<!--')) problems.push('the reason holds an HTML comment marker');
  if (!ENDINGS.includes(then)) problems.push(`the ending is «${then}», it must be resume or none`);
  if (!Array.isArray(steps) || steps.length === 0) problems.push('a list needs at least one step');
  else steps.forEach((s, i) => { for (const p of checkStep(s)) problems.push(`step ${i + 1}: ${p}`); });
  if (problems.length) throw new Error(`huddle steps: the list was refused: ${problems.join('; ')}`);
  const list = steps.map((s) => ({ do: clean(s.do), see: clean(s.see), else: clean(s.else) }));
  const visible = list.map((s, i) => `🙋 Step ${i + 1} of ${list.length}: ${s.do}\nYou should see: ${s.see}\nIf you see something else: ${s.else}`);
  return `🙋 Steps for the person: ${why}\n\n${visible.join('\n\n')}\n\n<!-- huddle-steps ${hide({ v: 1, reason: why, then, steps: list })} -->\n`;
}

/** The comment that closes the current step: `kind` is done, failed or skipped; `{ n, total, do, note }`. The note cannot carry a marker. */
export function stepCloseBody(kind, { n, total, do: action, note } = {}) {
  if (!CLOSE_KINDS.includes(kind)) throw new Error(`huddle steps: unknown way to close a step: ${kind}`);
  const text = esc(note);
  return `${SIGNS[kind]} Step ${n} of ${total} ${kind}: ${esc(action)}\n${text ? `Note: ${text}\n` : ''}\n<!-- huddle-step-${kind}:${n} -->\n`;
}

function parseList(body) {
  const m = STEPS.exec(String(body ?? ''));
  if (!m) return null;
  let data;
  try { data = JSON.parse(m[1]); } catch { return null; }
  if (!data || !Array.isArray(data.steps) || data.steps.length === 0) return null;
  if (!data.steps.every((s) => s && typeof s.do === 'string')) return null;
  return {
    reason: String(data.reason ?? ''),
    then: ENDINGS.includes(data.then) ? data.then : 'resume',
    steps: data.steps.map((s) => ({ do: s.do, see: String(s.see ?? ''), else: String(s.else ?? '') })),
  };
}

/**
 * Where the steps of an Issue stand, from its comments, or null when it has no list. The newest list wins (by time, then by place in the list). Closings
 * count only when they come after that list and, with `manager`, only from that login (the Coach); they close the steps in order, so a closing for a step
 * that is not the current one is ignored. { reason, then, steps: [{ n, do, see, else, state: 'pending' | 'done' | 'failed' | 'skipped', note }], total,
 * current (the number of the first pending step, or null), finished, failed, commentId, author, at }.
 */
export function readSteps(comments, { manager = null } = {}) {
  const sorted = (comments ?? []).map((c, i) => ({ c, i })).sort((a, b) => String(a.c.createdAt ?? '').localeCompare(String(b.c.createdAt ?? '')) || a.i - b.i).map((x) => x.c);
  let at = -1;
  let list = null;
  sorted.forEach((c, i) => { const l = parseList(c.body); if (l) { list = l; at = i; } });
  if (!list) return null;
  const steps = list.steps.map((s, i) => ({ n: i + 1, ...s, state: 'pending', note: '' }));
  let cursor = 0;
  for (const c of sorted.slice(at + 1)) {
    if (cursor >= steps.length) break;
    if (manager && String(c.author ?? '').toLowerCase() !== String(manager).toLowerCase()) continue;
    const m = CLOSE.exec(String(c.body ?? ''));
    if (!m || Number(m[2]) !== steps[cursor].n) continue;
    steps[cursor].state = m[1];
    steps[cursor].note = unesc(/^Note: (.*)$/m.exec(String(c.body ?? ''))?.[1] ?? '');
    cursor += 1;
  }
  const head = sorted[at];
  return {
    reason: list.reason,
    then: list.then,
    steps,
    total: steps.length,
    current: cursor < steps.length ? steps[cursor].n : null,
    finished: cursor >= steps.length,
    failed: steps.some((s) => s.state === 'failed'),
    commentId: head.id ?? null,
    author: head.author ?? '',
    at: String(head.createdAt ?? ''),
  };
}

/** True when closing this list ends with the Issue back in play: every step closed, none failed, and the list says `resume`. */
export const resumesWhenDone = (r) => Boolean(r && r.finished && !r.failed && r.then === 'resume');
