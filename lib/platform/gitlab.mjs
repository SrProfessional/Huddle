// Huddle: the GitLab adapter, on `glab api` (REST v4) for gitlab.com and self-managed servers (docs/design.md §7).
// It speaks only to a runner, so tests inject canned `glab` output. A runner is `(args: string[], { input?, env? }) => stdout string`
// (sync or async). The default one starts the real `glab`.
//
// How GitLab differs from GitHub, and what this file does about it:
//   - notes include system notes («added label …»): dropped in comments()                                (design §7, difference 5)
//   - no «closed as completed»: an Issue is merged only when a merged MR closed it (closed_by)            (difference 1)
//   - an Issue does not list its MRs, notes do not carry reactions: closed_by and award emoji are extra calls
//   - a note is addressed through its Issue, but the interface passes only the note id: the adapter remembers which Issue
//     each note it has seen belongs to (comments(), postComment()), so editComment/markTaken work on notes read before.
//   - assignee_ids replaces the list, so assign() sends the current assignees plus the new one.

import { execFile } from 'node:child_process';

/** The real `glab`. Never used in tests: they pass their own runner. */
export function glabRunner(args, { input, env } = {}) {
  return new Promise((resolve, reject) => {
    const child = execFile('glab', args, { env: { ...process.env, ...env }, maxBuffer: 64 * 1024 * 1024, windowsHide: true }, (err, stdout, stderr) => {
      if (err) return reject(new Error(`glab ${args.join(' ')} failed: ${String(stderr || err.message).trim()}`));
      resolve(stdout);
    });
    child.stdin.end(input ?? '');
  });
}

/** `glab api --paginate` prints the pages one after another (`[..][..]`), which is not one JSON document. Reads every value and joins the arrays. */
export function parsePages(text) {
  const out = [];
  let depth = 0, start = -1, inString = false, escaped = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === '"') inString = false;
    } else if (ch === '"') inString = true;
    else if (ch === '[' || ch === '{') { if (depth++ === 0) start = i; }
    else if ((ch === ']' || ch === '}') && --depth === 0) {
      const value = JSON.parse(text.slice(start, i + 1));
      if (Array.isArray(value)) out.push(...value); else out.push(value);
    }
  }
  if (depth !== 0 || inString) throw new Error('glab api: the response ended in the middle of a JSON value');
  return out;
}

