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
  const reviews = new Map(); // iid -> { iid, draft, state: 'opened' | 'closed' | 'merged', branch, base, body }
  const branches = new Set(['main']); // the branches that exist on the remote
  const notes = new Map(); // id -> { id, issue, body, created_at, author, system, eyes }
  const labels = new Map(); // id -> { id, name, color, description }
  const users = new Map([['SrProfessional', 1], ['ana', 2], ['luis', 3]]); // username -> id
  const members = new Map([['SrProfessional', 40], ['ana', 30], ['luis', 30]]); // username -> access level (10 Guest, 20 Reporter, 30 Developer, 40 Maintainer)
  const milestones = new Map(); // id -> { id, iid, title, description, state: 'active' | 'closed', updated_at }
  const calls = [];
  const failures = []; // { match(args), message, times } : answers like gitlab.com when it rate limits or breaks (world.failWhen)
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
  const reviewOf = (iid, args) => { const r = reviews.get(Number(iid)); if (!r) throw new Error(`fake glab: no MR ${iid} (glab ${args.join(' ')})`); return r; };
  const addSystemNote = (issue, body) => notes.set(nextNote, { id: nextNote++, issue, mr: false, body, created_at: '2026-11-01T00:00:00Z', author: 'SrProfessional', system: true, eyes: false });
  const user = (login) => ({ id: users.get(login), username: login, name: login });
  const noteJson = (n) => ({ id: n.id, body: n.body, created_at: n.created_at, author: user(n.author), system: n.system, noteable_iid: n.issue, noteable_type: n.mr ? 'MergeRequest' : 'Issue' });
  const mrJson = (r) => ({
    iid: r.iid, state: r.state, draft: r.draft, work_in_progress: r.draft, title: `MR ${r.iid}`, source_branch: r.branch ?? '',
    target_branch: r.base ?? 'main', description: r.body ?? '', merge_commit_sha: r.state === 'merged' ? `merge${r.iid}` : null,
  });
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
    const failing = failures.find((f) => f.times > 0 && f.match(args, opts));
    if (failing) { failing.times -= 1; throw new Error(`glab ${args.join(' ')} failed: ${failing.message}`); }
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
      const found = [...users.keys()].find((name) => name.toLowerCase() === login.toLowerCase()); // GitLab usernames are case-insensitive
      return JSON.stringify(found ? [user(found)] : []);
    }
    need(path.startsWith(`${root}/`), args); // the project path is URL-encoded, groups included
    const rest = path.slice(root.length + 1);
    let m;

    if ((m = /^members\/all\/(\d+)$/.exec(rest))) {
      // Direct and inherited members. 404 for a user who is not one (read only: nothing here invites anyone).
      need(method === 'GET', args);
      const found = [...members].find(([login]) => users.get(login) === Number(m[1]));
      if (!found) throw new Error(`glab ${args.join(' ')} failed: 404 Not found`);
      return JSON.stringify({ ...user(found[0]), access_level: found[1] });
    }
    if (rest === 'issues' && method === 'GET') {
      need(q.get('state') === 'opened' || q.get('state') === 'closed', args);
      const search = q.get('search');
      need(search === null || q.get('in') === 'title', args); // a text search always says where to look
      return pages([...issues.values()].filter((i) => i.state === q.get('state') && (search === null || i.title.toLowerCase().includes(search.toLowerCase()))).map(issueJson), paginate);
    }
    if (rest === 'issues' && method === 'POST') {
      const b = body();
      need(typeof b.title === 'string' && typeof b.description === 'string', args);
      const iid = nextIssue++;
      issues.set(iid, { iid, title: b.title, description: b.description, assignees: [], labels: [], state: 'opened', reviews: [], milestone: null });
      return JSON.stringify(issueJson(issues.get(iid)));
    }
    if (rest === 'milestones' && method === 'GET') {
      need(!q.get('state') || q.get('state') === 'active' || q.get('state') === 'closed', args); // no state: every milestone
      return pages([...milestones.values()].filter((x) => !q.get('state') || x.state === q.get('state')), paginate);
    }
    if (rest === 'milestones' && method === 'POST') {
      const b = body();
      need(typeof b.title === 'string' && Object.keys(b).every((k) => k === 'title' || k === 'description'), args);
      if ([...milestones.values()].some((x) => x.title === b.title)) throw new Error(`glab ${args.join(' ')} failed: 400 Bad request - Title has already been taken`);
      const id = 300 + milestones.size;
      milestones.set(id, { id, iid: milestones.size + 1, title: b.title, description: b.description ?? '', state: 'active', updated_at: '2026-11-07T00:00:00Z' });
      return JSON.stringify(milestones.get(id));
    }
    if ((m = /^milestones\/(\d+)$/.exec(rest)) && method === 'PUT') {
      const ms = milestones.get(Number(m[1]));
      need(ms, args);
      const b = body();
      need(Object.keys(b).length > 0 && Object.keys(b).every((k) => k === 'description' || k === 'state_event'), args);
      if (b.description !== undefined) ms.description = b.description;
      if (b.state_event !== undefined) {
        need(b.state_event === 'activate' || b.state_event === 'close', args);
        if (!(b.state_event === 'activate' && ms.stuck)) ms.state = b.state_event === 'close' ? 'closed' : 'active'; // `stuck`: a milestone that never reopens (the answer is still a 200)
      }
      return JSON.stringify(ms);
    }
    if ((m = /^milestones\/(\d+)\/issues$/.exec(rest))) {
      const ms = milestones.get(Number(m[1]));
      need(method === 'GET' && ms, args);
      return pages([...issues.values()].filter((i) => i.milestone === ms.title).map(issueJson), paginate);
    }
    if ((m = /^issues\/(\d+)$/.exec(rest))) {
      // Like the real API: a number that is not an Issue is a 404.
      if (method === 'GET' && !issues.has(Number(m[1]))) throw new Error(`glab ${args.join(' ')} failed: 404 Not Found`);
      const it = issueOf(m[1], args);
      if (method === 'GET') return JSON.stringify(issueJson(it));
      need(method === 'PUT', args);
      const b = body();
      need(Object.keys(b).length > 0, args);
      if (b.description !== undefined) it.description = b.description;
      if (b.milestone_id !== undefined) {
        // 0 takes the Issue out of its milestone, like GitLab.
        if (b.milestone_id === 0) it.milestone = null;
        else {
          const ms = milestones.get(b.milestone_id);
          need(ms, args);
          // Like gitlab.com: a closed milestone is not set on an Issue, and the answer is a plain 200, not an error (found by the 0.3.0 smoke test).
          if (ms.state === 'active') it.milestone = ms.title;
        }
      }
      if (b.state_event !== undefined) {
        need(b.state_event === 'close', args);
        it.state = 'closed'; // no MR closed it: closed by hand
      }
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
    if ((m = /^issues\/(\d+)\/related_merge_requests$/.exec(rest))) {
      // Every MR that mentions the Issue (whatever its target and whatever the keyword), and those that close it: GitLab says which only through the text.
      need(method === 'GET', args);
      const n = issueOf(m[1], args).iid;
      const related = new Map(closers(issues.get(n)).map((r) => [r.iid, r]));
      for (const r of reviews.values()) if (new RegExp(`#${n}(?!\w)`).test(r.body ?? '')) related.set(r.iid, r);
      return pages([...related.values()].sort((x, y) => x.iid - y.iid).map(mrJson), paginate);
    }
    if ((m = /^repository\/branches\/(.+)$/.exec(rest))) {
      need(method === 'GET', args);
      if (!branches.has(decodeURIComponent(m[1]))) throw new Error(`glab ${args.join(' ')} failed: 404 Branch Not Found`);
      return JSON.stringify({ name: decodeURIComponent(m[1]) });
    }
    // Notes live under their own kind: issues/:iid/notes for an Issue, merge_requests/:iid/notes for an MR. The two numberings are separate.
    if ((m = /^(issues|merge_requests)\/(\d+)\/notes$/.exec(rest))) {
      const mr = m[1] === 'merge_requests';
      const it = mr ? { iid: reviewOf(m[2], args).iid } : issueOf(m[2], args);
      if (method === 'GET') {
        need(q.get('sort') === 'asc' && q.get('order_by') === 'created_at', args);
        return pages([...notes.values()].filter((n) => n.issue === it.iid && n.mr === mr).sort((a, b) => a.created_at.localeCompare(b.created_at) || a.id - b.id).map(noteJson), paginate);
      }
      need(method === 'POST', args);
      const n = { id: nextNote++, issue: it.iid, mr, body: body().body, created_at: '2026-11-05T12:00:00Z', author: 'SrProfessional', system: false, eyes: false };
      notes.set(n.id, n);
      return JSON.stringify(noteJson(n));
    }
    if ((m = /^(issues|merge_requests)\/(\d+)\/notes\/(\d+)$/.exec(rest))) {
      const n = notes.get(Number(m[3]));
      need(method === 'PUT' && n && n.issue === Number(m[2]) && n.mr === (m[1] === 'merge_requests') && !n.system, args); // a note is only addressable through its own Issue
      n.body = body().body;
      return JSON.stringify(noteJson(n));
    }
    if ((m = /^(issues|merge_requests)\/(\d+)\/notes\/(\d+)\/award_emoji$/.exec(rest))) {
      const n = notes.get(Number(m[3]));
      need(n && n.issue === Number(m[2]) && n.mr === (m[1] === 'merge_requests'), args);
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
    if ((m = /^merge_requests\/(\d+)$/.exec(rest))) {
      const r = reviews.get(Number(m[1]));
      need(method === 'GET' && r, args);
      return JSON.stringify({ ...mrJson(r), sha: r.head, diff_refs: { base_sha: 'base', start_sha: 'start', head_sha: r.head } });
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
        reviews.set(iid, { iid, draft: false, state: 'merged', commits: [], base: 'main', body: `Closes #${number}` });
        it.reviews.push(iid);
      }
      issues.set(number, it);
      addSystemNote(number, `changed title to «${title}»`);
    },
    // base: the branch the MR targets; body: its description; merged: it was merged (so it is not open).
    review({ number, draft = false, open = true, branch = '', commits = [], head = `head${number}`, base = 'main', body = '', merged = false }) {
      reviews.set(number, { iid: number, draft, state: merged ? 'merged' : open ? 'opened' : 'closed', branch, base, body, commits: [...commits], head });
    },
    /** A branch that exists on the remote (`main` always does). */
    branch(name) { branches.add(name); },
    comment(issue, { id, author, body, createdAt, taken = false }) {
      if (!users.has(author)) users.set(author, users.size + 1);
      notes.set(id, { id, issue, mr: false, body, created_at: createdAt, author, system: false, eyes: taken });
    },
    /** A note on merge request `mr`. MR numbers are separate from Issue numbers: this is not a note on Issue `mr`. */
    reviewComment(mr, { id, author, body, createdAt, taken = false }) {
      if (!users.has(author)) users.set(author, users.size + 1);
      notes.set(id, { id, issue: mr, mr: true, body, created_at: createdAt, author, system: false, eyes: taken });
    },
    // closedAt: GitLab has no closing date on a milestone, so it is the last update, which is what the adapter reads.
    milestone({ title, description = '', state = 'open', closedAt = null, stuck = false }) {
      const id = 300 + milestones.size;
      milestones.set(id, { id, iid: milestones.size + 1, title, description, state: state === 'open' ? 'active' : 'closed', updated_at: closedAt ?? '2026-11-01T00:00:00Z', stuck });
    },
    /** A user that exists on GitLab but is no member of the project. */
    user(login) { if (!users.has(login)) users.set(login, users.size + 1); },
    /** A member of the project (or of a group above it) with a role. */
    member(login, role = 'developer') {
      this.user(login);
      members.set(login, { guest: 10, reporter: 20, developer: 30, maintainer: 40, owner: 50 }[role]);
    },
    created: () => [...issues.values()].filter((i) => i.iid >= 900).map((i) => ({ number: i.iid, title: i.title, body: i.description })),
    bodyOf: (n) => issues.get(n).description,
    pinned: () => [], // GitLab has no pinned Issues
    labelsOf: (n) => [...issues.get(n).labels],
    milestoneOf: (n) => issues.get(n).milestone,
    milestoneTitles: () => [...milestones.values()].map((x) => x.title),
    milestoneDescription: (title) => [...milestones.values()].find((x) => x.title === title)?.description,
    assigneesOf: (n) => [...issues.get(n).assignees],
    repoLabels: () => Object.fromEntries([...labels.values()].map((l) => [l.name, { color: l.color.replace(/^#/, ''), description: l.description }])),
    commentBody: (id) => notes.get(id)?.body,
    isTaken: (id) => notes.get(id).eyes,
    merged: () => [...merged],
    commandCount: () => calls.length,
    stateOf: (n) => (issues.get(n).state === 'opened' ? 'open' : 'closed'),
    milestoneState: (title) => ([...milestones.values()].find((x) => x.title === title)?.state === 'active' ? 'open' : 'closed'),
    /** The human comments on Issue `n`, in order. */
    commentsOn: (n) => [...notes.values()].filter((x) => x.issue === n && !x.mr && !x.system).map((x) => x.body),
    /** Answer the next `times` calls for which `match(args)` is true with a failure (the text is what glab prints after «failed: »). */
    failWhen(match, message, times = 1) { failures.push({ match, message, times }); },
    /** Like gitlab.com when it rate limits: 429 with a Retry-After. */
    rateLimit(times, retryAfter) { failures.push({ match: () => true, message: `429 Too Many Requests: Rate limit exceeded${retryAfter === undefined ? '' : ` (Retry-After: ${retryAfter})`}`, times }); },
    // GitLab-only: lets a test look at the system notes the adapter must never return.
    systemNotes: (n) => [...notes.values()].filter((x) => x.issue === n && x.system).length,
    calls: () => calls.map((c) => ({ ...c })),
  };
  return { run, world, project, host };
}
