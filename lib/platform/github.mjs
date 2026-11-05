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

    /** Merged = closed as completed, which GitHub sets when the PR that resolves it is merged. Closed «not planned», or open, is not. */
    async issueState(n) {
      const { state, stateReason } = await json(['issue', 'view', n, ...repo, '--json', 'state,stateReason']);
      return { open: state === 'OPEN', merged: state === 'CLOSED' && stateReason === 'COMPLETED' };
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

    async editComment(id, body) {
      await gh(api(`issues/comments/${id}`, '-X', 'PATCH', '--input', '-'), JSON.stringify({ body }));
    },

    async markTaken(id) {
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
  };
}
