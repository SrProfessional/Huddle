// A fake `glab`: an in-memory GitLab that answers the exact `glab api` calls lib/platform/gitlab.mjs sends, with GitLab REST v4 JSON.
// The contract suite drives it through the same neutral `world` methods as test/platform/fake-gh.mjs; nothing here starts a process
// or touches the network. A call the fake does not know throws, so an adapter cannot slip in a request the tests never saw.
//
// Realism that the adapter has to cope with:
//   - paged lists: `--paginate` prints the pages one after another (`[..][..]`), PAGE_SIZE items each, not one JSON document;
//   - system notes («added ~label»): every Issue starts with one, and label/assignee changes add more;
//   - Issues carry no PR list: the MRs that close one come from /closed_by; notes carry no reactions: those are award emoji.

const PROJECT = 'acme/app';
export const PAGE_SIZE = 2;

export function fakeGitlab({ project = PROJECT, host = '' } = {}) {
  const issues = new Map(); // iid -> { iid, title, description, assignees[login], labels[], state, reviews[], hand }
  const reviews = new Map(); // iid -> { iid, draft, state: 'opened' | 'closed' | 'merged' }
  const notes = new Map(); // id -> { id, issue, body, created_at, author, system, eyes }
  const labels = new Map(); // id -> { id, name, color, description }
  const users = new Map([['SrProfessional', 1], ['ana', 2], ['luis', 3]]); // username -> id
  const milestones = new Map(); // id -> { id, iid, title, description, state: 'active' | 'closed', updated_at }
  const calls = [];
  const merged = [];
  let nextNote = 9000;
  let nextIssue = 900;
  let nextLabel = 500;

  const root = `projects/${encodeURIComponent(project)}`;
  const need = (cond, args) => { if (!cond) throw new Error(`fake glab: unexpected command: glab ${args.join(' ')}`); };
  const issueOf = (iid, args) => { const it = issues.get(Number(iid)); if (!it) throw new Error(`fake glab: no Issue ${iid} (glab ${args.join(' ')})`); return it; };
  const pages = (items, paginate) => {
    if (!paginate) return JSON.stringify(items);
    const out = [];
    for (let i = 0; i < Math.max(items.length, 1); i += PAGE_SIZE) out.push(JSON.stringify(items.slice(i, i + PAGE_SIZE)));
    return out.join('\n'); // glab prints the pages one after another
  };
  const addSystemNote = (issue, body) => notes.set(nextNote, { id: nextNote++, issue, body, created_at: '2026-11-01T00:00:00Z', author: 'SrProfessional', system: true, eyes: false });
  const user = (login) => ({ id: users.get(login), username: login, name: login });
  const noteJson = (n) => ({ id: n.id, body: n.body, created_at: n.created_at, author: user(n.author), system: n.system, noteable_iid: n.issue, noteable_type: 'Issue' });
  const mrJson = (r) => ({ iid: r.iid, state: r.state, draft: r.draft, work_in_progress: r.draft, title: `MR ${r.iid}`, source_branch: r.branch ?? '' });
  const issueJson = (i) => ({
    iid: i.iid, title: i.title, description: i.description, state: i.state,
    labels: [...i.labels], assignees: i.assignees.map(user), assignee: i.assignees[0] ? user(i.assignees[0]) : null,
    milestone: i.milestone ? { id: [...milestones.values()].find((m) => m.title === i.milestone)?.id, title: i.milestone } : null,
    web_url: `https://gitlab.test/${project}/-/issues/${i.iid}`,
  });
  const closers = (i) => i.reviews.map((iid) => reviews.get(iid) ?? { iid, draft: false, state: 'opened' });

  function run(args, opts = {}) {
    args = args.map(String);
    calls.push({ args, input: opts.input, env: opts.env });
    need(args[0] === 'api', args);
    // Parse the way `glab api` does: flags, then one endpoint.
    let method = 'GET', paginate = false, hostname = '', inputIsStdin = false, endpoint;
    for (let i = 1; i < args.length; i++) {
      const a = args[i];
      if (a === '-X') method = args[++i].toUpperCase();
      else if (a === '--paginate') paginate = true;
      else if (a === '--hostname') hostname = args[++i];
      else if (a === '--input') inputIsStdin = args[++i] === '-';
      else if (a === '-H') need(/^content-type: application\/json$/i.test(args[++i]), args);
      else { need(endpoint === undefined && !a.startsWith('-'), args); endpoint = a; }
    }
    need(hostname === host, args); // the host reaches glab on every call; empty means gitlab.com (no flag at all)
    need(endpoint !== undefined, args);
    const body = () => { need(inputIsStdin && opts.input !== undefined, args); return JSON.parse(opts.input); };
    const [path, query = ''] = endpoint.split('?');
    const q = new URLSearchParams(query);
    if (paginate) need(q.get('per_page') === '100', args);

    if (path === 'user') return JSON.stringify(user('SrProfessional'));
    if (path === 'users') {
      need(method === 'GET' && q.get('username'), args);
      const login = q.get('username');
      return JSON.stringify(users.has(login) ? [user(login)] : []);
    }
    need(path.startsWith(`${root}/`), args); // the project path is URL-encoded, groups included
    const rest = path.slice(root.length + 1);
    let m;

    if (rest === 'issues' && method === 'GET') {
      need(q.get('state') === 'opened' || q.get('state') === 'closed', args);
      return pages([...issues.values()].filter((i) => i.state === q.get('state')).map(issueJson), paginate);
    }
    if (rest === 'issues' && method === 'POST') {
      const b = body();
      need(typeof b.title === 'string' && typeof b.description === 'string', args);
      const iid = nextIssue++;
      issues.set(iid, { iid, title: b.title, description: b.description, assignees: [], labels: [], state: 'opened', reviews: [], milestone: null });
      return JSON.stringify(issueJson(issues.get(iid)));
    }
    if (rest === 'milestones' && method === 'GET') {
      need(q.get('state') === 'active' || q.get('state') === 'closed', args);
      return pages([...milestones.values()].filter((x) => x.state === q.get('state')), paginate);
    }
    if ((m = /^milestones\/(\d+)\/issues$/.exec(rest))) {
      const ms = milestones.get(Number(m[1]));
      need(method === 'GET' && ms, args);
      return pages([...issues.values()].filter((i) => i.milestone === ms.title).map(issueJson), paginate);
    }
    if ((m = /^issues\/(\d+)$/.exec(rest))) {
      const it = issueOf(m[1], args);
      if (method === 'GET') return JSON.stringify(issueJson(it));
      need(method === 'PUT', args);
      const b = body();
      need(Object.keys(b).length > 0, args);
      if (b.description !== undefined) it.description = b.description;
      for (const l of String(b.add_labels ?? '').split(',').filter(Boolean)) if (!it.labels.includes(l)) { it.labels.push(l); addSystemNote(it.iid, `added ~${l} label`); }
      for (const l of String(b.remove_labels ?? '').split(',').filter(Boolean)) if (it.labels.includes(l)) { it.labels = it.labels.filter((x) => x !== l); addSystemNote(it.iid, `removed ~${l} label`); }
      if (b.assignee_ids) {
        // Like GitLab: the list *replaces* the assignees.
        it.assignees = b.assignee_ids.map((id) => [...users].find(([, uid]) => uid === id)?.[0]);
        need(it.assignees.every(Boolean), args);
        addSystemNote(it.iid, 'assigned');
      }
      return JSON.stringify(issueJson(it));
    }
    if ((m = /^issues\/(\d+)\/closed_by$/.exec(rest))) return JSON.stringify(closers(issueOf(m[1], args)).map(mrJson));
    if ((m = /^issues\/(\d+)\/notes$/.exec(rest))) {
      const it = issueOf(m[1], args);
      if (method === 'GET') {
        need(q.get('sort') === 'asc' && q.get('order_by') === 'created_at', args);
        return pages([...notes.values()].filter((n) => n.issue === it.iid).sort((a, b) => a.created_at.localeCompare(b.created_at) || a.id - b.id).map(noteJson), paginate);
      }
      need(method === 'POST', args);
      const n = { id: nextNote++, issue: it.iid, body: body().body, created_at: '2026-11-05T12:00:00Z', author: 'SrProfessional', system: false, eyes: false };
      notes.set(n.id, n);
      return JSON.stringify(noteJson(n));
    }
    if ((m = /^issues\/(\d+)\/notes\/(\d+)$/.exec(rest))) {
      const n = notes.get(Number(m[2]));
      need(method === 'PUT' && n && n.issue === Number(m[1]) && !n.system, args); // a note is only addressable through its own Issue
      n.body = body().body;
      return JSON.stringify(noteJson(n));
    }
    if ((m = /^issues\/(\d+)\/notes\/(\d+)\/award_emoji$/.exec(rest))) {
      const n = notes.get(Number(m[2]));
      need(n && n.issue === Number(m[1]), args);
      if (method === 'GET') return pages(n.eyes ? [{ id: 1, name: 'eyes' }] : [{ id: 2, name: 'thumbsup' }].slice(0, 0), paginate);
      need(method === 'POST' && body().name === 'eyes', args);
      n.eyes = true;
      return JSON.stringify({ id: 1, name: 'eyes' });
    }
    if (rest === 'merge_requests' && method === 'GET') {
      need(q.get('state') === 'opened', args);
      const branch = q.get('source_branch');
      return pages([...reviews.values()].filter((r) => r.state === 'opened' && (branch === null || r.branch === branch)).map(mrJson), paginate);
    }
    if ((m = /^merge_requests\/(\d+)\/closes_issues$/.exec(rest))) {
      need(method === 'GET' && reviews.has(Number(m[1])), args);
      return pages([...issues.values()].filter((i) => i.reviews.includes(Number(m[1]))).map(issueJson), paginate);
    }
    if ((m = /^merge_requests\/(\d+)\/commits$/.exec(rest))) {
      const r = reviews.get(Number(m[1]));
      need(method === 'GET' && r, args);
      return pages(r.commits.map((d) => ({ id: 'abc', committed_date: d, authored_date: '2000-01-01T00:00:00Z' })), paginate);
    }
    if ((m = /^merge_requests\/(\d+)\/merge$/.exec(rest))) {
      const r = reviews.get(Number(m[1]));
      need(method === 'PUT' && r && r.state === 'opened' && !r.draft, args);
      const b = body();
      need(b.should_remove_source_branch === false, args); // never removing the source branch
      r.state = 'merged';
      merged.push(r.iid);
      return JSON.stringify(mrJson(r));
    }
    if (rest === 'labels') {
      if (method === 'GET') return pages([...labels.values()], paginate);
      need(method === 'POST', args);
      const b = body();
      need(/^#[0-9a-fA-F]{6}$/.test(b.color) && !labels.has(b.name) && ![...labels.values()].some((l) => l.name === b.name), args);
      const l = { id: nextLabel++, name: b.name, color: b.color, description: b.description ?? '' };
      labels.set(l.id, l);
      return JSON.stringify(l);
    }
    if ((m = /^labels\/(\d+)$/.exec(rest))) {
      const l = labels.get(Number(m[1]));
      need(method === 'PUT' && l, args);
      const b = body();
      Object.assign(l, { color: b.color ?? l.color, description: b.description ?? l.description });
      return JSON.stringify(l);
    }
    return need(false, args);
  }

  const world = {
    issue({ number, title = '', body = '', assignees = [], labels: names = [], state = 'open', reviews: closing = [], milestone = null }) {
      const it = { iid: number, title, description: body, assignees: [...assignees], labels: [...names], state: state === 'open' ? 'opened' : 'closed', reviews: [...closing], milestone };
      // GitLab has no «closed as completed»: an Issue counts as merged only because a merged MR closes it.
      if (state === 'merged' && !it.reviews.length) {
        const iid = 10000 + number;
        reviews.set(iid, { iid, draft: false, state: 'merged' });
        it.reviews.push(iid);
      }
      issues.set(number, it);
      addSystemNote(number, `changed title to «${title}»`);
    },
    review({ number, draft = false, open = true, branch = '', commits = [] }) { reviews.set(number, { iid: number, draft, state: open ? 'opened' : 'closed', branch, commits: [...commits] }); },
    comment(issue, { id, author, body, createdAt, taken = false }) {
      if (!users.has(author)) users.set(author, users.size + 1);
      notes.set(id, { id, issue, body, created_at: createdAt, author, system: false, eyes: taken });
    },
    // closedAt: GitLab has no closing date on a milestone, so it is the last update, which is what the adapter reads.
    milestone({ title, description = '', state = 'open', closedAt = null }) {
      const id = 300 + milestones.size;
      milestones.set(id, { id, iid: milestones.size + 1, title, description, state: state === 'open' ? 'active' : 'closed', updated_at: closedAt ?? '2026-11-01T00:00:00Z' });
    },
    created: () => [...issues.values()].filter((i) => i.iid >= 900).map((i) => ({ number: i.iid, title: i.title, body: i.description })),
    bodyOf: (n) => issues.get(n).description,
    pinned: () => [], // GitLab has no pinned Issues
    labelsOf: (n) => [...issues.get(n).labels],
    assigneesOf: (n) => [...issues.get(n).assignees],
    repoLabels: () => Object.fromEntries([...labels.values()].map((l) => [l.name, { color: l.color.replace(/^#/, ''), description: l.description }])),
    commentBody: (id) => notes.get(id)?.body,
    isTaken: (id) => notes.get(id).eyes,
    merged: () => [...merged],
    commandCount: () => calls.length,
    // GitLab-only: lets a test look at the system notes the adapter must never return.
    systemNotes: (n) => [...notes.values()].filter((x) => x.issue === n && x.system).length,
    calls: () => calls.map((c) => ({ ...c })),
  };
  return { run, world, project, host };
}