export function createGitlab({ project, host } = {}, { run = glabRunner } = {}) {
  if (!project) throw new Error('huddle.json: "project" is required (the project path, groups allowed)');
  const root = `projects/${encodeURIComponent(project)}`;
  const web = `https://${host || 'gitlab.com'}/${project}`;
  const hostArgs = host ? ['--hostname', host] : []; // empty host: gitlab.com, glab's default
  const noteIssue = new Map(); // note id -> Issue number

  const glab = async (args, input) => run(['api', ...hostArgs, ...args].map(String), input === undefined ? {} : { input });
  const call = async (method, endpoint, body) => {
    const args = method === 'GET' ? [endpoint] : ['-X', method, ...(body === undefined ? [] : ['-H', 'Content-Type: application/json', '--input', '-']), endpoint];
    const text = await glab(args, body === undefined ? undefined : JSON.stringify(body));
    return text.trim() ? JSON.parse(text) : null;
  };
  const get = (endpoint) => call('GET', endpoint);
  const list = async (endpoint) => parsePages(await glab(['--paginate', `${endpoint}${endpoint.includes('?') ? '&' : '?'}per_page=100`]));
  const noteUrl = (n, id) => `${web}/-/issues/${n}#note_${id}`;
  const issuePath = (n) => `${root}/issues/${n}`;
  const issueOfNote = (id) => {
    const n = noteIssue.get(Number(id));
    if (n === undefined) throw new Error(`GitLab note ${id}: its Issue is unknown; read the comments of the Issue first`);
    return n;
  };
  const closedBy = async (n) => (await list(`${issuePath(n)}/closed_by`)).map((mr) => ({ number: mr.iid, merged: mr.state === 'merged' }));

  return {
    async listOpenIssues() {
      const items = await list(`${root}/issues?state=opened`);
      return Promise.all(items.map(async (i) => ({
        number: i.iid, title: i.title, body: i.description ?? '',
        assignees: (i.assignees ?? []).map((a) => a.username), labels: (i.labels ?? []).map((l) => (typeof l === 'string' ? l : l.name)),
        reviews: (await closedBy(i.iid)).map((r) => r.number),
      })));
    },

    /** Merged = closed *and* a merged MR closed it. Closed by hand, or open, is not. */
    async issueState(n) {
      const { state } = await get(issuePath(n));
      const open = state === 'opened';
      return { open, merged: !open && (await closedBy(n)).some((r) => r.merged) };
    },

    async openReviews() {
      const mrs = await list(`${root}/merge_requests?state=opened`);
      return mrs.filter((mr) => !(mr.draft || mr.work_in_progress)).map((mr) => mr.iid);
    },

    async reviewsClosing(n) {
      return (await closedBy(n)).map((r) => r.number);
    },

    /** Human notes only, oldest first; `taken` is the 👀 award emoji, one call per note. */
    async comments(n) {
      const notes = (await list(`${issuePath(n)}/notes?sort=asc&order_by=created_at`)).filter((x) => !x.system);
      return Promise.all(notes.map(async (x) => {
        noteIssue.set(x.id, n);
        const awards = await list(`${issuePath(n)}/notes/${x.id}/award_emoji`);
        return { id: x.id, author: x.author?.username ?? '', body: x.body ?? '', createdAt: x.created_at, url: noteUrl(n, x.id), taken: awards.some((a) => a.name === 'eyes') };
      }));
    },

    async postComment(n, body) {
      const note = await call('POST', `${issuePath(n)}/notes`, { body });
      noteIssue.set(note.id, n);
      return { id: note.id, url: noteUrl(n, note.id) };
    },

    async editComment(id, body) {
      await call('PUT', `${issuePath(issueOfNote(id))}/notes/${id}`, { body });
    },

    async markTaken(id) {
      await call('POST', `${issuePath(issueOfNote(id))}/notes/${id}/award_emoji`, { name: 'eyes' });
    },

    async setLabels(n, add = [], remove = []) {
      if (!add.length && !remove.length) return;
      await call('PUT', issuePath(n), { ...(add.length ? { add_labels: add.join(',') } : {}), ...(remove.length ? { remove_labels: remove.join(',') } : {}) });
    },

    /** Creates each label, or updates it when it exists (looked up once, by name). */
    async ensureLabels(labels) {
      const existing = new Map((await list(`${root}/labels`)).map((l) => [l.name, l.id]));
      for (const l of labels) {
        const fields = { color: `#${String(l.color).replace(/^#/, '')}`, description: l.description ?? '' };
        if (existing.has(l.name)) await call('PUT', `${root}/labels/${existing.get(l.name)}`, fields);
        else await call('POST', `${root}/labels`, { name: l.name, ...fields });
      }
    },

    async assign(n, login) {
      const found = await get(`users?username=${encodeURIComponent(login)}`);
      const user = (found ?? []).find((u) => u.username === login) ?? found?.[0];
      if (!user) throw new Error(`GitLab has no user "${login}"`);
      const issue = await get(issuePath(n));
      const ids = (issue.assignees ?? []).map((a) => a.id);
      if (ids.includes(user.id)) return;
      await call('PUT', issuePath(n), { assignee_ids: [...ids, user.id] });
    },

    /** A merge commit; the source branch stays. */
    async merge(review) {
      await call('PUT', `${root}/merge_requests/${review}/merge`, { should_remove_source_branch: false });
    },

    async me() {
      return (await get('user')).username;
    },
  };
}
