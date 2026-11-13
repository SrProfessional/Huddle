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
// listClosedIssues()              -> [{ number, title, labels: [name], milestone }]   closed Issues (merged or by hand), for the label cleanup and the areas check-up
// reviewCommits(n)                -> [date]             commit dates (ISO) of PR/MR n, so a newer commit clears a request
// reviewHead(n)                   -> sha                head commit sha of PR/MR n, so a new push is told from an old commit (`huddle queue`); throws when there is none
// issueForBranch(branch)          -> number | null     the Issue that the open PR/MR of that branch resolves
// findUser(login)                 -> boolean            whether the user exists on the platform
// canAssign(login)                -> boolean            whether Huddle could assign an Issue to the user: a collaborator (GitHub), a member with at least the
//                                                       Developer role, own or inherited (GitLab). false for a stranger or a login that does not exist;
//                                                       a failure other than «not found» is thrown
// listMilestones({ since })       -> [Milestone]       open milestones and those closed since the ISO date `since`; Milestone is
//                                                       { title, description, state: 'open'|'closed', closedAt, issues: [{ number, open, merged }] }
//                                                       (docs/design.md §12; `merged` follows the same rule as issueState)
// findMilestone(title)            -> { title, description, state } | null   a milestone in any state, by title (case ignored); the areas commands reuse it, never duplicate
// createMilestone({ title, description }) -> void
// updateMilestone(title, { description }) -> void         throws when there is no such milestone
// setIssueMilestone(n, title|null) -> void | { reopened: true }  puts Issue n in the milestone, or takes it out with null; throws for an unknown milestone, and when
//                                                       the Issue still is not in it. On GitLab a closed milestone is reopened, assigned and closed again: { reopened: true }
// createIssue({ title, body })    -> { number, id, url }
// findIssuesByTitle(title)        -> [{ number, title, body }]   the open Issues called exactly that, oldest first, read from the database and never from search
//                                                       (GitHub's search lags behind a new Issue); pull requests are not Issues here
// closeIssue(n, { reason })       -> void               closes Issue n; reason 'not planned' where the platform has one (GitHub)
// updateIssue(n, { body, title }) -> void
// pinIssue(created)               -> boolean            pins what createIssue returned; false where the platform has no pinned Issues (GitLab)
// branchExists(name)              -> boolean            whether the remote has a branch called `name`; only «not found» is false, any other failure is thrown (docs/design.md §21)
//
// reviewInfo(n)                  -> { number, merged, base, body }   state, target branch and body of PR/MR n; a number that is not one throws with the `notFound` flag (Issue #99)
// mergedReviews(base, { limit })  -> [{ number, base, body, mergedAt }]   the merged PRs/MRs into `base`, newest merge first, at most `limit` (default 50)
//
// A staging branch (`staging_branch` in the config, '' = none; docs/design.md §21). GitHub and GitLab link a PR/MR to an Issue, and close the Issue, only when it
// targets the default branch. With one set, the adapter reads that link from the PR/MR body itself (lib/core/closes.mjs): `reviews`, reviewsClosing and
// issueForBranch include the open PRs/MRs into staging that close the Issue, and State.merged is also true for a closed Issue with a merged PR/MR into staging
// whose body closes it. With none set, the calls and the results are exactly what they were before.
//
// An open Issue also carries `milestone` (its title, or null).
//
// Optional: beginRun() / endRun() bracket one CLI run so the adapter can read the same data once (GitLab: closed_by per Issue). Outside a run nothing is kept.
// Every call through the CLI is retried on a 429 and a 5xx (lib/platform/retry.mjs); a rate limit that stays is an error with code RATE_LIMITED.
//
// A platform is one file, lib/platform/<platform>.mjs, exporting `create<Platform>(config, deps)`; this file only finds it.
// `config` is huddle.json (platform, host, project, staging_branch, default_branch); `deps.run` is the runner that talks to the CLI, which tests replace with a fake.

export const OPERATIONS = [
  'listOpenIssues', 'issueState', 'openReviews', 'reviewsClosing', 'comments', 'postComment', 'editComment',
  'markTaken', 'setLabels', 'ensureLabels', 'assign', 'merge', 'me',
  'listLabels', 'listClosedIssues', 'reviewCommits', 'reviewHead', 'issueForBranch', 'findUser', 'canAssign',
  'listMilestones', 'createIssue', 'updateIssue', 'pinIssue', 'findIssuesByTitle', 'closeIssue',
  'findMilestone', 'createMilestone', 'updateMilestone', 'setIssueMilestone', 'branchExists', 'reviewInfo', 'mergedReviews',
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
