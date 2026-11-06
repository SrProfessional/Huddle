# Smoke test (before each release)

Huddle's tests never touch a real GitHub or GitLab. This checklist is the one place where they are touched. The AI
Manager runs it by hand, once on a sandbox repo on **github.com** and once on a sandbox project on **gitlab.com**, before
every release. Tick a box only when you saw the result with your own eyes; write what you saw in [Results](#results).

Use a throwaway sandbox. Never run this on a team repo. Never paste a token into a chat, a file, an Issue or a commit.

Two sessions are needed: the **AI Manager** session (you) and a **developer** session (a second clone, or a second
person). `huddle` below means `node <plugin folder>/bin/huddle`, where the plugin folder is where Claude Code installed
the plugin (see `/plugin`), not a clone of the Huddle repo.

## 1. Setup

| | GitHub | GitLab |
|---|---|---|
| Sandbox | empty repo `<you>/huddle-sandbox` on github.com | empty project `<you>/huddle-sandbox` on gitlab.com |
| Login | `gh auth login` | `glab auth login` |

1. [ ] **Install the plugin from the marketplace**, in the AI Manager session. In the CLI: `/plugin marketplace add SrProfessional/Huddle`,
   then `/plugin install huddle@huddle`. The VS Code extension has no `/plugin`: in a terminal run
   `claude plugin marketplace add SrProfessional/Huddle` and `claude plugin install huddle@huddle`, then open a new session.
   `claude plugin list` (or `/plugin`) shows `huddle` enabled at the version under test (0.1.0), and `/huddle-setup` is available.
2. [ ] Create the sandbox and push a first commit to its default branch (a README is enough).
3. [ ] Run `/huddle-setup` in the sandbox. It writes `huddle.json` (`platform`, `project`, `ai_manager` = your login,
   `assignees` = the developer login), the CLAUDE.md block, the Issue and PR/MR templates, the labels job, and
   `.claude/settings.json` with `extraKnownMarketplaces.huddle` and `enabledPlugins["huddle@huddle"]`. Open
   `.claude/settings.json` and check both keys are there: setup wrote it, not you by hand.
4. [ ] Merge the setup to the default branch. **The settings snippet that setup wrote offers the plugin to the developer
   session:** open a fresh clone of the sandbox in a developer session **without** Huddle installed (a clean user profile,
   or after `claude plugin uninstall huddle@huddle`) and trust the folder. Do it twice, in the CLI and in the VS Code
   extension. Each must offer the `huddle` marketplace and the plugin; accept; `claude plugin list` then shows
   `huddle@huddle` enabled and `/huddle-start` is available. Note in Results whether each one offered the plugin.
5. [ ] **GitLab only:** do the schedule and `HUDDLE_TOKEN` steps of [gitlab.md](gitlab.md) (Maintainer token, scope `api`,
   masked and protected variable; schedule `*/10 * * * *` on the default branch). Do the token step yourself.
6. [ ] `huddle doctor`: ✔ on `huddle.json`, `login` and `ai_manager`. `labels` fails on a new repo, as the labels do not
   exist yet.
7. [ ] Run `huddle labels` once on the new repo: it prints «7 labels created.».
8. [ ] `huddle doctor` again: all ✔. The labels exist on the platform: `ready`, `assigned`, `in progress`, `in review`,
   `blocked`, `needs decision`, `changes requested from AI Manager`.
9. [ ] Run `huddle labels --dry-run`: it exits 0, prints no error and creates nothing.

## 2. An Issue with a dependency

1. [ ] Create Issue **A** from the template, with `## Depends on` set to `—` (none).
2. [ ] Create Issue **B** from the template, with `## Depends on` listing `#<A>`.
3. [ ] Run `huddle labels` (GitLab: **Play** the schedule, or wait up to 10 minutes).
4. [ ] A is `ready`, or `assigned` with the developer's login. B is `blocked`.

## 3. Start

1. [ ] In the developer session, run `/huddle-start <B>`: it must end with «⛔ Issue #B stopped: waiting for #A» and change
   nothing.
2. [ ] Run `/huddle-start <A>`. It creates a branch in its own worktree and adds `in progress` to A.
3. [ ] The session opens the PR/MR (see section 4) and starts `huddle wait <A>` in the background.

## 4. Pull request / merge request

1. [ ] The PR/MR is into the default branch, uses the template, and its description contains `Closes #<A>` (GitLab: the
   MR must target the default branch).
2. [ ] After `huddle labels`, A is `in review` and no longer `in progress`.
3. [ ] `huddle pending` prints nothing yet (no request).

## 5. A review request taken by a waiting session

1. [ ] As the AI Manager, comment on the PR/MR with a `## Prompt for Claude Code` heading and a text block asking for a
   small change (for example, one more line in the README).
2. [ ] The waiting `huddle wait <A>` ends and says a request is pending.
3. [ ] `huddle take <A>` marks the comment 👀 (reaction `eyes` on GitHub, award emoji `eyes` on GitLab) and prints the prompt.
4. [ ] The developer session pushes the change and comments «Ready for review again» with the counts.
5. [ ] A comment by anyone other than the AI Manager with the same heading is **not** treated as a request. This needs a
   second account; if there is none, write «not testable» in Results.
6. [ ] The `changes requested from AI Manager` label shows while the request is pending, and goes away after the push.
   GitLab: it can lag up to 10 minutes after a comment; a push updates it at once.

## 6. The hook on reopen

1. [ ] As the AI Manager, post a second `## Prompt for Claude Code` request on the PR/MR. Close the developer session
   without taking it.
2. [ ] Open a new developer session in the sandbox with the installed plugin (no `--plugin-dir`): `claude`, in the sandbox clone.
3. [ ] When the session opens, **before typing anything**, the developer sees the visible line «Huddle: the AI Manager left
   1 request…» (within the 45 s timeout), and `huddle pending` lists it. After the first message, Claude asks whether to
   continue.
4. [ ] Offline (network off), a new session still opens quickly and the hook stays silent.
5. [ ] The developer takes the request (`huddle take <A>`), pushes, and comments «Ready for review again».

## 7. Merge

1. [ ] Approve (GitLab: with a comment, as self-approval may be off), then merge as the AI Manager. The developer session
   never merges.
2. [ ] The merge is a merge commit, and on GitLab the source branch is **not** removed.
3. [ ] Issue A closes. On GitHub it shows `CLOSED` with `COMPLETED`.

## 8. The dependency unblocks

1. [ ] Run `huddle labels` (GitLab: Play the schedule).
2. [ ] B is no longer `blocked`: it is `ready`, or `assigned` to the developer.
3. [ ] Control: create Issue **C** depending on a third Issue **D**, then close D **by hand** with the platform's normal
   «Close issue» (on GitHub, closed as completed), with no PR/MR. After `huddle labels`, C is still `blocked`, and
   `/huddle-start <C>` refuses.
4. [ ] `/huddle-start <B>` now starts.

## 9. Clean up

1. [ ] Close the extra Issues and remove the worktrees and branches the test created.
2. [ ] **GitLab only:** revoke the sandbox access token if you will not run the test again soon.

## Results

Fill in one row per step before the release PR is merged, with the date, the Huddle commit and anything unexpected.
Copy the table into the PR description.

Date: ________  Huddle commit: ________  AI Manager: ________

| Section | GitHub | GitLab | Notes |
|---|---|---|---|
| 1. Setup | | | |
| 2. Issue with a dependency | | | |
| 3. Start | | | |
| 4. PR / MR | | | |
| 5. Review request taken | | | |
| 6. Hook on reopen | | | |
| 7. Merge | | | |
| 8. Dependency unblocks | | | |
| 9. Clean up | | | |

Write ✔ or ✘ in each cell. Any ✘ blocks the release: open an Issue for it, fix it, and run the whole checklist again on
the platform that failed.

## Releasing v0.1.0

Only when every cell is ✔:

1. [ ] The AI Manager merges the release PR (versions and `CHANGELOG.md` already at 0.1.0).
2. [ ] On an up-to-date default branch: `git tag -a v0.1.0 -m "Huddle v0.1.0"` and `git push origin v0.1.0`.
3. [ ] Create the GitHub release from the tag, with the 0.1.0 section of `CHANGELOG.md` as notes.
