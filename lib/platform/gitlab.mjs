// Huddle: the GitLab adapter, on `glab api` (REST v4) for gitlab.com and self-managed servers (docs/design.md §7).
// It speaks only to a runner, so tests inject canned `glab` output. A runner is `(args: string[], { input?, env? }) => stdout string`
// (sync or async). The default one starts the real `glab`.
//
// How GitLab differs from GitHub, and what this file does about it:
//   - notes include system notes («added label …»): dropped in comments()                                (design §7, difference 5)
//   - a close has no reason or closing event: an Issue is merged only when a merged MR closed it (closed_by)  (difference 1)
//   - an Issue does not list its MRs, notes do not carry reactions: closed_by and award emoji are extra calls
//   - a note is addressed through its Issue or its MR (they are numbered separately): the caller passes { review: true } for an MR, so the adapter keeps no state.
//   - assignee_ids replaces the list, so assign() sends the current assignees plus the new one.

import { execFile } from 'node:child_process';
import { requestCandidates } from '../core/review-requests.mjs';

/** The real `glab`. Never used in tests: they pass their own runner. */
export function glabRunner(args, { input, env } = {}) {
  return new Promise((resolve, reject) => {
    const child = execFile('glab', args, { env: { ...process.env, ...env }, maxBuffer: 64 * 1024 * 1024, windowsHide: true }, (err, stdout, stderr) => {
      // The spawn error's code (ENOENT when `glab` is missing) rides on the error: the message alone cannot tell «not installed» apart.
      if (err) return reject(Object.assign(new Error(`glab ${args.join(' ')} failed: ${String(stderr || err.message).trim()}`), err.code === undefined ? {} : { code: err.code }));
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

/**
 * True when `glab` answered «404 Not Found». Only the text after «failed: » is read: the part before it is the command and its
 * arguments, which hold ids and names, so a user id of 404 must not turn an offline failure into a «no».
 */
const isNotFound = (e) => /\b404\b|\bNot Found\b/i.test(String(e?.message).split(' failed: ').slice(1).join(' failed: '));

// Each closed Issue of a milestone costs one `glab` process (closed_by). Never start more than this many at once.
const CLOSED_BY_AT_ONCE = 8;
// Each note that could be a request costs one `glab` process (award emoji): the same cap.
const AWARDS_AT_ONCE = CLOSED_BY_AT_ONCE;

/** Like Promise.all(items.map(fn)), but with at most `limit` calls running at once; the results keep the order of `items`. */
async function mapLimit(items, limit, fn) {
  const out = new Array(items.length);
  let next = 0;
  const worker = async () => { for (let i = next++; i < items.length; i = next++) out[i] = await fn(items[i]); };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}

export function createGitlab({ project, host, ai_manager } = {}, { run = glabRunner } = {}) {
  if (!project) throw new Error('huddle.json: "project" is required (the project path, groups allowed)');
  const root = `projects/${encodeURIComponent(project)}`;
  const web = `https://${host || 'gitlab.com'}/${project}`;
  const hostArgs = host ? ['--hostname', host] : []; // empty host: gitlab.com, glab's default

  const glab = async (args, input) => run(['api', ...hostArgs, ...args].map(String), input === undefined ? {} : { input });
  const call = async (method, endpoint, body) => {
    const args = method === 'GET' ? [endpoint] : ['-X', method, ...(body === undefined ? [] : ['-H', 'Content-Type: application/json', '--input', '-']), endpoint];
    const text = await glab(args, body === undefined ? undefined : JSON.stringify(body));
    return text.trim() ? JSON.parse(text) : null;
  };
  const get = (endpoint) => call('GET', endpoint);
  const list = async (endpoint) => parsePages(await glab(['--paginate', `${endpoint}${endpoint.includes('?') ? '&' : '?'}per_page=100`]));
  // Issues and MRs are numbered separately on GitLab, so a bare number is not enough: the caller says `{ review: true }` for an MR.
  const kind = ({ review } = {}) => (review ? 'merge_requests' : 'issues');
  const noteUrl = (n, id, opts) => `${web}/-/${kind(opts)}/${n}#note_${id}`;
  const issuePath = (n) => `${root}/issues/${n}`;
  /** The user whose username is `login`. GitLab usernames are case-insensitive, so `Ana` finds `ana`. */
  const userNamed = async (login) => (await get(`users?username=${encodeURIComponent(login)}`) ?? []).find((u) => String(u.username).toLowerCase() === String(login).toLowerCase());
  const targetPath = (n, opts) => `${root}/${kind(opts)}/${n}`;
  const sameTitle = (a, b) => String(a).trim().toLowerCase() === String(b).trim().toLowerCase();
  /** The REST row of a milestone in any state (no `state` asks for all of them), or undefined. */
  const milestoneRow = async (title) => (await list(`${root}/milestones`)).find((m) => sameTitle(m.title, title));
  const closedBy = async (n) => (await list(`${issuePath(n)}/closed_by`)).map((mr) => ({ number: mr.iid, merged: mr.state === 'merged' }));

  return {
    async listOpenIssues() {
      const items = await list(`${root}/issues?state=opened`);
      return Promise.all(items.map(async (i) => ({
        number: i.iid, title: i.title, body: i.description ?? '', milestone: i.milestone?.title ?? null,
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

    /**
     * The areas of the project (docs/design.md §12): active milestones, and closed ones since `since`, each with its Issues.
     * GitLab gives a milestone no closing date, so the date of its last update stands for it. A closed Issue costs one closed_by call (merged or by hand).
     */
    async listMilestones({ since } = {}) {
      const limit = since ? Date.parse(since) : -Infinity;
      const found = [];
      for (const state of ['active', 'closed']) {
        for (const m of await list(`${root}/milestones?state=${state}`)) {
          if (state === 'closed' && Date.parse(m.updated_at) < limit) continue;
          const issues = await mapLimit(await list(`${root}/milestones/${m.id}/issues`), CLOSED_BY_AT_ONCE, async (i) => {
            const open = i.state === 'opened';
            return { number: i.iid, open, merged: !open && (await closedBy(i.iid)).some((r) => r.merged) };
          });
          found.push({ title: m.title, description: m.description ?? '', state: state === 'active' ? 'open' : 'closed', closedAt: state === 'closed' ? m.updated_at : null, issues });
        }
      }
      return found;
    },

    /** A milestone in any state, found by title (case and surrounding spaces ignored, so «content» never makes a second «Content»), or null. */
    async findMilestone(title) {
      const row = await milestoneRow(title);
      return row ? { title: row.title, description: row.description ?? '', state: row.state === 'active' ? 'open' : 'closed' } : null;
    },

    async createMilestone({ title, description = '' }) {
      await call('POST', `${root}/milestones`, { title, description });
    },

    /** Rewrites the description of the milestone called `title`; throws when there is none. */
    async updateMilestone(title, { description }) {
      const row = await milestoneRow(title);
      if (!row) throw new Error(`glab: no milestone «${title}» in ${project}`);
      await call('PUT', `${root}/milestones/${row.id}`, { description });
    },

    /** Puts Issue `n` in the milestone called `title`, or takes it out when `title` is null (milestone_id 0). */
    async setIssueMilestone(n, title) {
      if (title === null) return void (await call('PUT', issuePath(n), { milestone_id: 0 }));
      const row = await milestoneRow(title);
      if (!row) throw new Error(`glab: no milestone «${title}» in ${project}`);
      await call('PUT', issuePath(n), { milestone_id: row.id });
    },

    async createIssue({ title, body }) {
      const i = await call('POST', `${root}/issues`, { title, description: body });
      return { number: i.iid, id: i.iid, url: i.web_url ?? `${web}/-/issues/${i.iid}` };
    },

    async updateIssue(n, { body, title }) {
      await call('PUT', issuePath(n), { ...(body === undefined ? {} : { description: body }), ...(title === undefined ? {} : { title }) });
    },

    /** GitLab has no pinned Issues: nothing to do. Returns false so the caller knows. */
    async pinIssue() {
      return false;
    },

    async openReviews() {
      const mrs = await list(`${root}/merge_requests?state=opened`);
      return mrs.filter((mr) => !(mr.draft || mr.work_in_progress)).map((mr) => mr.iid);
    },

    async reviewsClosing(n) {
      return (await closedBy(n)).map((r) => r.number);
    },

    /**
     * Human notes only, oldest first. `taken` is the 👀 award emoji, which costs one call per note, so it is read only for the notes that could be a
     * request (requestCandidates: by the AI Manager, with a prompt, newer than the last work), at most AWARDS_AT_ONCE at a time; any other note says
     * `taken: false`, which nothing looks at. Without `ai_manager` in the config every note is read, as before.
     */
    async comments(n, opts) {
      const notes = (await list(`${targetPath(n, opts)}/notes?sort=asc&order_by=created_at`)).filter((x) => !x.system).map((x) => (
        { id: x.id, author: x.author?.username ?? '', body: x.body ?? '', createdAt: x.created_at, url: noteUrl(n, x.id, opts), taken: false }));
      let ask = notes;
      if (ai_manager) {
        // The commit dates matter only on an MR, and only when a request could be older than one.
        const maybe = requestCandidates({ manager: ai_manager, comments: notes });
        const commits = opts?.review && maybe.length ? (await list(`${targetPath(n, opts)}/commits`)).map((c) => c.committed_date ?? c.authored_date).filter(Boolean) : [];
        ask = requestCandidates({ manager: ai_manager, comments: notes, commits });
      }
      await mapLimit(ask, AWARDS_AT_ONCE, async (note) => {
        note.taken = (await list(`${targetPath(n, opts)}/notes/${note.id}/award_emoji`)).some((a) => a.name === 'eyes');
      });
      return notes;
    },

    async postComment(n, body, opts) {
      const note = await call('POST', `${targetPath(n, opts)}/notes`, { body });
      return { id: note.id, url: noteUrl(n, note.id, opts) };
    },

    async editComment(n, id, body, opts) {
      await call('PUT', `${targetPath(n, opts)}/notes/${id}`, { body });
    },

    async markTaken(n, id, opts) {
      await call('POST', `${targetPath(n, opts)}/notes/${id}/award_emoji`, { name: 'eyes' });
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

    async listLabels() {
      return (await list(`${root}/labels`)).map((l) => l.name);
    },

    async listClosedIssues() {
      const items = await list(`${root}/issues?state=closed`);
      return items.map((i) => ({ number: i.iid, title: i.title ?? '', labels: (i.labels ?? []).map((l) => (typeof l === 'string' ? l : l.name)), milestone: i.milestone?.title ?? null }));
    },

    async reviewCommits(n) {
      return (await list(`${root}/merge_requests/${n}/commits`)).map((c) => c.committed_date ?? c.authored_date).filter(Boolean);
    },

    /** The Issue that the open MR of `branch` closes, or null (no open MR, or it closes nothing). */
    async issueForBranch(branch) {
      const mrs = await list(`${root}/merge_requests?state=opened&source_branch=${encodeURIComponent(branch)}`);
      for (const mr of mrs) {
        const closes = await list(`${root}/merge_requests/${mr.iid}/closes_issues`);
        if (closes.length) return closes[0].iid;
      }
      return null;
    },

    /**
     * Whether Huddle could assign an Issue to `login`: a member of the project, or of a group above it (members/all), with at least the
     * Developer role (access level 30). A 404 is a «no»; any other failure is thrown, so it is never read as a verdict on the person.
     */
    async canAssign(login) {
      const user = await userNamed(login);
      if (!user) return false;
      try {
        const member = await get(`${root}/members/all/${user.id}`);
        return (member?.access_level ?? 0) >= 30;
      } catch (e) {
        if (isNotFound(e)) return false;
        throw e;
      }
    },

    async findUser(login) {
      return (await userNamed(login)) !== undefined;
    },
  };
}
