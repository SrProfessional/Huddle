// A fake `gh`: an in-memory GitHub that answers the exact commands lib/platform/github.mjs sends, with GitHub-shaped JSON.
// The contract suite drives it through the neutral `world` methods below; nothing here starts a process or touches the network.
// A command the fake does not know throws, so an adapter cannot slip in a call the tests never saw.

const PROJECT = 'acme/app';

export function fakeGithub({ project = PROJECT } = {}) {
  const issues = new Map(); // number -> { number, title, body, assignees[], labels[], state, stateReason, reviews[] }
  const reviews = new Map(); // number -> { number, draft, open }
  const comments = new Map(); // id -> { ...GitHub comment, issue }
  const repoLabels = new Map(); // name -> { color, description }
  const users = new Map([['SrProfessional', 1], ['ana', 2], ['luis', 3]]); // login -> id
  const calls = [];
  const merged = [];
  let nextId = 9000;

  const values = (args, flag) => args.flatMap((a, i) => (a === flag ? [args[i + 1]] : []));
  const need = (cond, args) => { if (!cond) throw new Error(`fake gh: unexpected command: gh ${args.join(' ')}`); };
  const issueOf = (n, args) => { const it = issues.get(Number(n)); if (!it) throw new Error(`fake gh: no Issue ${n} (gh ${args.join(' ')})`); return it; };
  const commentJson = (c) => ({ id: c.id, body: c.body, created_at: c.created_at, html_url: c.html_url, user: c.user, reactions: c.reactions });

  function run(args, opts = {}) {
    args = args.map(String);
    calls.push({ args, input: opts.input });
    const [a, b] = args;
    // Every repo-scoped command must name the project, so a wrong or missing -R is caught.
    if (a !== 'api') need(values(args, '-R')[0] === project, args);

    if (a === 'issue' && b === 'list' && values(args, '--state')[0] === 'closed') {
      need(values(args, '--json')[0] === 'number,labels', args);
      return JSON.stringify([...issues.values()].filter((i) => i.state === 'CLOSED').map((i) => ({ number: i.number, labels: i.labels.map((name) => ({ name })) })));
    }
    if (a === 'label' && b === 'list') {
      need(values(args, '--json')[0] === 'name', args);
      return JSON.stringify([...repoLabels.keys()].map((name) => ({ name })));
    }
    if (a === 'issue' && b === 'list') {
      need(args.includes('--json') && values(args, '--state')[0] === 'open', args);
      return JSON.stringify([...issues.values()].filter((i) => i.state === 'OPEN').map((i) => ({
        number: i.number, title: i.title, body: i.body,
        assignees: i.assignees.map((login) => ({ login })), labels: i.labels.map((name) => ({ name })),
        closedByPullRequestsReferences: i.reviews.map((number) => ({ number })),
      })));
    }
    if (a === 'issue' && b === 'view') {
      const it = issueOf(args[2], args);
      const fields = values(args, '--json')[0];
      if (fields === 'state,stateReason') return JSON.stringify({ state: it.state, stateReason: it.stateReason });
      if (fields === 'closedByPullRequestsReferences') return JSON.stringify({ closedByPullRequestsReferences: it.reviews.map((number) => ({ number })) });
      need(false, args);
    }
    if (a === 'pr' && b === 'list' && args.includes('--head')) {
      need(values(args, '--state')[0] === 'open' && values(args, '--json')[0] === 'number,closingIssuesReferences', args);
      const head = values(args, '--head')[0];
      return JSON.stringify([...reviews.values()].filter((r) => r.open && r.branch === head).map((r) => ({
        number: r.number, closingIssuesReferences: [...issues.values()].filter((i) => i.reviews.includes(r.number)).map((i) => ({ number: i.number })),
      })));
    }
    if (a === 'pr' && b === 'list') {
      need(args.includes('--json') && values(args, '--state')[0] === 'open', args);
      return JSON.stringify([...reviews.values()].filter((r) => r.open).map((r) => ({ number: r.number, isDraft: r.draft })));
    }
    if (a === 'pr' && b === 'merge') {
      need(args.includes('--merge') && !args.includes('--delete-branch'), args);
      const r = reviews.get(Number(args[2]));
      need(r && r.open && !r.draft, args);
      r.open = false;
      merged.push(r.number);
      return '';
    }
    if (a === 'issue' && b === 'edit') {
      const it = issueOf(args[2], args);
      for (const l of values(args, '--add-label')) if (!it.labels.includes(l)) it.labels.push(l);
      for (const l of values(args, '--remove-label')) it.labels = it.labels.filter((x) => x !== l);
      for (const u of values(args, '--add-assignee')) if (!it.assignees.includes(u)) it.assignees.push(u);
      need(args.length > 4, args);
      return '';
    }
    if (a === 'label' && b === 'create') {
      need(args.includes('--force') && values(args, '--color').length === 1, args);
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
    issue({ number, title = '', body = '', assignees = [], labels = [], state = 'open', reviews: closing = [] }) {
      const [s, reason] = { open: ['OPEN', ''], merged: ['CLOSED', 'COMPLETED'], 'closed-by-hand': ['CLOSED', 'NOT_PLANNED'] }[state];
      issues.set(number, { number, title, body, assignees: [...assignees], labels: [...labels], state: s, stateReason: reason, reviews: [...closing] });
    },
    review({ number, draft = false, open = true, branch = '', commits = [] }) { reviews.set(number, { number, draft, open, branch, commits: [...commits] }); },
    comment(issue, { id, author, body, createdAt, taken = false }) {
      comments.set(id, { id, issue, body, created_at: createdAt, html_url: `https://github.test/${project}/issues/${issue}#c${id}`, user: { login: author }, reactions: { eyes: taken ? 1 : 0 } });
    },
    labelsOf: (n) => [...issues.get(n).labels],
    assigneesOf: (n) => [...issues.get(n).assignees],
    repoLabels: () => Object.fromEntries(repoLabels),
    commentBody: (id) => comments.get(id)?.body,
    isTaken: (id) => comments.get(id).reactions.eyes > 0,
    merged: () => [...merged],
    commandCount: () => calls.length,
  };
  return { run, world, project };
}
