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
      const items = await json(['issue', 'list', ...repo, '--state', 'open', '--limit', '1000', '--json', 'number,title,body,assignees,labels,closedByPullRequestsReferences']);
      return items.map((i) => ({
        number: i.number, title: i.title, body: i.body ?? '',
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
      const query = 'query($owner: String!, $name: String!, $number: Int!) { repository(owner: $owner, name: $name) { issue(number: $number) { state timelineItems(itemTypes: [CLOSED_EVENT], last: 1) { nodes { ... on ClosedEvent { closer { __typename ... on PullRequest { number merged } } } } } } } }';
      const { data } = await json(['api', 'graphql', '-f', `query=${query}`, '-F', `owner=${owner}`, '-F', `name=${name}`, '-F', `number=${n}`]);
      const issue = data?.repository?.issue;
      if (!issue) throw new Error(`gh: Issue ${n} not found in ${project}`);
      const closer = issue.timelineItems.nodes.at(-1)?.closer;
      return { open: issue.state === 'OPEN', merged: issue.state === 'CLOSED' && closer?.__typename === 'PullRequest' && closer.merged === true };
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
