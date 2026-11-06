# Team guide

How a team works with Claude Code under Huddle. The rules live in the Huddle block of your `CLAUDE.md`; this guide
explains them. New here? Read [the first day](first-day.md) first, and [the roles](roles.md) for who does what.

## The idea

> Our job is no longer typing code. It is making good decisions. The AI writes, tests and asks; the person decides.

One task is one Issue, one branch and one pull request (merge request on GitLab). Each Issue carries the exact prompt to
paste into Claude Code, so every session starts with the same goal, limits and tests.

## The seven labels

The status of an Issue lives in its labels. Nobody sets them by hand: the labels job (`huddle labels`) does, from each
Issue's «Depends on» section and from the comments.

| Label | Meaning |
|---|---|
| `ready` | Everything it depends on is merged. Waiting for someone. |
| `assigned` | A developer has it. Not started. |
| `in progress` | A session is working on it. |
| `in review` | A PR/MR is open and waits for the AI Manager. |
| `blocked` | It depends on an Issue that is not merged yet. |
| `needs decision` | The session asked the AI Manager and waits. |
| `changes requested from AI Manager` | The AI Manager asked for changes and nobody has taken the request yet. |

The names can be changed under `labels` in `huddle.json`.

## Dependencies

An Issue lists what it needs under «Depends on», one `- #N` per line. A dependency counts as merged only when the Issue is
closed **and** a merged PR/MR closed it. An Issue closed by hand unblocks nothing.

## How a task goes

1. The AI Manager writes the Issue (`/huddle-issue`).
2. The labels job assigns it when it is ready.
3. The developer runs `/huddle-start <n>`. The session works test first, touching only the allowed files.
4. It opens the PR/MR with `Closes #N`, the real test counts and «What was NOT done», and ends with «✅ Issue #N finished».
5. CI runs the tests. The AI Manager reviews (`/huddle-review`): either requests changes or merges.
6. A request comes as a comment with a `## Prompt for Claude Code` heading. The session picks it up (`huddle take <n>`),
   pushes the fix and comments «Ready for review again» with the counts.

## When the session cannot go on

It does not guess. It commits and pushes what is done, comments on the Issue starting with «❓ Decision for the AI
Manager:» (what is blocked, the options with trade-offs, its recommendation), adds `needs decision` and stops with «⛔
Issue #N stopped: waiting for a decision». The AI Manager answers with `/huddle-decide`, on the Issue and on the PR/MR,
and the session continues on the same branch. The session never closes the Issue.

## Not negotiable

- **Never push to the default branch.** Only the AI Manager merges.
- **Only the allowed files.** If another one is needed, ask first.
- **Test first.** See the failing test, then write the code. Report the commands with their real counts.
- **No production, no secrets.** If a permission or key is missing, stop and tell. Do not look for another way.
- **Nothing is dropped silently.** Done, or listed under «What was NOT done» with the reason.
- **Chat in your language; the repo is in English.** Code, comments, commits, PRs, Issues and docs.

## Why one or two sessions

Many sessions at once slow the machine (each runs tests and builds), split your attention until your answers get rushed,
and fill the AI Manager's queue with half-reviewed PRs. More speed comes from more developers, not more windows.

## Every day

| I want to | Run |
|---|---|
| Know if something is waiting for me | `huddle pending` |
| Check my setup | `huddle doctor` |
| See what the labels job would change | `huddle labels --dry-run` |
| Continue after a request | `/huddle-start`, or answer yes to the hook |

## Updating Huddle

Refresh the marketplace listing with `/plugin marketplace update huddle`, then update the plugin from the Installed tab
of `/plugin` (or run `claude plugin update huddle@huddle`). The VS Code extension has no `/plugin`: in a terminal run
`claude plugin marketplace update huddle` and `claude plugin update huddle@huddle`. Either way, open a new session after
the update. If you work from a clone with `--plugin-dir`, pull it
instead. Then run `/huddle-setup` again, on a branch. It replaces only what is between
`<!-- huddle:start v1 -->` and `<!-- huddle:end -->` in `CLAUDE.md`, so your own rules stay. Edited templates are kept.
