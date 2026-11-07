// Huddle: the platform adapter (docs/design.md §7). All network access goes through one interface; the core never calls `gh` or `glab`.
// An adapter is an object with the async operations below. Every one returns neutral shapes, so nothing platform-specific reaches the core:
//
//   Issue    { number, title, body, assignees: [login], labels: [name], reviews: [number] }   `reviews`: the PRs/MRs that would close it
//   State    { open, merged }       merged: closed *because* a PR/MR was merged; an Issue closed by hand is { open: false, merged: false }
//   Comment  { id, author, body, createdAt, url, taken }                                       `taken`: it carries the 👀 mark
//   Label    { name, color, description }
//
// listOpenIssues()                -> [Issue]            open Issues, with body, assignees, labels and the reviews that would close them
// issueState(n)                   -> State
// openReviews()                   -> [number]           open PRs/MRs that are not drafts
// reviewsClosing(n)               -> [number]           PRs/MRs that would close Issue n
// comments(n, { review })         -> [Comment]          human comments only, oldest first (a platform's system notes are dropped here); review: n is a PR/MR number (GitLab numbers them apart from Issues; GitHub ignores it)
// postComment(n, body, { review }) -> { id, url }
// editComment(n, id, body, { review }) -> void        n: the Issue or PR/MR the comment is on, review: true when it is a PR/MR (GitLab needs both, GitHub ignores them)
// markTaken(n, id, { review })    -> void               puts the 👀 mark on a comment; n and review as above
// setLabels(n, add, remove)       -> void               no-op when both lists are empty
// ensureLabels([Label])           -> void               creates the labels, or updates them when they exist
// assign(n, login)                -> void
// merge(review)                   -> void               a merge commit, keeping the source branch
// me()                            -> login              who the token belongs to
// listLabels()                    -> [name]             the labels the project has
// listClosedIssues()              -> [{ number, labels: [name] }]   closed Issues (merged or by hand), for the label cleanup
// reviewCommits(n)                -> [date]             commit dates (ISO) of PR/MR n, so a newer commit clears a request
// issueForBranch(branch)          -> number | null      the Issue that the open PR/MR of that branch resolves
// findUser(login)                 -> boolean            whether the user exists on the platform
// listMilestones({ since })       -> [Milestone]        open milestones and those closed since the ISO date `since`; Milestone is
//                                                       { title, description, state: 'open'|'closed', closedAt, issues: [{ number, open, merged }] }
//                                                       (docs/design.md §12; `merged` follows the same rule as issueState)
// createIssue({ title, body })    -> { number, id, url }
// updateIssue(n, { body, title }) -> void
// pinIssue(created)               -> boolean            pins what createIssue returned; false where the platform has no pinned Issues (GitLab)
//
// An open Issue also carries `milestone` (its title, or null).
//
// A platform is one file, lib/platform/<platform>.mjs, exporting `create<Platform>(config, deps)`; this file only finds it.
// `config` is huddle.json (platform, host, project); `deps.run` is the runner that talks to the CLI, which tests replace with a fake.

export const OPERATIONS = [
  'listOpenIssues', 'issueState', 'openReviews', 'reviewsClosing', 'comments', 'postComment', 'editComment',
  'markTaken', 'setLabels', 'ensureLabels', 'assign', 'merge', 'me',
  'listLabels', 'listClosedIssues', 'reviewCommits', 'issueForBranch', 'findUser',
  'listMilestones', 'createIssue', 'updateIssue', 'pinIssue',
];

const PLATFORMS = ['github', 'gitlab'];

/** The adapter for `config.platform`. Async because adapters load on demand: one that is not installed yet is a clear error, not a crash. */
export async function createPlatform(config = {}, deps = {}) {
  const { platform } = config;
  if (!PLATFORMS.includes(platform)) {
    throw new Error(`huddle.json: "platform" must be one of ${PLATFORMS.join(', ')} (got ${platform === undefined ? 'nothing' : `"${platform}"`})`);
  }
  let mod;
  try {
    mod = await import(`./${platform}.mjs`);
  } catch (e) {
    if (e?.code === 'ERR_MODULE_NOT_FOUND' && String(e.message).includes(`${platform}.mjs`)) throw new Error(`The ${platform} adapter is not installed yet`);
    throw e;
  }
  const create = mod[`create${platform[0].toUpperCase()}${platform.slice(1)}`];
  const adapter = create(config, deps);
  const missing = OPERATIONS.filter((op) => typeof adapter[op] !== 'function');
  if (missing.length) throw new Error(`The ${platform} adapter lacks: ${missing.join(', ')}`);
  return adapter;
}
