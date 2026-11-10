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

## Who does each step

The AI Manager's session does every step it can. Before it hands you a step, it checks whether it can do the step itself
with the tools and logins it has (`gh`, `glab`, the sandboxes, git). If it can, it does it and tells you what it did: it
merges the PR/MR it approved, tags and publishes a release, and runs the steps of the [smoke test](smoke-test.md) on the
sandboxes and fills «Results». You do not get commands to copy for those.

Only a step that needs something the session cannot have is yours:

- a second person's account;
- a payment;
- a secret (creating, copying or pasting a token);
- a phone or another device, or watching a new Claude Code window;
- a legal or business decision;
- a paid action you must approve;
- a permission that was denied.

Those steps are marked **🙋 Only you** (**«🙋 Solo tú»** in Spanish texts) and written for someone with no technical
background. Each one is numbered with one action per step: where to go and what to click, a copy block for anything you
have to paste, **You should see:** what it looks like when it worked, and **If you see something else:** what to do then.
A word like terminal or token gets a one-line meaning the first time it appears. Issues use the same mark, so a step
without it belongs to the session. The rule and the format are in [the design](design.md#13-the-session-does-every-step-it-can).

If a permission is denied or a credential is missing, the session stops and asks, as always: it never looks for another
way.

## Reporting a bug

A bug has its own Issue type: the Bug template (the Task sections plus a bug block with what happens, how to reproduce,
evidence, severity, the probable cause and the failing test to write first).

- **A developer, a tester or a client with access** reports it with the **Bug report form** on GitHub, or with the **Bug
  template** on GitLab (fill only the bug block and add the label `needs triage`: GitLab has no issue forms). A report is
  labeled `bug` and `needs triage`, and it is not a ready Issue: the labels job never gives it `ready` or an assignee while
  it has `needs triage`.
- **The AI Manager** runs `/huddle-bug` with a plain description, a capture or a link, or `/huddle-bug #N` on a raw report.
  The session investigates without changing anything, looks for duplicates, writes the Bug Issue with a probable cause and
  the failing test to write first, and waits for the AI Manager's OK before creating it (or before rewriting the report and
  removing `needs triage`).
- **Severity** is `blocking` (stops a person or production), `normal` or `minor`. A `blocking` Bug is assigned before every
  other ready Issue.

`huddle labels` creates the labels `bug` and `needs triage` when they are missing; run it once after `/huddle-setup` so the
form can apply them.

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

## Design tasks

A design task is an Issue written from the **Design** template (`/huddle-issue` picks it when the AI Manager asks for a design).
It has the label `design`, which `huddle labels` creates when it is missing, and the same sections as a task (so the labels
job treats it like one: `ready`, `assigned`, `in progress`, `in review`), plus **Screens**, **For whom**, **Visual guide**,
**Content** (real texts, never lorem ipsum) and **Deliverable**. Its allowed files are always `design/<issue number>-<slug>/`:
a design task never changes code.

- **The design system.** A project can set one up once, from its repo, with `/design-sync` in Claude Code (an AI Manager
  step). The session uses it when it exists; otherwise it follows the Issue's visual guide.
- **Work.** The designer runs `/huddle-start <n>`. The session creates the design with Claude Design and shares the link.
  Changes are asked for **only in the chat**, never by hand on the canvas. If the session finds a change it did not make, it
  asks whether to keep it or go back to its own last version.
- **Ready.** The designer says «ready» and confirms in one line. The session saves `README.md` (link, screens, decisions,
  round), `design.html` (the page as standalone HTML) and `screens/` (PNGs, desktop and phone) in the folder, opens the PR
  with `Resolves #N` and the screenshots inline, and ends with the usual closing message.
- **Review.** `/huddle-review` shows the screenshots, opens `design.html`, and checks the screens, the content, the visual
  guide, contrast and phone width. It never checks tests. Changes come as the usual «🔁 Changes requested» comment.
- **Rounds.** Each round is a new commit and adds its decisions to `README.md`: the repo is the history, because Claude
  Design keeps none.
- **After the merge,** the review offers the follow-up build Issue «Build <screen> from design #N», with `- #N` under
  «Depends on» and the `design/` folder as its spec.

## Why one or two sessions

Many sessions at once slow the machine (each runs tests and builds), split your attention until your answers get rushed,
and fill the AI Manager's queue with half-reviewed PRs. More speed comes from more developers, not more windows.

## Progress

A project has **areas**, and the areas are **milestones** (GitHub and GitLab both have them). Each Issue goes in one
milestone; `/huddle-issue` asks which. The progress code only reads milestones; the AI Manager defines them with
`/huddle-areas`, described next.

### Define the areas with /huddle-areas

