# Huddle: Decision-led development for teams coding with AI

[![Website](https://img.shields.io/badge/website-srprofessional.github.io%2FHuddle-4336d8)](https://srprofessional.github.io/Huddle/)

Huddle is a Claude Code plugin and a decision-led team workflow for AI coding. One person, the AI Manager, hands out
tasks as Issues. Each developer pastes the Issue's «Prompt for Claude Code» into a session. The session works on its own
branch, stops to ask when a decision is not its to make, opens a pull request (a merge request on GitLab) and waits for
the review on its own.

It works with GitHub and GitLab, including self-managed GitLab. **Website:** <https://srprofessional.github.io/Huddle/>.

> **Status:** pre-release. Version 0.1.0 is not tagged yet (see the [changelog](CHANGELOG.md)). The design is in
> [docs/design.md](docs/design.md).

**Docs:** [roles](docs/roles.md) · [first day](docs/first-day.md) · [team guide](docs/team-guide.md) ·
[GitLab notes](docs/gitlab.md)

> Our job is no longer typing code. It is making good decisions. The AI writes, tests and asks; the person decides.

**PDF guides:** [the full guide](docs/pdf/huddle-guide.pdf) (cycle, roles, labels, rules and the first day) and [the first day](docs/pdf/huddle-first-day.pdf) alone, to send to a new developer. Rebuild them with `node docs/pdf/build.mjs` (see the file).

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

**Every developer installs Huddle once, on their own machine.** Committing a settings snippet to the repo does not do it
for them (see [the settings snippet](#the-settings-snippet-is-a-helper)). You need:

- [Claude Code](https://claude.com/claude-code).
- Node 22 or newer and `git`.
- **GitHub:** the [`gh`](https://cli.github.com) CLI, logged in with `gh auth login`.
  **GitLab:** the [`glab`](https://gitlab.com/gitlab-org/cli) CLI, logged in with `glab auth login`
  (add `--hostname gitlab.example.com` for a self-managed server).

Install the plugin from its marketplace. Run this once in any terminal (it is the way that works in the CLI and in the
VS Code extension), then open a new session:

```text
claude plugin marketplace add SrProfessional/Huddle
claude plugin install huddle@huddle
```

In the Claude Code CLI you can run the same as `/plugin` commands, then open a new session:

```text
/plugin marketplace add SrProfessional/Huddle
/plugin install huddle@huddle
```

The VS Code extension has no `/plugin`, so use the terminal form there.

### The settings snippet is a helper

`/huddle-setup` also writes this into the project's `.claude/settings.json`. It enables the plugin for the project and,
in the CLI, registers the marketplace silently, only after the trust dialog of that folder itself. It does not install
anything for a developer who has not done the step above: when a parent folder is already trusted there is no dialog and
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

Huddle has no runtime dependencies, so there is nothing to `npm install`. Every developer of the team installs the plugin
(and logs in to `gh` or `glab`) once. `huddle doctor` has a «plugin» check that tells you if it runs from an installed plugin. To update it later, see [Updating Huddle](docs/team-guide.md#updating-huddle).

To work on Huddle itself, clone it and load your clone instead of the marketplace copy:

```sh
git clone https://github.com/SrProfessional/Huddle.git
claude --plugin-dir ./Huddle
```

## Quickstart for GitHub

About five minutes, in the repo you want to run with Huddle. You are the AI Manager.

1. Open Claude Code in the repo with the plugin loaded (see [Install](#install)) and create a branch:
   `git switch -c huddle-setup`.
2. Run `/huddle-setup`. It asks for the platform (`github`), the host (empty for github.com), the project (`owner/repo`),
   the login of the AI Manager and the logins of the developers.
3. It writes `huddle.json`, the Issue and PR templates, the labels workflow (`.github/workflows/huddle-labels.yml`) and
   the Huddle block of `CLAUDE.md`. Nothing outside the markers of that block is touched.
4. Run `huddle doctor`. It should show ✔ for the file, the login, the AI Manager and the labels. If a label is missing,
   run `huddle labels` once.
5. Commit, push and open a PR with the setup files. Merge it: you are the only one who merges.
6. Write the first task with `/huddle-issue`. The developer opens Claude Code in their clone and runs `/huddle-start <n>`
   with the Issue number (or pastes the «Prompt for Claude Code» of the Issue).

Next: [the first day](docs/first-day.md).

## Quickstart for GitLab

The same five minutes, plus two steps only the AI Manager can do, because GitLab CI does not react to Issue events and the
CI job token cannot edit Issues.

1. Open Claude Code in the project with the plugin loaded and create a branch: `git switch -c huddle-setup`.
2. Run `/huddle-setup`. Answer `gitlab`, the host (empty for gitlab.com, or for example `gitlab.example.com`), the project
   path (groups allowed, such as `team/app`), the AI Manager and the developers.
3. It writes `huddle.json`, `.gitlab/issue_templates/Task.md`, `.gitlab/merge_request_templates/Default.md` and
   `huddle-labels.gitlab-ci.yml`, and inserts the Huddle block in `CLAUDE.md`. Add
   `include: local: huddle-labels.gitlab-ci.yml` to your `.gitlab-ci.yml`.
4. Run `huddle doctor`, then `huddle labels` if a label is missing.
5. **Create the schedule:** CI/CD > Schedules, cron `*/10 * * * *`, on the default branch. The schedule is what updates
   the labels, so on GitLab a label can take up to 10 minutes to change, also after a push.
6. **Create the token:** a project access token with the `api` scope, stored as the masked, protected CI variable
   `HUDDLE_TOKEN`.
7. Commit, push and open a merge request. Merge it.

Steps 5 and 6 in detail, and everything about self-managed servers: [docs/gitlab.md](docs/gitlab.md).

## The cycle

From an idea to merged code, step by step:

1. **The AI Manager plans and splits the work.** They define what gets built, write the spec and split it into tasks that
   do not step on each other: each one touches different files.
2. **The AI Manager creates the Issue with its prompt ready.** Each task is an Issue with the exact prompt to paste into
   Claude Code, the files that may and may not be touched, and the tests that must pass.
3. **The developer opens a session and pastes the prompt.** There is no need to explain the project: `CLAUDE.md` and the
   team docs already give the session its context.
4. **The developer answers the AI's questions and decides.** This is where the value is. The session asks what the Issue
   does not settle: what to do in an unusual case, what text the user sees, what to prioritize. Each answer is a
   decision, and the quality of the result depends on it.
5. **Claude Code writes the test, the code and opens the pull request.** First the failing test, then the code that makes
   it pass. The pull request lists the tests it ran with their real results. The session ends with a message that starts
   with «✅ Issue #N finished»: the link, what was not done and your next step. If you do not see that message, the session
   is not over.
6. **CI filters.** The automatic tests run on every pull request. If something fails, it does not reach review.
7. **The AI Manager reviews, merges and defines what comes next.** Anything that touches production (the real database,
   deployments, keys) is done only by the AI Manager.

When a session cannot go on without a decision, it does not guess. It pushes what is done, writes the question on the
Issue with the options and a recommendation, and stops. The AI Manager answers there, and the session continues on the
same branch.

## Who does what

**AI Manager** (a single person, not the AI; they lead the work with the help of their own Claude Code session)

- Decides what gets built and in what order.
- Writes the specs and creates the Issues with their prompt.
- Reviews and merges pull requests. The only one who merges into the default branch.
- The only one who touches production and secrets.

**Developer**

- Takes an Issue and works on its own branch.
- Answers the session's questions with judgment.
- Reviews what the AI did before opening the pull request.
- If something does not fit the Issue, asks the AI Manager instead of improvising.
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
different. With the prompt written by the AI Manager, they all start with the same goal, the same limits and the same
tests.

**Clear limits, fewer collisions.** Allowed and forbidden files let several people move forward at once without stepping
on each other, and tell the AI where not to go.

**Production in a single pair of hands.** Nobody on the team needs keys or access to the real database. A mistake in one
session cannot touch what customers use.

## What is not negotiable

- **Never push to the default branch.** One task is one Issue, one branch and one pull request. Only the AI Manager
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
| `/huddle-setup` | AI Manager | Installs Huddle in a repo, or refreshes its block and templates. |
| `/huddle-issue` | AI Manager | Writes a new Issue from the template. |
| `/huddle-start <n>` | Developer | Starts or continues Issue `n`. |
| `/huddle-review` | AI Manager | Reviews a PR or MR, then asks for changes or merges. |
| `/huddle-decide` | AI Manager | Answers a «needs decision» question. |
| `/huddle-team` | AI Manager | Adds or removes a developer through a PR/MR and prints the message for the new person. |
| `/huddle-areas` | AI Manager | Helps define the project's areas (milestones): proposes them, puts Issues in them, estimates what is missing and checks them later. |
| `huddle labels [--dry-run]` | AI Manager, CI | Assigns ready Issues and keeps the status labels up to date. |
| `huddle wait <n>` | Session | Waits in the background for the AI Manager's request on Issue `n`. |
| `huddle take <n>` | Session | Marks the pending request 👀 and prints its prompt. |
| `huddle pending [n]` | Anyone | Lists the requests nobody has done yet. |
| `huddle progress [--json]` | Anyone | Shows how far each area (milestone) has come, as a percentage, and the total. |
| `huddle areas [list \| set \| assign \| check]` | AI Manager | The mechanics behind `/huddle-areas`: lists the areas, creates or updates a milestone, puts an Issue in an area, and reports what needs fixing. Every write prints its change first and has `--dry-run` (see [Define the areas](docs/team-guide.md#define-the-areas-with-huddle-areas)). |
| `huddle team [add <login> [--anyway] \| remove <login>]` | AI Manager | Lists the team with ✔/✖ for «exists» and «can be assigned», or adds or removes an assignee in `huddle.json` (see [Add or remove someone](docs/team-guide.md#add-or-remove-someone)). |
| `huddle hook` | Claude Code | Runs when a session starts and says if a request is pending, and the progress in one line. |
| `huddle doctor` | Anyone | Checks `huddle.json`, the login, the AI Manager, the labels and whether each assignee can be assigned. |

## What the plugin adds

The method works with plain Issues and a good `CLAUDE.md`. The plugin takes the manual steps away:

- Status labels that move on their own: ready, assigned, in progress, in review, blocked, needs decision, and changes
  requested from AI Manager.
- A dependency check before a session starts: if an Issue it depends on is not merged yet, the session does not begin.
- Progress by area: milestones are the areas, and `huddle progress`, a pinned «Huddle progress» Issue and one line when a
  session opens show each area's percentage and the total (see the [team guide](docs/team-guide.md#progress)).
  `/huddle-areas` helps the AI Manager define the areas, whatever their number.
- Skills to set a project up, start an Issue, write a new Issue, review a pull request and ask for a decision.
- A session that waits for the review on its own and picks up the AI Manager's requested changes as soon as they arrive.
- The same commands on GitHub, on gitlab.com and on a company's own GitLab server.

## Development

Node 22 or newer. Huddle has no runtime dependencies, and the tests use only Node's own test runner:

```sh
npm test
```

The tests never call a real GitHub or GitLab.

## License

[MIT](LICENSE)
