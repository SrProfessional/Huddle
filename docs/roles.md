# Roles

Huddle has two roles. The AI Manager's login is `ai_manager` in `huddle.json`; the developers are `assignees`. Roles are
about people, not about the AI: every person has their own Claude Code session.

## AI Manager

One person per repo. They lead the work with the help of their own Claude Code session.

| Does | Skill |
|---|---|
| Installs Huddle and keeps its block and templates up to date. | `/huddle-setup` |
| Writes the Issues, each with «Depends on» and a «Prompt for Claude Code». | `/huddle-issue` |
| Answers every «❓ Decision for the AI Manager». | `/huddle-decide` |
| Reviews each PR (MR on GitLab), asks for changes or merges. | `/huddle-review` |
| Adds or removes a developer: [Add or remove someone](team-guide.md#add-or-remove-someone). | `/huddle-team` |
| Defines the project's areas (milestones), puts Issues in them and keeps the estimates up to date: [Define the areas](team-guide.md#define-the-areas-with-huddle-areas). | `/huddle-areas` |
| Keeps the estimates of the progress: the `Huddle remaining: N` line of each milestone description, the Issues still to write in that area. | `/huddle-issue` asks for the milestone; the estimate is edited by hand |

Only the AI Manager:

- merges into the default branch;
- touches production, deployments, settings and secrets;
- creates the GitLab `HUDDLE_TOKEN` variable, which holds a secret (see [the GitLab notes](gitlab.md)).

The AI Manager's session does every step it can: merging, tagging, creating the GitLab schedule and running the smoke test on
the sandboxes. It asks the person only for what needs them, as numbered «🙋 Only you» steps; see
[who does each step](team-guide.md#who-does-each-step).

Only the AI Manager's comments count as requests. Anyone else's comment is just a comment.

Why one person: decisions that nobody owns get answered in a rush, or twice, in two ways. One owner keeps the answers
consistent and keeps production in a single pair of hands.

## Developer

Takes an Issue, works on its own branch and answers what the session asks.

| Does | Skill or command |
|---|---|
| Starts or continues an Issue. | `/huddle-start <n>` |
| Sees if the AI Manager left a request. | `huddle pending` |
| Checks the setup. | `huddle doctor` |

A developer's session never merges, never touches the default branch, production or secrets, and touches only the
Issue's allowed files. If something does not fit, it stops and asks.

**Load:** one or two active Issues per person. `max_open_per_person` in `huddle.json` makes the labels job respect that.

## The AI is not a role

The AI writes, tests and asks. It does not decide. A session that does not belong to the AI Manager gives its review as
text and stops; it does not merge, even if the person asks it to. See [the team guide](team-guide.md) for the rules and
[the first day](first-day.md) for what a new person does.
