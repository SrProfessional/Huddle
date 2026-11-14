// A fake `gh`: an in-memory GitHub that answers the exact commands lib/platform/github.mjs sends, with GitHub-shaped JSON.
// The contract suite drives it through the neutral `world` methods below; nothing here starts a process or touches the network.
// A command the fake does not know throws, so an adapter cannot slip in a call the tests never saw.

const PROJECT = 'acme/app';

export function fakeGithub({ project = PROJECT } = {}) {
  const issues = new Map(); // number -> { number, title, body, assignees[], labels[], state, closes[], reviews[], milestone }
  const milestones = new Map(); // title -> { number, title, description, state: 'OPEN' | 'CLOSED', closedAt, updatedAt }
  const pinned = [];
  let nextIssue = 900;
  let nextPr = 700; // the number of the next PR opened through the API (openReview)
  const openedPrs = [];
  const reviews = new Map(); // number -> { number, draft, open, merged, branch, base, body }
  const branches = new Set(['main']); // the branches that exist on the remote
  const comments = new Map(); // id -> { ...GitHub comment, issue }
  const repoLabels = new Map(); // name -> { color, description }
  const users = new Map([['SrProfessional', 1], ['ana', 2], ['luis', 3]]); // login -> id
  const collaborators = new Set(['SrProfessional', 'ana', 'luis']); // logins with access to the repo
  const calls = [];
  const failures = []; // { match(args), message, times }: what GitHub answers when it rate limits or breaks (world.failWhen)
  let searchLag = false; // while true, an Issue created through the API is missing from `gh issue list` (it uses search, which indexes late)
  const merged = [];
  let nextId = 9000;

  const values = (args, flag) => args.flatMap((a, i) => (a === flag ? [args[i + 1]] : []));
  const need = (cond, args) => { if (!cond) throw new Error(`fake gh: unexpected command: gh ${args.join(' ')}`); };
  const issueOf = (n, args) => { const it = issues.get(Number(n)); if (!it) throw new Error(`fake gh: no Issue ${n} (gh ${args.join(' ')})`); return it; };
  const commentJson = (c) => ({ id: c.id, body: c.body, created_at: c.created_at, html_url: c.html_url, user: c.user, reactions: c.reactions });

  // The milestone queries of the adapter: pages of milestones (newest update first), each with a page of its Issues and the last close of each.
  const MILESTONE_PAGE = 2;
  const ISSUE_PAGE = 2;
  const XREF_PAGE = 2;
  // The PRs that mention Issue `n` (a CROSS_REFERENCED_EVENT), whatever their base and whatever the keyword: GitHub links on any mention.
  const mentions = (body, n) => new RegExp(`#${n}(?!\\w)`).test(body ?? '');
  const xrefsOf = (n, after) => {
    const all = [...reviews.values()].filter((r) => mentions(r.body, n)).sort((x, y) => x.number - y.number);
    const start = Number(after ?? 0);
    const nodes = all.slice(start, start + XREF_PAGE).map((r) => ({ source: { __typename: 'PullRequest', number: r.number, state: r.open ? 'OPEN' : r.merged ? 'MERGED' : 'CLOSED', merged: r.merged, isDraft: r.draft, baseRefName: r.base, body: r.body, mergedAt: r.merged ? '2026-11-10T00:00:00Z' : null } }));
    // An Issue that mentions it is a cross reference too, and it has no PR fields: the adapter must skip it.
    if (start === 0) nodes.unshift({ source: { __typename: 'Issue' } });
    return { pageInfo: { hasNextPage: start + XREF_PAGE < all.length, endCursor: String(start + XREF_PAGE) }, nodes };
  };
  function graphql(args) {
    const query = values(args, '-f').find((x) => x.startsWith('query=')) ?? '';
    const vars = Object.fromEntries([...values(args, '-f'), ...values(args, '-F')].filter((x) => !x.startsWith('query=')).map((x) => [x.slice(0, x.indexOf('=')), x.slice(x.indexOf('=') + 1)]));
    need(/timelineItems\(itemTypes: ?\[CLOSED_EVENT\], ?last: ?1\)/.test(query) || /pinIssue/.test(query), args);
    const issuePage = (title, after) => {
      const all = [...issues.values()].filter((i) => i.milestone === title).sort((x, y) => x.number - y.number);
      const start = Number(after ?? 0);
      const nodes = all.slice(start, start + ISSUE_PAGE).map((it) => {
        const last = it.closes.at(-1);
        const closes = last ? [{ __typename: 'ClosedEvent', closer: last.pr === null ? null : { __typename: 'PullRequest', number: last.pr, merged: last.merged } }] : [];
        return { number: it.number, state: it.state, timelineItems: { nodes: closes }, ...(/CROSS_REFERENCED_EVENT/.test(query) ? { xrefs: xrefsOf(it.number) } : {}) };
      });
      return { pageInfo: { hasNextPage: start + ISSUE_PAGE < all.length, endCursor: String(start + ISSUE_PAGE) }, nodes };
    };
    if (/pinIssue/.test(query)) {
      need(/^I_\d+$/.test(vars.id ?? '') && issues.has(Number(vars.id.slice(2))), args);
      pinned.push(Number(vars.id.slice(2)));
      return JSON.stringify({ data: { pinIssue: { issue: { number: Number(vars.id.slice(2)) } } } });
    }
    if (/node\(id/.test(query)) {
      const m = [...milestones.values()].find((x) => `M${x.number}` === vars.id);
      need(m, args);
      return JSON.stringify({ data: { node: { issues: issuePage(m.title, vars.after) } } });
    }
    need(vars.owner === project.split('/')[0] && vars.name === project.split('/')[1], args);
    const states = /states: ?\[(OPEN|CLOSED)\]/.exec(query);
    need(states && /orderBy: ?\{field: ?UPDATED_AT, ?direction: ?DESC\}/.test(query), args);
    const all = [...milestones.values()].filter((m) => m.state === states[1]).sort((x, y) => y.updatedAt.localeCompare(x.updatedAt));
    const start = Number(vars.after ?? 0);
    const nodes = all.slice(start, start + MILESTONE_PAGE).map((m) => ({ id: `M${m.number}`, title: m.title, description: m.description, state: m.state, closedAt: m.closedAt, updatedAt: m.updatedAt, issues: issuePage(m.title) }));
    return JSON.stringify({ data: { repository: { milestones: { pageInfo: { hasNextPage: start + MILESTONE_PAGE < all.length, endCursor: String(start + MILESTONE_PAGE) }, nodes } } } });
  }

  function run(args, opts = {}) {
    args = args.map(String);
    calls.push({ args, input: opts.input });
    const failing = failures.find((f) => f.times > 0 && f.match(args, opts));
    if (failing) { failing.times -= 1; throw new Error(`gh ${args.join(' ')} failed: ${failing.message}`); }
    const [a, b] = args;
    const listed = (i) => !(searchLag && i.fresh); // what search can see
    // Every repo-scoped command must name the project, so a wrong or missing -R is caught.
    if (a !== 'api') need(values(args, '-R')[0] === project, args);

    if (a === 'issue' && b === 'list' && values(args, '--state')[0] === 'closed') {
      need(values(args, '--json')[0] === 'number,title,labels,milestone', args);
      return JSON.stringify([...issues.values()].filter((i) => i.state === 'CLOSED' && listed(i)).map((i) => ({ number: i.number, title: i.title, labels: i.labels.map((name) => ({ name })), milestone: i.milestone ? { title: i.milestone } : null })));
    }
    if (a === 'label' && b === 'list') {
      need(values(args, '--json')[0] === 'name', args);
      return JSON.stringify([...repoLabels.keys()].map((name) => ({ name })));
    }
    if (a === 'issue' && b === 'list') {
      need(args.includes('--json') && values(args, '--state')[0] === 'open', args);
      return JSON.stringify([...issues.values()].filter((i) => i.state === 'OPEN' && listed(i)).map((i) => ({
        number: i.number, title: i.title, body: i.body,
        assignees: i.assignees.map((login) => ({ login })), labels: i.labels.map((name) => ({ name })),
        closedByPullRequestsReferences: i.reviews.map((number) => ({ number })),
        milestone: i.milestone ? { title: i.milestone } : null,
      })));
    }
    if (a === 'api' && b === 'graphql' && /milestones\(|node\(id|pinIssue/.test(values(args, '-f').find((x) => x.startsWith('query=')) ?? '')) return graphql(args);
    if (a === 'api' && b === 'graphql' && /\$after: String\) \{ repository\(owner: \$owner, name: \$name\) \{ issue\(number: \$number\)/.test(values(args, '-f').find((x) => x.startsWith('query=')) ?? '')) {
      // The next page of the PRs that mention one Issue (the first page came with the Issue).
      const vars = Object.fromEntries([...values(args, '-F'), ...values(args, '-f').filter((x) => !x.startsWith('query='))].map((x) => [x.slice(0, x.indexOf('=')), x.slice(x.indexOf('=') + 1)]));
      need(vars.owner === project.split('/')[0] && vars.name === project.split('/')[1] && /^\d+$/.test(vars.number ?? '') && issues.has(Number(vars.number)) && vars.after, args);
      return JSON.stringify({ data: { repository: { issue: { xrefs: xrefsOf(Number(vars.number), vars.after) } } } });
    }
    if (a === 'api' && b === 'graphql') {
      // The one query issueState sends: the Issue state plus its last CLOSED_EVENT and who closed it.
      const query = values(args, '-f').find((x) => x.startsWith('query=')) ?? '';
      need(/timelineItems\(itemTypes: ?\[CLOSED_EVENT\], ?last: ?1\)/.test(query) && /closer/.test(query), args);
      const vars = Object.fromEntries([...values(args, '-F'), ...values(args, '-f').filter((x) => !x.startsWith('query='))].map((x) => [x.slice(0, x.indexOf('=')), x.slice(x.indexOf('=') + 1)]));
      need(vars.owner === project.split('/')[0] && vars.name === project.split('/')[1] && /^\d+$/.test(vars.number ?? ''), args);
      // Like the real GraphQL: a number that is not an Issue (a PR, a typo, a deleted Issue) fails with this text.
      const it = issues.get(Number(vars.number));
      if (!it) throw new Error(`gh ${args.join(' ')} failed: gh: Could not resolve to an Issue with the number of ${vars.number}.`);
      const last = it.closes.at(-1);
      const nodes = last ? [{ __typename: 'ClosedEvent', closer: last.pr === null ? null : { __typename: 'PullRequest', number: last.pr, merged: last.merged } }] : [];
      return JSON.stringify({ data: { repository: { issue: { state: it.state, timelineItems: { nodes }, ...(/CROSS_REFERENCED_EVENT/.test(query) ? { xrefs: xrefsOf(it.number) } : {}) } } } });
    }
    if (a === 'issue' && b === 'view') {
      const fields = values(args, '--json')[0];
      if (fields === 'labels') {
        // Like gh: a number that is not an Issue fails with this text.
        const found = issues.get(Number(args[2]));
        if (!found) throw new Error(`gh ${args.join(' ')} failed: GraphQL: Could not resolve to an issue or pull request with the number of ${args[2]}. (repository.issue)`);
        return JSON.stringify({ labels: found.labels.map((name) => ({ name })) });
      }
      const it = issueOf(args[2], args);
      if (fields === 'closedByPullRequestsReferences') return JSON.stringify({ closedByPullRequestsReferences: it.reviews.map((number) => ({ number })) });
      need(false, args);
    }
    if (a === 'pr' && b === 'list' && args.includes('--head')) {
      // Without a staging branch the fields are exactly today's; with one, the base and the body come too (the link is read from the body).
      const fields = values(args, '--json')[0];
      need(values(args, '--state')[0] === 'open' && (fields === 'number,closingIssuesReferences' || fields === 'number,closingIssuesReferences,baseRefName,body'), args);
      const head = values(args, '--head')[0];
      return JSON.stringify([...reviews.values()].filter((r) => r.open && r.branch === head).map((r) => ({
        number: r.number, closingIssuesReferences: [...issues.values()].filter((i) => i.reviews.includes(r.number)).map((i) => ({ number: i.number })),
        ...(fields.includes('body') ? { baseRefName: r.base, body: r.body } : {}),
      })));
    }
    if (a === 'pr' && b === 'list' && args.includes('--base') && values(args, '--state')[0] !== 'merged') {
      // The open PRs into one base, with their bodies, in one call: the adapter parses the links itself.
      need(values(args, '--state')[0] === 'open' && values(args, '--limit')[0] === '1000' && values(args, '--json')[0] === 'number,isDraft,body,headRefName', args);
      const base = values(args, '--base')[0];
      return JSON.stringify([...reviews.values()].filter((r) => r.open && r.base === base).map((r) => ({ number: r.number, isDraft: r.draft, body: r.body, headRefName: r.branch })));
    }
    if (a === 'pr' && b === 'list' && values(args, '--state')[0] !== 'merged') {
      need(args.includes('--json') && values(args, '--state')[0] === 'open', args);
      return JSON.stringify([...reviews.values()].filter((r) => r.open).map((r) => ({ number: r.number, isDraft: r.draft })));
    }
    if (a === 'pr' && b === 'view') {
      const fields = values(args, '--json')[0];
      need(fields === 'headRefOid' || fields === 'number,state,baseRefName,body,mergedAt', args);
      const r = reviews.get(Number(args[2]));
      if (fields === 'headRefOid') { need(r, args); return JSON.stringify({ headRefOid: r.head }); }
      if (!r) throw new Error(`gh ${args.join(' ')} failed: GraphQL: Could not resolve to a PullRequest with the number of ${args[2]}. (repository.pullRequest)`);
      return JSON.stringify({ number: r.number, state: r.open ? 'OPEN' : r.merged ? 'MERGED' : 'CLOSED', baseRefName: r.base, body: r.body, mergedAt: r.merged ? r.mergedAt : null });
    }
    if (a === 'pr' && b === 'list' && values(args, '--state')[0] === 'merged') {
      // The merged PRs into one base, in the order GitHub lists them (by creation, newest first): the adapter sorts by mergedAt itself.
      need(values(args, '--json')[0] === 'number,baseRefName,body,mergedAt,mergeCommit' && values(args, '--base').length === 1, args);
      const base = values(args, '--base')[0];
      const limit = Number(values(args, '--limit')[0]);
      return JSON.stringify([...reviews.values()].filter((r) => r.merged && r.base === base).sort((x, y) => y.number - x.number).slice(0, limit)
        .map((r) => ({ number: r.number, baseRefName: r.base, body: r.body, mergedAt: r.mergedAt, mergeCommit: { oid: `merge${r.number}` } })));
    }
    if (a === 'pr' && b === 'merge') {
      need(args.includes('--merge') && !args.includes('--delete-branch'), args);
      const r = reviews.get(Number(args[2]));
      need(r && r.open && !r.draft, args);
      r.open = false;
      r.merged = true;
      merged.push(r.number);
      return '';
    }
    if (a === 'issue' && b === 'edit') {
      const it = issueOf(args[2], args);
      for (const l of values(args, '--add-label')) if (!it.labels.includes(l)) it.labels.push(l);
      for (const l of values(args, '--remove-label')) it.labels = it.labels.filter((x) => x !== l);
      for (const u of values(args, '--add-assignee')) if (!it.assignees.includes(u)) it.assignees.push(u);
      for (const t of values(args, '--milestone')) {
        // Like the real `gh issue edit --milestone`: it finds the title only among the open milestones.
        if (milestones.get(t)?.state !== 'OPEN') throw new Error(`gh ${args.join(' ')} failed: could not add to milestone '${t}': 'not found'`);
        it.milestone = t;
      }
      if (args.includes('--remove-milestone')) it.milestone = null;
      need(args.length > 4, args);
      return '';
    }
    if (a === 'label' && b === 'create') {
      need(args.includes('--force') && values(args, '--color').length === 1, args);
      // github.com refuses a label description longer than 100 characters (Validation Failed, HTTP 422).
      if ((values(args, '--description')[0] ?? '').length > 100) throw new Error(`gh ${args.join(' ')} failed: Validation Failed: description is too long (maximum is 100 characters) (HTTP 422)`);
      repoLabels.set(args[2], { color: values(args, '--color')[0], description: values(args, '--description')[0] ?? '' });
      return '';
    }
    if (a === 'api') {
      const path = args.find((x) => x.startsWith('repos/') || x.startsWith('users/') || x === 'user');
      if (path === 'user') return JSON.stringify({ login: 'SrProfessional', id: 1 });
      let u;
      if ((u = /^users\/([^/]+)$/.exec(path))) {
        const login = decodeURIComponent(u[1]);
        if (!users.has(login)) throw new Error(`gh ${args.join(' ')} failed: gh: Not Found (HTTP 404)`);
        return JSON.stringify({ login, id: users.get(login) });
      }
      const base = `repos/${project}/`;
      need(path && path.startsWith(base), args);
      const rest = path.slice(base.length);
      const method = (values(args, '-X')[0] ?? 'GET').toUpperCase();
      let m;
      if ((m = /^collaborators\/([^/]+)$/.exec(rest))) {
        // 204 with no body when the user is a collaborator, 404 when not (also for a login that does not exist). Read only: a PUT is a call the tests never allow.
        need(method === 'GET', args);
        if (!collaborators.has(decodeURIComponent(m[1]))) throw new Error(`gh ${args.join(' ')} failed: gh: Not Found (HTTP 404)`);
        return '';
      }
      if (rest === 'pulls' && method === 'POST') {
        need(values(args, '--input')[0] === '-', args);
        const b = JSON.parse(opts.input);
        need(['title', 'head', 'base', 'body'].every((k) => typeof b[k] === 'string'), args);
        const number = nextPr++;
        reviews.set(number, { number, draft: false, open: true, merged: false, branch: b.head, base: b.base, body: b.body, commits: [], head: `head${number}`, mergedAt: null });
        openedPrs.push({ number, base: b.base, head: b.head, title: b.title, body: b.body });
        return JSON.stringify({ number, html_url: `https://github.test/${project}/pull/${number}` });
      }
      if ((m = /^branches\/(.+)$/.exec(rest))) {
        need(method === 'GET', args);
        if (!branches.has(m[1].split('/').map(decodeURIComponent).join('/'))) throw new Error(`gh ${args.join(' ')} failed: gh: Branch not found (HTTP 404)`);
        return JSON.stringify({ name: m[1] });
      }
      if (rest === 'issues?state=open&per_page=100' && method === 'GET') {
        // The REST list reads the database, not the search index: a new Issue is there at once. It also lists pull requests, newest first.
        need(args.includes('--paginate') && args.includes('--slurp'), args);
        const rows = [...issues.values()].filter((i) => i.state === 'OPEN').map((i) => ({ number: i.number, title: i.title, body: i.body || null, node_id: `I_${i.number}` }));
        const prs = [...reviews.values()].filter((r) => r.open && !issues.has(r.number)).map((r) => ({ number: r.number, title: `PR ${r.number}`, body: null, pull_request: { url: 'x' } }));
        return JSON.stringify([[...rows, ...prs].sort((x, y) => y.number - x.number)]);
      }
      if (rest === 'milestones?state=all&per_page=100' && method === 'GET') {
        need(args.includes('--paginate') && args.includes('--slurp'), args);
        return JSON.stringify([[...milestones.values()].map((x) => ({ number: x.number, title: x.title, description: x.description || null, state: x.state.toLowerCase() }))]);
      }
      if (rest === 'milestones' && method === 'POST') {
        need(values(args, '--input')[0] === '-', args);
        const b = JSON.parse(opts.input);
        need(typeof b.title === 'string' && Object.keys(b).every((k) => k === 'title' || k === 'description'), args);
        if (milestones.has(b.title)) throw new Error(`gh ${args.join(' ')} failed: Validation Failed: already_exists (HTTP 422)`);
        const number = milestones.size + 1;
        milestones.set(b.title, { number, title: b.title, description: b.description ?? '', state: 'OPEN', closedAt: null, updatedAt: '2026-11-07T00:00:00Z' });
        return JSON.stringify({ number, title: b.title });
      }
      if ((m = /^milestones\/(\d+)$/.exec(rest)) && method === 'PATCH') {
        need(values(args, '--input')[0] === '-', args);
        const ms = [...milestones.values()].find((x) => x.number === Number(m[1]));
        need(ms, args);
        const b = JSON.parse(opts.input);
        need(Object.keys(b).length > 0 && Object.keys(b).every((k) => k === 'description'), args);
        ms.description = b.description;
        return JSON.stringify({ number: ms.number, title: ms.title });
      }
      if (rest === 'issues' && method === 'POST') {
        need(values(args, '--input')[0] === '-', args);
        const b = JSON.parse(opts.input);
        need(typeof b.title === 'string' && typeof b.body === 'string', args);
        const n = nextIssue++;
        issues.set(n, { number: n, title: b.title, body: b.body, assignees: [], labels: [], state: 'OPEN', closes: [], reviews: [], milestone: null, fresh: true });
        return JSON.stringify({ number: n, node_id: `I_${n}`, html_url: `https://github.test/${project}/issues/${n}` });
      }
      if ((m = /^issues\/(\d+)$/.exec(rest)) && method === 'PATCH') {
        need(values(args, '--input')[0] === '-', args);
        const it = issueOf(m[1], args);
        const b = JSON.parse(opts.input);
        for (const k of Object.keys(b)) need(k === 'body' || k === 'title' || k === 'milestone' || k === 'state' || k === 'state_reason', args);
        if (b.state !== undefined) {
          need(b.state === 'closed' && (b.state_reason === undefined || b.state_reason === 'not_planned' || b.state_reason === 'completed'), args);
          it.state = 'CLOSED';
          it.closes.push({ pr: null });
          it.closeReason = b.state_reason ?? 'completed';
        }
        if ('milestone' in b) {
          // The REST way: the milestone number, any state; null takes the Issue out.
          const ms = b.milestone === null ? null : [...milestones.values()].find((x) => x.number === b.milestone);
          need(b.milestone === null || ms, args);
          it.milestone = ms ? ms.title : null;
        }
        const { milestone: _ignored, state: _s, state_reason: _r, ...fields } = b;
        Object.assign(it, fields);
        return JSON.stringify({ number: it.number });
      }
      if ((m = /^issues\/(\d+)\/comments$/.exec(rest))) {
        if (method === 'GET') {
          need(args.includes('--paginate') && args.includes('--slurp'), args);
          return JSON.stringify([[...comments.values()].filter((c) => c.issue === Number(m[1])).map(commentJson)]);
        }
        need(method === 'POST' && values(args, '--input')[0] === '-', args);
        const c = { id: nextId++, issue: Number(m[1]), body: JSON.parse(opts.input).body, created_at: '2026-11-05T12:00:00Z', html_url: `https://github.test/${project}/issues/${m[1]}#c`, user: { login: 'SrProfessional' }, reactions: { eyes: 0 } };
        comments.set(c.id, c);
        return JSON.stringify(commentJson(c));
      }
      if ((m = /^pulls\/(\d+)\/commits$/.exec(rest))) {
        need(method === 'GET' && args.includes('--paginate') && args.includes('--slurp'), args);
        const r = reviews.get(Number(m[1]));
        need(r, args);
        return JSON.stringify([r.commits.map((date) => ({ sha: 'abc', commit: { committer: { date }, author: { date: '2000-01-01T00:00:00Z' } } }))]);
      }
      if ((m = /^issues\/comments\/(\d+)$/.exec(rest))) {
        need(method === 'PATCH' && values(args, '--input')[0] === '-' && comments.has(Number(m[1])), args);
        const c = comments.get(Number(m[1]));
        c.body = JSON.parse(opts.input).body;
        return JSON.stringify(commentJson(c));
      }
      if ((m = /^issues\/comments\/(\d+)\/reactions$/.exec(rest))) {
        need(method === 'POST' && args.includes('content=eyes') && comments.has(Number(m[1])), args);
        comments.get(Number(m[1])).reactions.eyes += 1;
        return JSON.stringify({ content: 'eyes' });
      }
    }
    return need(false, args);
  }

  // The neutral side the contract suite uses. Another platform's fake offers the same methods over its own wire format.
  const world = {
    // `closes` overrides the close history (oldest first, each { pr: number|null, merged }), for what the neutral states cannot say.
    issue({ number, title = '', body = '', assignees = [], labels = [], state = 'open', reviews: closing = [], closes, milestone = null }) {
      const defaults = { open: ['OPEN', []], merged: ['CLOSED', [{ pr: 70, merged: true }]], 'closed-by-hand': ['CLOSED', [{ pr: null }]] }[state];
      issues.set(number, { number, title, body, assignees: [...assignees], labels: [...labels], state: defaults[0], closes: closes ?? defaults[1], reviews: [...closing], milestone });
    },
    // base: the branch the PR targets; body: its text; merged: it was merged (so it is not open).
    review({ number, draft = false, open = true, branch = '', commits = [], head = `head${number}`, base = 'main', body = '', merged = false, mergedAt = '2026-11-10T00:00:00Z' }) {
      reviews.set(number, { number, draft, open: open && !merged, merged, branch, base, body, commits: [...commits], head, mergedAt });
    },
    /** A branch that exists on the remote (`main` always does). */
    branch(name) { branches.add(name); },
    comment(issue, { id, author, body, createdAt, taken = false }) {
      comments.set(id, { id, issue, body, created_at: createdAt, html_url: `https://github.test/${project}/issues/${issue}#c${id}`, user: { login: author }, reactions: { eyes: taken ? 1 : 0 } });
    },
    // closedAt: when a closed milestone was closed (ISO); GitHub also bumps its updatedAt, which is what the adapter pages by.
    milestone({ title, description = '', state = 'open', closedAt = null, updatedAt }) {
      milestones.set(title, { number: milestones.size + 1, title, description, state: state.toUpperCase(), closedAt, updatedAt: updatedAt ?? closedAt ?? '2026-11-01T00:00:00Z' });
    },
    /** A login that exists on GitHub but has no access to the repo. */
    user(login) { if (!users.has(login)) users.set(login, users.size + 1); },
    /** A collaborator. The level only matters on GitLab; any collaborator can be assigned on GitHub. */
    member(login) { this.user(login); collaborators.add(login); },
    created: () => [...issues.values()].filter((i) => i.number >= 900).map((i) => ({ number: i.number, title: i.title, body: i.body })),
    bodyOf: (n) => issues.get(n).body,
    pinned: () => [...pinned],
    /** A comment on PR `pr`. On GitHub a PR is also an Issue, so it is the same call as `comment`. */
    reviewComment(pr, c) { this.comment(pr, c); },
    labelsOf: (n) => [...issues.get(n).labels],
    milestoneOf: (n) => issues.get(n).milestone,
    milestoneTitles: () => [...milestones.keys()],
    milestoneDescription: (title) => milestones.get(title)?.description,
    assigneesOf: (n) => [...issues.get(n).assignees],
    repoLabels: () => Object.fromEntries(repoLabels),
    repoLabel(name) { repoLabels.set(name, { color: 'ededed', description: '' }); },
    commentBody: (id) => comments.get(id)?.body,
    isTaken: (id) => comments.get(id).reactions.eyes > 0,
    merged: () => [...merged],
    /** The PRs opened through `openReview`, in order. */
    opened: () => openedPrs.map((p) => ({ ...p })),
    commandCount: () => calls.length,
    calls: () => calls.map((c) => ({ ...c })),
    stateOf: (n) => issues.get(n).state.toLowerCase(),
    closedReason: (n) => issues.get(n).closeReason ?? null,
    milestoneState: (title) => milestones.get(title)?.state.toLowerCase(),
    /** The comments on Issue `n`, in order. */
    commentsOn: (n) => [...comments.values()].filter((c) => c.issue === n).map((c) => c.body),
    /** While on, an Issue created through the API is not in `gh issue list` (search lags behind); off, every Issue is. */
    searchLag(on = true) { searchLag = on; },
    /** Answer the next `times` calls for which `match(args)` is true with a failure (the text is what gh prints after «failed: »). */
    failWhen(match, message, times = 1) { failures.push({ match, message, times }); },
    /** Like GitHub's secondary rate limit: 403/429 with a Retry-After. */
    rateLimit(times, retryAfter) { failures.push({ match: () => true, message: `gh: You have exceeded a secondary rate limit (HTTP 429)${retryAfter === undefined ? '' : ` Retry-After: ${retryAfter}`}`, times }); },
  };
  return { run, world, project };
}