How many areas a project needs, which ones, which area an old Issue belongs to and how many Issues are still missing are
judgments. **The number of areas depends on the project and is never fixed**: one project has 3, another more or fewer.
So the AI Manager does not write them by hand: `/huddle-areas` (AI Manager only) reads the README, `CLAUDE.md`, the specs and
plans and the Issues, and then:

1. **Proposes the areas**, each with a one-line description and the reason, and waits for you to accept, rename, merge,
   split or drop them.
2. **Creates or updates the milestones** after your OK. The description holds the one-line purpose and the
   `Huddle remaining: N` line. A milestone that already exists is reused, never duplicated.
3. **Proposes an area for every Issue without one**, open and closed, grouped by area, with «no area» for platform or
   tooling work that fits none. It applies only what you approve.
4. **Proposes «remaining» for each area**, with its reasoning (for example «spec X lists 8 parts, 3 are Issues already, so
   5»). You confirm or edit each number.
5. **Check-up.** Run it again on a project that has areas: it lists the Issues with no area, the areas with no
   `Huddle remaining` line and the areas whose estimate looks stale (remaining 0 while the open specs still list parts).

It never changes anything without your explicit OK, and shows every change before applying it. The mechanics are plain
commands, the same on GitHub and GitLab, that you can also run yourself:

| Command | What it does |
|---|---|
| `huddle areas list [--json]` | Each area with its open and merged Issues and its remaining line, and how many Issues have no area. |
| `huddle areas set <title> --remaining N [--description <text>] [--dry-run]` | Creates the milestone, or updates it keeping every other line of its description. With `--description` the purpose replaces the other text. |
| `huddle areas assign <issue> <title\|none> [--dry-run]` | Puts an Issue in an area, or takes it out with `none`. |
| `huddle areas check [--json]` | The check-up as data: Issues with no area, areas with no estimate, areas whose remaining is 0. |

Every command that writes prints what it will change first, and `--dry-run` prints it and stops. Closing or deleting a
milestone stays a manual act on the platform.

The percentage of an area counts the work that is not written yet. The AI Manager writes an estimate of the Issues still
missing in the milestone description, on a line of its own:

```text
Huddle remaining: 4
```

For one area, `merged` is the Issues that a merged PR/MR closed, `total` is `merged` plus the Issues still open, and the
percentage is `merged ÷ (total + remaining)`, rounded down to a whole number.

- An Issue closed «not planned», or closed by hand, counts in neither part.
- No line (or one that is not a whole number) means remaining 0, and the report says the estimate is missing.
- An area with nothing to count shows a dash, never `NaN`.
- The total of the project is the sum of `merged` over the sum of `total + remaining`. It covers the open milestones and the
  ones closed in the last 90 days.
- Open Issues with no milestone are listed as «no area» and left out of every percentage.

You see it in three places:

1. `huddle progress` prints the table, with a text bar, and the total. `huddle progress --json` prints the data.
2. A **«Huddle progress» Issue**, created by the labels job and rewritten after each run, only when its text changes. On
   GitHub it is pinned. It has no «Depends on», so the labels logic ignores it. Set `"progress_issue": false` in
   `huddle.json` to turn it off.
3. One line when a session opens, for example `Progress: Content 60% · Social networks 100% · Ads 0% · Total 53%`.

If someone closes the «Huddle progress» Issue, the next labels run creates a new one and pins it. GitHub pins at most 3
Issues, so unpin an old one if the pin fails (the run says so in one line).

Progress never blocks the labels: if reading milestones fails, the labels are still updated and the run prints one line
about it.

## Every day

| I want to | Run |
|---|---|
| Know if something is waiting for me | `huddle pending` |
| See how far each area has come | `huddle progress` |
| Define or check the areas (AI Manager) | `/huddle-areas`, or `huddle areas check` |
| Check my setup | `huddle doctor` |
| See what the labels job would change | `huddle labels --dry-run` |
| Continue after a request | `/huddle-start`, or answer yes to the hook |

## Installing Huddle

Every developer installs Huddle once on their own machine: in a terminal run `claude plugin marketplace add SrProfessional/Huddle`
and `claude plugin install huddle@huddle`, then open a new session (in the CLI, `/plugin marketplace add ...` and
`/plugin install ...` work too). The AI Manager sends these two commands to each developer after `/huddle-setup`.

The `.claude/settings.json` snippet that setup writes is only a helper. It enables the plugin for the project and, in the
CLI, registers the marketplace silently, only after the trust dialog of that folder itself. When a parent folder is already
trusted there is no dialog and it is not used, and it is not documented for the VS Code extension. `huddle doctor` shows
a «plugin» line so a developer can check their own machine. Its «login» line tells two failures apart: «`gh`/`glab` is not
installed or not on the PATH of this terminal» (with the install command for the system, and on Windows «open a new
terminal, or reload the PATH») and «is not logged in» (with `gh auth login` or `glab auth login`, plus `--hostname <host>`
when `huddle.json` has a host). The SessionStart hook stays silent in both cases.

