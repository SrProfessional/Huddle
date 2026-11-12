// Huddle: the GitHub adapter, on the `gh` CLI (docs/design.md §7). It speaks only to a runner, so tests inject canned `gh` output.
// A runner is `(args: string[], { input?, env? }) => stdout string` (sync or async). The default one starts the real `gh`.

import { execFile } from 'node:child_process';
import { withRetry } from './retry.mjs';

/** The real `gh`. Never used in tests: they pass their own runner. */
export function ghRunner(args, { input, env } = {}) {
  return new Promise((resolve, reject) => {
    const child = execFile('gh', args, { env: { ...process.env, ...env }, maxBuffer: 64 * 1024 * 1024, windowsHide: true }, (err, stdout, stderr) => {
      // The spawn error's code (ENOENT when `gh` is missing) rides on the error: the message alone cannot tell «not installed» apart.
      if (err) return reject(Object.assign(new Error(`gh ${args.join(' ')} failed: ${String(stderr || err.message).trim()}`), err.code === undefined ? {} : { code: err.code }));
      resolve(stdout);
    });
    child.stdin.end(input ?? '');
  });
}

/**
 * True when `gh` answered «Not Found» (HTTP 404). Only the text after «failed: » is read: the part before it is the command and its
 * arguments, which hold the login, so a login like `dev-404` must not turn an offline failure into a «no».
 */
const isNotFound = (e) => /HTTP 404|\bNot Found\b/i.test(String(e?.message).split(' failed: ').slice(1).join(' failed: '));

// The last close of an Issue and who did it. One definition for issueState and for the milestone query, so «merged» means the same in both.
const CLOSER = 'timelineItems(itemTypes: [CLOSED_EVENT], last: 1) { nodes { ... on ClosedEvent { closer { __typename ... on PullRequest { number merged } } } } }';
const ISSUES_PAGE = `pageInfo { hasNextPage endCursor } nodes { number state ${CLOSER} }`;

/** Merged = closed, and the last close was done by a merged PR (see issueState). */
const mergedBy = (state, nodes) => {
  const closer = nodes.at(-1)?.closer;
  return state === 'CLOSED' && closer?.__typename === 'PullRequest' && closer.merged === true;
};
const issueRef = (i) => ({ number: i.number, open: i.state === 'OPEN', merged: mergedBy(i.state, i.timelineItems.nodes) });

