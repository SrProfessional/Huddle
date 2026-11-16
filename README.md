# Huddle: Decision-led development for teams coding with AI

[![Website](https://img.shields.io/badge/website-srprofessional.github.io%2FHuddle-4336d8)](https://srprofessional.github.io/Huddle/)

Huddle is a Claude Code plugin and a decision-led team workflow for AI coding. One person, the Coach, hands out
tasks as Issues. Each Player pastes the Issue's «Prompt for Claude Code» into a session. The session works on its own
branch, stops to ask when a decision is not its to make, opens a pull request (a merge request on GitLab) and waits for
the review on its own.

It works with GitHub and GitLab, including self-managed GitLab. **Website:** <https://srprofessional.github.io/Huddle/>.

> **Status:** the latest release is [0.9.2](https://github.com/SrProfessional/Huddle/releases/tag/v0.9.2); what came after
> it is under «Unreleased» in the [changelog](CHANGELOG.md). The design is in [docs/design.md](docs/design.md).

**Docs:** [roles](docs/roles.md) · [first day](docs/first-day.md) · [team guide](docs/team-guide.md) ·
[GitLab notes](docs/gitlab.md)

> Our job is no longer typing code. It is making good decisions. The AI writes, tests and asks; the person decides.

**PDF guides:** [the full guide](docs/pdf/huddle-guide.pdf) (cycle, roles, labels, rules and the first day) and [the first day](docs/pdf/huddle-first-day.pdf) alone, to send to a new Player. Rebuild them with `node docs/pdf/build.mjs` (see the file).

## Why Huddle

AI coding tools made writing code cheap. They did not make teams faster on their own. When every developer prompts the
AI in their own way, every session understands the project differently. Tasks collide in the same files. Mistakes show up
late, in review or in production. And the one thing the AI cannot bring, knowledge of the business, the users and the
priorities, gets answered in a rush.

Huddle turns that around. The person's time goes into deciding and reviewing. The AI does the typing, the testing and the
asking.

| Without a method | With Huddle |
|---|---|
| Most of the time goes into writing code by hand, or into writing a new prompt for every task. | The person's time goes into deciding and reviewing. |
| Each person explains the project to the AI in their own way. | Every session reads the same context and the same rules. |
| Tasks collide in the same files. | Each task has its own files, so two people do not collide. |
| Mistakes show up late, in review or in production. | Tests and review catch mistakes before merging. |

## Install

**Every Player installs Huddle once, on their own machine.** Committing a settings snippet to the repo does not do it
for them (see [the settings snippet](#the-settings-snippet-is-a-helper)). You need:

- [Claude Code](https://claude.com/claude-code).
- Node 22 or newer and `git`.
- **GitHub:** the [`gh`](https://cli.github.com) CLI, logged in with `gh auth login`.
  **GitLab:** the [`glab`](https://gitlab.com/gitlab-org/cli) CLI, logged in with `glab auth login`
  (add `--hostname gitlab.example.com` for a self-managed server).

Install the plugin from its marketplace, once, then type `/reload-plugins` (if the Huddle skills do not show up, restart Claude Code). If you have the `claude` command (the CLI), run this in a terminal:

```text
claude plugin marketplace add SrProfessional/Huddle
claude plugin install huddle@huddle
```

In the Claude Code CLI you can run the same as `/plugin` commands, then type `/reload-plugins` (or restart Claude Code):

```text
/plugin marketplace add SrProfessional/Huddle
/plugin install huddle@huddle
```

If you use only the VS Code extension, it puts no `claude` command in the terminal: type `/plugins` instead, add the
marketplace `SrProfessional/Huddle` in the **Marketplaces** tab, and install `huddle` from the **Plugins** tab with
**Install for this project** (not «Install for you»). Each person does this once per clone. The same dialog updates it.

### The settings snippet is a helper

`/huddle-setup` also writes this into the project's `.claude/settings.json`. It enables the plugin for the project and,
in the CLI, registers the marketplace silently, only after the trust dialog of that folder itself. It does not install
anything for a Player who has not done the step above: when a parent folder is already trusted there is no dialog and
the marketplace key is not used, and it is not documented for the VS Code extension. Keep it as a helper, not as the way in.

```json
{
  "extraKnownMarketplaces": {
    "huddle": {
      "source": { "source": "github", "repo": "SrProfessional/Huddle" }
    }
  },
  "enabledPlugins": {
    "huddle@huddle": true
  }
}
```

In this guide `huddle <command>` is the CLI. Inside a session, the skills run it for you. Outside a session, run it from
the plugin's folder, for example `node <plugin folder>/bin/huddle <command>`.

Huddle has no runtime dependencies, so there is nothing to `npm install`. Every Player of the team installs the plugin
(and logs in to `gh` or `glab`) once. `huddle doctor` has a «plugin» check that tells you if it runs from an installed plugin. To update it later, see [Updating Huddle](docs/team-guide.md#updating-huddle).

To work on Huddle itself, clone it and load your clone instead of the marketplace copy:

```sh
git clone https://github.com/SrProfessional/Huddle.git
claude --plugin-dir ./Huddle
```

## Quickstart for GitHub

About five minutes, in the repo you want to run with Huddle. You are the Coach.

1. Open Claude Code in the repo with the plugin loaded (see [Install](#install)) and create a branch:
   `git switch -c huddle-setup`.
2. Run `/huddle-setup`. It asks for the platform (`github`), the host (empty for github.com), the project (`owner/repo`),
   the login of the Coach and the logins of the Players.
3. It writes `huddle.json`, the Issue and PR templates and the Huddle block of `CLAUDE.md`. There is no cloud labels job:
   the sessions keep the labels right. Nothing outside the markers of that block is touched.
4. Run `huddle doctor`. It should show ✔ for the file, the login, the Coach and the labels. If a label is missing,
   run `huddle labels` once.
5. Commit, push and open a PR with the setup files. Merge it: you are the only one who merges.
6. Write the first task with `/huddle-issue`. The Player opens Claude Code in their clone and runs `/huddle-play <n>`
   with the Issue number (or pastes the «Prompt for Claude Code» of the Issue).

Next: [the first day](docs/first-day.md).

## Quickstart for GitLab

The same five minutes. With no cloud labels job (the default) there is nothing extra to do on GitLab.

1. Open Claude Code in the project with the plugin loaded and create a branch: `git switch -c huddle-setup`.
2. Run `/huddle-setup`. Answer `gitlab`, the host (empty for gitlab.com, or for example `gitlab.example.com`), the project
   path (groups allowed, such as `team/app`), the Coach and the Players.
3. It writes `huddle.json`, `.gitlab/issue_templates/Task.md` and `.gitlab/merge_request_templates/Default.md`, and
   inserts the Huddle block in `CLAUDE.md`.
4. Run `huddle doctor`, then `huddle labels` if a label is missing.
5. **The schedule:** none by default. The sessions keep the labels right, so there is no cloud labels job and no schedule. Only a project that
   wrote a `labels_job` other than `sessions` in `huddle.json` by hand needs one: see [the GitLab guide](docs/gitlab.md#the-schedule). With
   such a job, a label it fixes can take up to 10 minutes to change, also after a push, when no session has fixed it first.
6. **The token:** also only for a hand-written cloud job: a project access token with the `api` scope, stored as the masked,
   protected CI variable `HUDDLE_TOKEN`.
7. Commit, push and open a merge request. Merge it.

Steps 5 and 6 in detail, and everything about self-managed servers: [docs/gitlab.md](docs/gitlab.md).

## The cycle

From an idea to merged code, step by step:

1. **The Coach plans and splits the work.** They define what gets built, write the spec and split it into tasks that
   do not step on each other: each one touches different files.
2. **The Coach creates the Issue with its prompt ready.** Each task is an Issue with the exact prompt to paste into
   Claude Code, the files that may and may not be touched, and the tests that must pass.
3. **The Player opens a session and pastes the prompt.** There is no need to explain the project: `CLAUDE.md` and the
   team docs already give the session its context.
4. **The Player answers the AI's questions and decides.** This is where the value is. The session asks what the Issue
   does not settle: what to do in an unusual case, what text the user sees, what to prioritize. Each answer is a
   decision, and the quality of the result depends on it.
5. **Claude Code writes the test, the code and opens the pull request.** First the failing test, then the code that makes
   it pass. The pull request lists the tests it ran with their real results. The session ends with a message that starts
   with «✅ Issue #N finished»: the link, what was not done and your next step. If you do not see that message, the session
   is not over.
6. **CI filters.** The automatic tests run on every pull request. If something fails, it does not reach review.
7. **The Coach reviews, merges and defines what comes next.** Anything that touches production (the real database,
   deployments, keys) is done only by the Coach.

When a session cannot go on without a decision, it does not guess. It pushes what is done, writes the question on the
Issue with the options and a recommendation, and stops. The Coach answers there, and the session continues on the
same branch.

## Who does what

**Coach** (a single person, not the AI; they lead the work with the help of their own Claude Code session)

- Decides what gets built and in what order.
- Writes the specs and creates the Issues with their prompt.
- Reviews and merges pull requests. The only one who merges into the default branch.
- The only one who touches production and secrets.

**Player**

- Takes an Issue and works on its own branch.
- Answers the session's questions with judgment.
- Reviews what the AI did before opening the pull request.
- If something does not fit the Issue, asks the Coach instead of improvising.
- Works only with local, disposable test data.

## What each Issue brings

The Issue template makes every task arrive complete, so anyone's session starts the same way, no matter who takes it.

| Part | What it says |
|---|---|
| Goal | What we want to achieve and why, in a few lines. |
| Prompt for Claude Code | The text to paste into Claude Code, with the steps, the branch and how to open the pull request. |
| Allowed files | The only things the session may touch. |
| Forbidden files | What is not touched. If it needs to be, the session asks first. |
| Contract or spec | The document that rules over the code. |
| Tests | What must pass before opening the pull request, with its counts. |

A **Design Issue** (its own template and the `design` label) lets a designer do the same from a Claude Code session: the design
is made with Claude Design, polished only in the chat, and saved in `design/<n>-<slug>/` with a PR when they say «ready»
(see [Design tasks](docs/team-guide.md#design-tasks)).

## Why working this way is better

**The decision is the work.** The AI is fast at writing and testing, but it does not know the business, the users or the
priorities. When it asks, the person brings what the AI does not know. A good answer saves hours; a rushed answer is paid
for later.

**A ready prompt removes variation.** If each person writes their own request, each session understands something
different. With the prompt written by the Coach, they all start with the same goal, the same limits and the same
tests.

**Clear limits, fewer collisions.** Allowed and forbidden files let several people move forward at once without stepping
on each other, and tell the AI where not to go.

**Production in a single pair of hands.** Nobody on the team needs keys or access to the real database. A mistake in one
session cannot touch what customers use.

## What is not negotiable

- **Never push to the default branch.** One task is one Issue, one branch and one pull request. Only the Coach
  merges.
- **Only the allowed files.** If another one is needed, ask first.
- **Test first.** Write the failing test, then the code. The pull request says which tests were run and with what result.
- **No production and no secrets.** If a permission or a key is missing, stop and tell. Do not look for another way.
- **Nothing is dropped silently.** Everything the Issue asks for ends up done, or noted under «What was NOT done» with the
  reason.
- **Chat in your language; the repository is in English.** You talk to Claude Code in the language you prefer. Commit
  messages, pull requests, Issues, code comments and documents are in English.

## Commands

| Command | Who | What it does |
|---|---|---|
| `/huddle-setup` | Coach | Installs Huddle in a repo for the first time. |
| `/huddle-update` | Coach | One command to update Huddle in a project: updates the plugin, refreshes the block and the templates in a worktree and branch of its own, asks only the questions a new release added, opens the PR, and ends with `/reload-plugins` (see [Updating Huddle](docs/team-guide.md#updating-huddle)). |
| `/huddle-issue` | Coach | Writes a new Issue from the template. |
| `/huddle-bug` | Coach | Turns a bug description, or a raw report labeled `needs triage`, into a ready Bug Issue: investigates without changing anything, checks duplicates, sets the severity. |
| `/huddle-play` | Player | With no number: works on several of your assigned Issues at once, each in a background subagent with a clean context, as many as your capacity allows (`huddle next`), and starts the next one when room frees. Keep the session open. |
| `/huddle-play <n>` | Player | Works on Issue `n`. An Issue with no branch is started; an Issue already started is continued after the Coach answered (a review or a decision): it takes the pending request and follows it, so you never copy the prompt by hand. |
| `/huddle-review` | Coach | Reviews a PR or MR, then asks for changes or merges. |
| `/huddle-decide` | Coach | Answers a «needs decision» question. |
| `/huddle-release` | Coach | With a staging branch: releases staging to production. Lists what is in staging, asks about each Issue without the «tested in staging» mark, runs the project's own clean check, opens the PR/MR from staging into the default branch and merges it (a merge commit) only on the Coach's word in the same chat. |
| `/huddle-watch [interval\|always\|status\|off]` | Coach | Checks every few minutes (default 5) what waits for the Coach and runs `/huddle-review` on each PR/MR that waits. Turning it on is the order to review and merge. It never answers decisions or triages bugs. It stops with `off` or when Claude Code closes. It is turned on by hand in each session, because turning it on is the order to merge. It waits in the background like a Player's session (`huddle queue --wait`), so it uses no Claude tokens while nothing waits, and wakes the session only when something waits. Without it, the Coach's session start says what waits. `/huddle-watch always` keeps it on: it starts again in each of the Coach's sessions of that repo on that machine, until `off`. Several PRs/MRs are reviewed at once, each in a background subagent, within `review_capacity` effort points (default 5); merges stay one at a time, each checked again against the updated base. |
| `/huddle-team` | Coach | Adds or removes a Player through a PR/MR and prints the message for the new person. |
| `/huddle-areas` | Coach | Helps define the project's areas (milestones): proposes them, puts Issues in them, estimates what is missing and checks them later. |
| `huddle labels [--dry-run]` | Coach, CI | Assigns ready Issues and keeps the status labels up to date. |
| `huddle labels --issue <n> [--started \| --needs-decision] [--dry-run]` | Coach, Players | The same for one Issue (and, when it is closed, the Issues that wait for it); only the Coach assigns. `--started` adds `in progress` and `--needs-decision` adds `needs decision` in the same run, so the old status comes off at once. |
| `huddle wait <n>` | Session | Waits in the background for the Coach's request on Issue `n`. |
| `huddle take <n>` | Session | Marks the pending request 👀 and prints its prompt. |
| `huddle pending [n]` | Anyone | Lists the requests nobody has done yet. |
| `huddle progress [--json]` | Anyone | Shows how far each area (milestone) has come, as a percentage, and the total. |
| `huddle areas [list \| set \| assign \| check]` | Coach | The mechanics behind `/huddle-areas`: lists the areas, creates or updates a milestone, puts an Issue in an area, and reports what needs fixing. Every write prints its change first and has `--dry-run` (see [Define the areas](docs/team-guide.md#define-the-areas-with-huddle-areas)). |
| `huddle team [add <login> [--anyway] \| remove <login>]` | Coach | Lists the team with ✔/✖ for «exists» and «can be assigned», or adds or removes an assignee in `huddle.json` (see [Add or remove someone](docs/team-guide.md#add-or-remove-someone)). |
| `huddle clean [--dry-run] [--no-fetch]` | Anyone, the hook | Removes the worktrees of finished Issues (clean, merged into the default branch, or into the staging branch when there is one, untouched for 24 hours) with their `node_modules`, so they never fill the disk. Starts by itself when a session opens (see [Old worktrees clean themselves](docs/team-guide.md#old-worktrees-clean-themselves)). |
| `huddle land <pr> [--check]` | Coach, `/huddle-review` | With a staging branch (`staging_branch` in `huddle.json`): after a PR/MR is merged into staging, closes the Issues its body names (`Closes #N`) as completed; `--check` only looks. Safe to run twice; it never reopens an Issue. |
| `huddle tested <issue>` | Coach, `/huddle-release` | With a staging branch: after an Issue landed in staging (closed, its PR merged there), posts the comment `✅ Tested in staging` on it and adds the label `tested in staging`. The comment is the evidence, the label only shows it; a mark older than the Issue's last staging merge is invalid. |
| `huddle release [--json]` | Anyone, `/huddle-release` | With a staging branch: lists what is in staging and not yet released (merged PRs whose merge commit is not in the default branch) with their Issues, which of them are tested, and two warnings (commits that belong to no listed Issue; the default branch ahead of staging). Read-only. |
| `huddle release open [--untested <n> --reason "<why>"]` | Coach, `/huddle-release` | Opens the PR/MR from staging into the default branch. It refuses while a staged Issue is untested or the default branch is ahead of staging; `--untested` with a reason lets one named Issue through and writes the reason in the body. The body names Issues as plain `#N`, never with a closing keyword. |
| `huddle queue [--json]` | Coach, `/huddle-watch` | Lists what waits for the Coach: a PR/MR to review, a `needs decision` question nobody answered, a `needs triage` report. Read-only: it writes no label, comment or file. |
| `huddle effort <n>` / `huddle effort --suggest <file>` | Coach | The effort of an Issue (1 small, 2 medium, 3 large; 2 when it has none), or a suggestion for a draft from its files, tests, migrations and folders, with a warning when it should be split. Read-only. |
| `huddle next [--json]` | Player | Which of your assigned Issues start now and which wait, by effort and capacity (default 5 points; work in review uses none; two Issues that share a file never run at once). Read-only. |
| `huddle status [--json]` | Coach, Player | Whether the watch and the review waits are alive on this machine: each one's last check, from the heartbeat it leaves every round (stale when it is older than twice its interval plus a minute: its session is closed or stopped). No network, no login. `huddle doctor` shows the same lines. |
| `huddle capacity [<points>|reset]` | Player | Lowers your capacity in this repo on this machine (never above what the Coach set in `huddle.json`), or `reset` restores it. |
| `huddle update [--check] [--dry-run] [--json] [--answer key=value...]` | Coach | The mechanics behind `/huddle-update`: refreshes the repo's files and `setup_version` with no login and no network. With a question the repo has not answered it changes nothing and exits 3; `--check` and `--dry-run` write nothing. |
| `huddle notice [--json]` | Anyone, the skills | Says the «newer Huddle» notice when a newer release exists and the skills have not shown it in 24 hours (its own stamp, apart from the hook's). `/huddle-play` and `/huddle-update` begin with it, so it shows in VS Code too. Read-only, no login, always exit 0. |
| `huddle hook` | Claude Code | Runs when a session starts and says if a request is pending, and the progress in one line. |
| `huddle doctor` | Anyone | Checks `huddle.json`, the login, the Coach, the labels and whether each assignee can be assigned. |

## What the plugin adds

The method works with plain Issues and a good `CLAUDE.md`. The plugin takes the manual steps away:

- Status labels that move on their own: ready, assigned, in progress, in review, blocked, needs decision, and changes
  requested from Coach.
- A dependency check before a session starts: if an Issue it depends on is not merged yet, the session does not begin.
- Progress by area: milestones are the areas, and `huddle progress`, a pinned «Huddle progress» Issue and one line when a
  session opens show each area's percentage and the total (see the [team guide](docs/team-guide.md#progress)).
  `/huddle-areas` helps the Coach define the areas, whatever their number.
- Skills to set a project up, start an Issue, write a new Issue, review a pull request and ask for a decision.
- A session that waits for the review on its own and picks up the Coach's requested changes as soon as they arrive. It waits with a
  small Node process on the Player's own computer that asks GitHub or GitLab every two minutes, with the Player's own login: it
  uses no Claude tokens and no GitHub Actions or CI minutes, and wakes the session only when a request arrives. It needs the session
  open and the computer on.
- The same commands on GitHub, on gitlab.com and on a company's own GitLab server.

## Development

Node 22 or newer. Huddle has no runtime dependencies, and the tests use only Node's own test runner:

```sh
npm test
```

The tests never call a real GitHub or GitLab.

## License

[MIT](LICENSE)