## Add or remove someone

Only the AI Manager changes the team (see [the roles](roles.md)). Adding a person takes three steps:

1. **They can be assigned.** They are a collaborator (GitHub) or a member with at least the Developer role (GitLab). If
   not, Huddle can never assign them an Issue, and it stays `ready`.
2. **Their login is in `assignees`** in `huddle.json`, merged through a PR/MR like any change.
3. **Their machine is ready.** `gh` (or `glab`) is logged in with `gh auth login` (or `glab auth login`), and the plugin is
   installed once with the two terminal commands: `claude plugin marketplace add SrProfessional/Huddle` and
   `claude plugin install huddle@huddle`. On GitLab, Git must also use `glab` to push (see [the GitLab notes](gitlab.md)).

**The easy way: `/huddle-team`.** It asks add or remove and the login, runs the command below, commits `huddle.json` on a
new branch and opens a PR/MR called «Team: add `<login>`». It never merges and never commits to the default branch. At the
end it prints the message to send the new person, with the commands of step 3.

**The command, if you prefer it by hand:**

```text
huddle team                     the AI Manager and the assignees: ✔/✖ for «exists» and «can be assigned»
huddle team add <login>         adds the login to assignees
huddle team remove <login>      takes the login out of assignees
```

`add` and `remove` change only `assignees`: every other key, the order and the line endings of the file stay. Adding
someone twice, or removing someone who is not there, says so and changes nothing.

They never invite anyone and never change a platform setting. When the login cannot be assigned, `add` prints the step for
the AI Manager and writes nothing:

- GitHub: Settings → Collaborators → Add people, or `gh api -X PUT repos/<project>/collaborators/<login>`.
- GitLab: Manage → Members → Invite members, with the role Developer.

Do the step, then run `add` again. To write the file before the step is done, add `--anyway`: that person's Issues stay
`ready` until the step is done. `huddle doctor` has a «team» check that shows a ⚠ with the step for each assignee who
cannot be assigned.

Removing someone does not touch their open Issues: they keep that assignee until the AI Manager reassigns them.

## Updating Huddle

**Why nothing arrives by itself.** Claude Code only sees a new version of a plugin when the `version` in
`.claude-plugin/plugin.json` changes. New commits on `main` change nothing for anyone: the update arrives with a release,
whose version number is bumped (a test checks that `CHANGELOG.md`, `plugin.json`, `package.json` and `marketplace.json`
agree). Claude Code also leaves auto-update off for a plugin from a third-party marketplace.

**The notice.** The first session of the day on a machine whose Huddle is older than the latest GitHub release starts with
one short block, and Claude says it first in its first answer, in your language: `Huddle <new> is available (you have
<old>)`, the two commands, and a link to what changed. It looks the release up without a login (so GitLab teams get it
too), at most once a day, from a small cache in Claude Code's data folder. If there is no network, GitHub answers with an
error or the answer is slow (3 seconds at most), it says nothing. A pre-release never counts. The AI Manager's notice has
one more line: after updating, run `/huddle-setup` on a branch in each repo to get the new templates. If you run Huddle
from a clone (`--plugin-dir`), the notice says to pull your clone.

**Doctor.** `huddle doctor` has a `version` line: ✔ `huddle 0.4.0 (latest)`; ⚠ `huddle 0.3.0, latest is 0.4.0` with the
two commands; or ⚠ `could not check the latest release` when offline. It is a warning, never a failure.

**Auto-update.** Turn it on once per person: `/plugin` → **Marketplaces** → `huddle` → **Enable auto-update**. The VS Code
extension uses `/plugins`. `/huddle-setup` does not write `"autoUpdate": true` in the project's `.claude/settings.json`:
the Claude Code docs only say clearly that managed settings can enforce it for a marketplace, and a project setting was
not proven to work, so each person turns it on (it is a step in the [first-day guide](first-day.md)). Until then the
notice above is the safety net.

**The steps.** Refresh the marketplace listing with `/plugin marketplace update huddle`, then update the plugin from the Installed tab
of `/plugin` (or run `claude plugin update huddle@huddle`). The VS Code extension has no `/plugin`: in a terminal run
`claude plugin marketplace update huddle` and `claude plugin update huddle@huddle`. Either way, open a new session after
the update. If you work from a clone with `--plugin-dir`, pull it
instead. Then run `/huddle-setup` again, on a branch. It replaces only what is between
`<!-- huddle:start v1 -->` and `<!-- huddle:end -->` in `CLAUDE.md`, so your own rules stay. Edited templates are kept.