export function createGithub({ project, host } = {}, { run: rawRun = ghRunner, sleep } = {}) {
  if (!project) throw new Error('huddle.json: "project" is required (owner/repo)');
  const run = withRetry(rawRun, { sleep }); // a 429 or a 5xx is retried (lib/platform/retry.mjs)
  const env = host ? { GH_HOST: host } : {};
  const gh = async (args, input) => run(args.map(String), { env, ...(input === undefined ? {} : { input }) });
  const json = async (args, input) => JSON.parse(await gh(args, input));
  const repo = ['-R', project];
  const api = (path, ...rest) => ['api', ...rest, `repos/${project}/${path}`];
  const numbers = (refs) => (refs ?? []).map((r) => r.number);

  const sameTitle = (a, b) => String(a).trim().toLowerCase() === String(b).trim().toLowerCase();
  /** The REST row of a milestone in any state ({ number, title, description, state }), or undefined. */
  const milestoneRow = async (title) => (await json(api('milestones?state=all&per_page=100', '--paginate', '--slurp'))).flat().find((m) => sameTitle(m.title, title));

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
      const notAnIssue = (e) => Object.assign(e, { notFound: true });
      let data;
      try {
        ({ data } = await json(['api', 'graphql', '-f', `query=${query}`, '-F', `owner=${owner}`, '-F', `name=${name}`, '-F', `number=${n}`]));
      } catch (e) {
        // A number that is not an Issue (a PR, a typo, a deleted Issue) is told apart from a real failure; the caller decides what to do with it.
        throw /Could not resolve to an Issue/i.test(String(e?.message).split(' failed: ').slice(1).join(' failed: ')) ? notAnIssue(e) : e;
      }
      const issue = data?.repository?.issue;
      if (!issue) throw notAnIssue(new Error(`gh: Issue ${n} not found in ${project}`));
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
            if (states === 'CLOSED' && Date.parse(m.updatedAt) < limit) { more = false; break; } // closedAt <= updatedAt, so nothing after this one can be in the window
            // In the window is decided by when it was closed: a milestone closed long ago and edited yesterday is out.
            if (states === 'CLOSED' && Date.parse(m.closedAt ?? m.updatedAt) < limit) continue;
            found.push({ title: m.title, description: m.description ?? '', state: states === 'OPEN' ? 'open' : 'closed', closedAt: m.closedAt ?? (states === 'CLOSED' ? m.updatedAt : null), issues: await issuesOf(m) });
          }
          more = more && pageInfo.hasNextPage;
          after = pageInfo.endCursor;
        }
      }
      return found;
    },

    /** A milestone in any state, found by title (case and surrounding spaces ignored, so «content» never makes a second «Content»), or null. */
    async findMilestone(title) {
      const row = await milestoneRow(title);
      return row ? { title: row.title, description: row.description ?? '', state: row.state === 'open' ? 'open' : 'closed' } : null;
    },

    async createMilestone({ title, description = '' }) {
      await gh(api('milestones', '-X', 'POST', '--input', '-'), JSON.stringify({ title, description }));
    },

    /** Rewrites the description of the milestone called `title`; throws when there is none. */
    async updateMilestone(title, { description }) {
      const row = await milestoneRow(title);
      if (!row) throw new Error(`gh: no milestone «${title}» in ${project}`);
      await gh(api(`milestones/${row.number}`, '-X', 'PATCH', '--input', '-'), JSON.stringify({ description }));
    },

    /**
     * Puts Issue `n` in the milestone called `title`, or takes it out of its milestone when `title` is null. Goes through the REST number of the
     * milestone, not `gh issue edit --milestone <title>`: `gh` finds a title only among the open milestones, and an old area may be closed.
     */
    async setIssueMilestone(n, title) {
      let milestone = null;
      if (title !== null) {
        const row = await milestoneRow(title);
        if (!row) throw new Error(`gh: no milestone «${title}» in ${project}`);
        milestone = row.number;
      }
      await gh(api(`issues/${n}`, '-X', 'PATCH', '--input', '-'), JSON.stringify({ milestone }));
    },

    /** Creates an Issue. Returns { number, id, url }; `id` is the node id that pinIssue needs. */
    async createIssue({ title, body }) {
      const i = await json(api('issues', '-X', 'POST', '--input', '-'), JSON.stringify({ title, body }));
      return { number: i.number, id: i.node_id, url: i.html_url };
    },

    /**
     * The open Issues called exactly `title`, oldest first, as { number, title, body }. Read from the REST list, which is the database: `gh issue list` uses
     * search, and search indexes a new Issue late (the 0.3.0 smoke test made a second progress Issue 12 s after the first). REST also lists pull requests: dropped.
     */
    async findIssuesByTitle(title) {
      const pages = await json(api('issues?state=open&per_page=100', '--paginate', '--slurp'));
      return pages.flat().filter((i) => !i.pull_request && sameTitle(i.title, title))
        .map((i) => ({ number: i.number, title: i.title, body: i.body ?? '' })).sort((a, b) => a.number - b.number);
    },

    /** Closes Issue `n`; `reason: 'not planned'` closes it as «not planned», any other as completed. */
    async closeIssue(n, { reason } = {}) {
      await gh(api(`issues/${n}`, '-X', 'PATCH', '--input', '-'), JSON.stringify({ state: 'closed', state_reason: reason === 'not planned' ? 'not_planned' : 'completed' }));
    },

    async updateIssue(n, { body, title }) {
      await gh(api(`issues/${n}`, '-X', 'PATCH', '--input', '-'), JSON.stringify({ ...(body === undefined ? {} : { body }), ...(title === undefined ? {} : { title }) }));
    },

    /** Pins a created Issue to the top of the Issues tab. Returns true. (GitHub allows three pinned Issues: a failure is thrown for the caller to report.) */
    async pinIssue({ id }) {
      await gh(['api', 'graphql', '-f', 'query=mutation($id: ID!) { pinIssue(input: {issueId: $id}) { issue { number } } }', '-f', `id=${id}`]);
      return true;
    },

    /**
     * Whether Huddle could assign an Issue to `login`: a collaborator of the repo (204; 404 when not, also when the login does not exist).
     * Only a 404 is a «no»: any other failure (offline, no permission) is thrown, so it is never read as a verdict on the person.
     */
    async canAssign(login) {
      try {
        await gh(api(`collaborators/${encodeURIComponent(login)}`));
        return true;
      } catch (e) {
        if (isNotFound(e)) return false;
        throw e;
      }
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
      const items = await json(['issue', 'list', ...repo, '--state', 'closed', '--limit', '1000', '--json', 'number,title,labels,milestone']);
      return items.map((i) => ({ number: i.number, title: i.title ?? '', labels: i.labels.map((l) => l.name), milestone: i.milestone?.title ?? null }));
    },

    /** The commit dates of a PR (the committer date: a rebase counts as new work). */
    async reviewCommits(n) {
      const pages = await json(api(`pulls/${n}/commits`, '--paginate', '--slurp'));
      return pages.flat().map((c) => c.commit?.committer?.date ?? c.commit?.author?.date).filter(Boolean);
    },

    /** The head commit sha of PR `n`: a new push changes it. */
    async reviewHead(n) {
      const pr = await json(['pr', 'view', String(n), ...repo, '--json', 'headRefOid']);
      if (!pr?.headRefOid) throw new Error(`PR #${n} has no head commit`);
      return pr.headRefOid;
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
        if (isNotFound(e)) return false;
        throw e;
      }
    },
  };
}
