// Huddle: the GitHub adapter, on the `gh` CLI (docs/design.md §7). It speaks only to a runner, so tests inject canned `gh` output.
// A runner is `(args: string[], { input?, env? }) => stdout string` (sync or async). The default one starts the real `gh`.

import { execFile } from 'node:child_process';

/** The real `gh`. Never used in tests: they pass their own runner. */
export function ghRunner(args, { input, env } = {}) {
  return new Promise((resolve, reject) => {
    const child = execFile('gh', args, { env: { ...process.env, ...env }, maxBuffer: 64 * 1024 * 1024, windowsHide: true }, (err, stdout, stderr) => {
      if (err) return reject(new Error(`gh ${args.join(' ')} failed: ${String(stderr || err.message).trim()}`));
      resolve(stdout);
    });
    child.stdin.end(input ?? '');
  });
}

// The last close of an Issue and who did it. One definition for issueState and for the milestone query, so «merged» means the same in both.
const CLOSER = 'timelineItems(itemTypes: [CLOSED_EVENT], last: 1) { nodes { ... on ClosedEvent { closer { __typename ... on PullRequest { number merged } } } } }';
const ISSUES_PAGE = `pageInfo { hasNextPage endCursor } nodes { number state ${CLOSER} }`;

/** Merged = closed, and the last close was done by a merged PR (see issueState). */
const mergedBy = (state, nodes) => {
  const closer = nodes.at(-1)?.closer;
  return state === 'CLOSED' && closer?.__typename === 'PullRequest' && closer.merged === true;
};
const issueRef = (i) => ({ number: i.number, open: i.state === 'OPEN', merged: mergedBy(i.state, i.timelineItems.nodes) });

