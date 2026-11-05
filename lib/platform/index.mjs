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
// comments(n)                     -> [Comment]          human comments only, oldest first (a platform's system notes are dropped here)
// postComment(n, body)            -> { id, url }
// editComment(id, body)           -> void
// markTaken(id)                   -> void               puts the 👀 mark on a comment
// setLabels(n, add, remove)       -> void               no-op when both lists are empty
// ensureLabels([Label])           -> void               creates the labels, or updates them when they exist
// assign(n, login)                -> void
// merge(review)                   -> void               a merge commit, keeping the source branch
// me()                            -> login              who the token belongs to
//
// A platform is one file, lib/platform/<platform>.mjs, exporting `create<Platform>(config, deps)`; this file only finds it.
// `config` is huddle.json (platform, host, project); `deps.run` is the runner that talks to the CLI, which tests replace with a fake.

export const OPERATIONS = [
  'listOpenIssues', 'issueState', 'openReviews', 'reviewsClosing', 'comments', 'postComment', 'editComment',
  'markTaken', 'setLabels', 'ensureLabels', 'assign', 'merge', 'me',
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