export function createGithub({ project, host } = {}, { run = ghRunner } = {}) {
  if (!project) throw new Error('huddle.json: "project" is required (owner/repo)');
  const env = host ? { GH_HOST: host } : {};
  const gh = async (args, input) => run(args.map(String), { env, ...(input === undefined ? {} : { input }) });
  const json = async (args, input) => JSON.parse(await gh(args, input));
  const repo = ['-R', project];
  const api = (path, ...rest) => ['api', ...rest, `repos/${project}/${path}`];
  const numbers = (refs) => (refs ?? []).map((r) => r.number);

  const comment = (c) => ({ id: c.id, author: c.user?.login ?? '', body: c.body ?? '', createdAt: c.created_at, url: c.html_url, taken: (c.reactions?.eyes ?? 0) > 0 });

  return {
    async listOpenIssues() {
      const items = await json(['issue', 'list', ...repo, '--state', 'open', '--limit', '1000', '--json', 'number,title,body,assignees,labels,closedByPullRequestsReferences,milestone']);
      return items.map((i) => ({
        number: i.number, title: i.title, body: i.body ?? '', milestone: i.milestone?.title ?? null,
        assignees: i.assignees.map((a) => a.login), labels: i.labels.map((l) => l.name), reviews: numbers(i.closedByPullRequestsReferences),
      }));
    },

    /**
     * Merged = closed, and the last close was done by a merged PR. «Close issue» by hand also gives stateReason COMPLETED, so the reason
     * cannot tell the two apart: the CLOSED_EVENT can (its `closer` is the PR). Only the last close counts, so a reopen then a hand close is not merged.
     * GraphQL is used because it names the closer in one call; the REST timeline has no closer, only a commit id.
     */
    async issueState(n) {
      const [owner, name] = project.split('/');
      const query = `query($owner: String!, $name: String!, $number: Int!) { repository(owner: $owner, name: $name) { issue(number: $number) { state ${CLOSER} } } }`;
      const { data } = await json(['api', 'graphql', '-f', `query=${query}`, '-F', `owner=${owner}`, '-F', `name=${name}`, '-F', `number=${n}`]);
      const issue = data?.repository?.issue;
      if (!issue) throw new Error(`gh: Issue ${n} not found in ${project}`);
      return { open: issue.state === 'OPEN', merged: mergedBy(issue.state, issue.timelineItems.nodes) };
    },

    /**
     * The areas of the project (docs/design.md §12): open milestones, and those closed since `since`, each with its Issues and their last close.
     * One GraphQL query per page of milestones (50, each with its first 100 Issues); a milestone with more Issues costs one more query per further page.
     * Closed milestones come newest-update first, and a milestone is closed before its last update, so paging stops at the first one older than `since`.
     */
    async listMilestones({ since } = {}) {
      const [owner, name] = project.split('/');
      const limit = since ? Date.parse(since) : -Infinity;
      const issuesOf = async (m) => {
        const items = m.issues.nodes.map(issueRef);
        for (let page = m.issues.pageInfo; page.hasNextPage; ) {
          const query = `query($id: ID!, $after: String) { node(id: $id) { ... on Milestone { issues(first: 100, after: $after) { ${ISSUES_PAGE} } } } }`;
          const { data } = await json(['api', 'graphql', '-f', `query=${query}`, '-f', `id=${m.id}`, '-f', `after=${page.endCursor}`]);
          items.push(...data.node.issues.nodes.map(issueRef));
          page = data.node.issues.pageInfo;
        }
        return items;
      };
      const found = [];
      for (const states of ['OPEN', 'CLOSED']) {
        const query = `query($owner: String!, $name: String!, $after: String) { repository(owner: $owner, name: $name) { milestones(first: 50, after: $after, states: [${states}], orderBy: {field: UPDATED_AT, direction: DESC}) { pageInfo { hasNextPage endCursor } nodes { id title description state closedAt updatedAt issues(first: 100) { ${ISSUES_PAGE} } } } } }`;
        let after = null;
        for (let more = true; more; ) {
          const { data } = await json(['api', 'graphql', '-f', `query=${query}`, '-F', `owner=${owner}`, '-F', `name=${name}`, ...(after ? ['-f', `after=${after}`] : [])]);
          const { nodes, pageInfo } = data.repository.milestones;
          for (const m of nodes) {
            if (states === 'CLOSED' && Date.parse(m.updatedAt) < limit) { more = false; break; }
            found.push({ title: m.title, description: m.description ?? '', state: states === 'OPEN' ? 'open' : 'closed', closedAt: m.closedAt ?? (states === 'CLOSED' ? m.updatedAt : null), issues: await issuesOf(m) });
          }
          more = more && pageInfo.hasNextPage;
          after = pageInfo.endCursor;
        }
      }
      return found;
    },

    /** Creates an Issue. Returns { number, id, url }; `id` is the node id that pinIssue needs. */
    async createIssue({ title, body }) {
      const i = await json(api('issues', '-X', 'POST', '--input', '-'), JSON.stringify({ title, body }));
      return { number: i.number, id: i.node_id, url: i.html_url };
    },

    async updateIssue(n, { body, title }) {
      await gh(api(`issues/${n}`, '-X', 'PATCH', '--input', '-'), JSON.stringify({ ...(body === undefined ? {} : { body }), ...(title === undefined ? {} : { title }) }));
    },

    /** Pins a created Issue to the top of the Issues tab. Returns true. (GitHub allows three pinned Issues: a failure is thrown for the caller to report.) */
    async pinIssue({ id }) {
      await gh(['api', 'graphql', '-f', 'query=mutation($id: ID!) { pinIssue(input: {issueId: $id}) { issue { number } } }', '-f', `id=${id}`]);
      return true;
    },

    async openReviews() {
      const prs = await json(['pr', 'list', ...repo, '--state', 'open', '--limit', '1000', '--json', 'number,isDraft']);
      return prs.filter((p) => !p.isDraft).map((p) => p.number);
    },

    async reviewsClosing(n) {
      const r = await json(['issue', 'view', n, ...repo, '--json', 'closedByPullRequestsReferences']);
      return numbers(r.closedByPullRequestsReferences);
    },

    /** `--slurp` wraps the pages in one array, so the result is one valid JSON document however many pages there are. */
    async comments(n) {
      const pages = await json(api(`issues/${n}/comments`, '--paginate', '--slurp'));
      return pages.flat().map(comment);
    },

    async postComment(n, body) {
      const c = await json(api(`issues/${n}/comments`, '-X', 'POST', '--input', '-'), JSON.stringify({ body }));
      return { id: c.id, url: c.html_url };
    },

    /** `n` is not needed here (a GitHub comment id is global); it is accepted so both platforms share one signature. */
    async editComment(n, id, body) {
      await gh(api(`issues/comments/${id}`, '-X', 'PATCH', '--input', '-'), JSON.stringify({ body }));
    },

    async markTaken(n, id) {
      await gh(api(`issues/comments/${id}/reactions`, '-X', 'POST', '-f', 'content=eyes'));
    },

    async setLabels(n, add = [], remove = []) {
      if (!add.length && !remove.length) return;
      await gh(['issue', 'edit', n, ...repo, ...add.flatMap((l) => ['--add-label', l]), ...remove.flatMap((l) => ['--remove-label', l])]);
    },

    async ensureLabels(labels) {
      for (const l of labels) await gh(['label', 'create', l.name, ...repo, '--color', l.color, '--description', l.description ?? '', '--force']);
    },

    async assign(n, login) {
      await gh(['issue', 'edit', n, ...repo, '--add-assignee', login]);
    },

    async merge(review) {
      await gh(['pr', 'merge', review, ...repo, '--merge']);
    },

    async me() {
      return (await json(['api', 'user'])).login;
    },

    async listLabels() {
      return (await json(['label', 'list', ...repo, '--limit', '1000', '--json', 'name'])).map((l) => l.name);
    },

    async listClosedIssues() {
      const items = await json(['issue', 'list', ...repo, '--state', 'closed', '--limit', '1000', '--json', 'number,labels']);
      return items.map((i) => ({ number: i.number, labels: i.labels.map((l) => l.name) }));
    },

    /** The commit dates of a PR (the committer date: a rebase counts as new work). */
    async reviewCommits(n) {
      const pages = await json(api(`pulls/${n}/commits`, '--paginate', '--slurp'));
      return pages.flat().map((c) => c.commit?.committer?.date ?? c.commit?.author?.date).filter(Boolean);
    },

    /** The Issue that the open PR of `branch` resolves, or null (no open PR, or it resolves nothing). */
    async issueForBranch(branch) {
      const prs = await json(['pr', 'list', ...repo, '--head', branch, '--state', 'open', '--json', 'number,closingIssuesReferences']);
      return prs.flatMap((p) => numbers(p.closingIssuesReferences))[0] ?? null;
    },

    /** Only a «Not Found» answer means the user does not exist; any other failure (offline, no access) is thrown, not turned into «no». */
    async findUser(login) {
      try {
        await gh(['api', `users/${encodeURIComponent(login)}`]);
        return true;
      } catch (e) {
        if (/HTTP 404|Not Found/i.test(String(e.message))) return false;
        throw e;
      }
    },
  };
}
