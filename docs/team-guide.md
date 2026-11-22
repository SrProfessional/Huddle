# Team guide

How a team works under Huddle, in Claude Code and in OpenAI Codex. The rules live in the Huddle block of your `CLAUDE.md`
(and `AGENTS.md`, which Codex reads); this guide
explains them. New here? Read [the first day](first-day.md) first, and [the roles](roles.md) for who does what.

## The idea

> Our job is no longer typing code. It is making good decisions. The AI writes, tests and asks; the person decides.

One task is one Issue, one branch and one pull request (merge request on GitLab). Each Issue carries the exact prompt to
paste into the session (Claude Code or Codex), so every session starts with the same goal, limits and tests.

## The seven labels

The status of an Issue lives in its labels. Nobody sets them by hand: `huddle labels` does, run by the sessions, from each
Issue's «Depends on» section and from the comments. There is no cloud labels job by default.

`huddle labels --issue <n>` does the same for one Issue (and, when it is closed, for the Issues that wait for it), so a session can
keep the board right at the moments that matter without reading the whole repo. Only the Coach's login assigns; the full
`huddle labels` stays the safety net for what nobody's session saw, such as a PR merged from a phone.

The sessions run that command themselves at each step (a Player's session when it starts, opens the PR, stops for a decision or
pushes a fix; the Coach's session when it requests changes, answers or merges), so the labels are right within seconds, with no
cloud job. It needs permission to edit labels on the repo, which a Player's session already has, since the same
session adds `in progress` (with `huddle labels --issue <n> --started`, which adds it and takes `assigned` off in one step; a question
uses `--needs-decision`). If it fails, the session says one line and goes on; the next session catches up.

| Label | Meaning |
|---|---|
| `ready` | Everything it depends on is merged. Waiting for someone. |
| `assigned` | A Player has it. Not started. |
| `in progress` | A session is working on it. |
| `in review` | A PR/MR is open and waits for the Coach. |
| `blocked` | It waits for a dependency (an Issue that is not merged yet) or for a shared file (an active Issue of the same Player has one of its allowed files). The reason is in the output of `huddle next` and `huddle labels`. |
| `needs decision` | The session asked the Coach and waits. |
| `changes requested from Coach` | The Coach asked for changes and nobody has taken the request yet. |

The names can be changed under `labels` in `huddle.json`.

**Stop labels.** `needs decision` and `changes requested from Coach` mean the work waits for someone else, so they stand alone: `in progress` (a session is working) and `in review` (the Coach is working) are taken off while one of them is on, and come back by themselves once the request is taken or the question is answered. Nobody removes them by hand.

## Effort

Each Issue says how big it is under «Effort»: **1** small, **2** medium, **3** large (2 when it says nothing). `/huddle-issue` suggests it
from the Issue's own files, tests and migrations, and warns when an Issue is too big and should be split into parts. `huddle effort <n>`
shows it. It decides how many Issues a Player works on at once.

**Several Issues at once.** Each Player has a **capacity** of 5 points by default (`capacity`, or `capacity_per_person`, in
`huddle.json`, set by the Coach). `/huddle-play` with no number works on as many of your assigned Issues as fit, each in a background
subagent with a clean context, so no Issue pays for another one's context. Work in review uses no room, two Issues that share a file
never run at once, and the next one starts when room frees. `huddle next` shows what starts and what waits, and why. You can only
**lower** your capacity, on your machine: `huddle capacity 3` (and `huddle capacity reset`). Keep that session open: closing it stops the
subagents. Design Issues stay in a session of their own.

## The Coach does not stop to ask

The Coach's session also decides what has a clear best answer (a limit, a file a test needs, the order of the work, the follow-up Issues
it found, a Player's technical question), says in one line what it decided and why, and goes on. It asks the Coach only about the product
(what users see or do, a feature's scope, priorities), money, accounts or secrets, security or privacy, deleting work or data, and
production.

## Prices

Run `plan claude=max5 codex=plus` once to save the subscriptions you personally use, then `prices --json` for the API-price
source and date plus every plan. API prices refresh daily from OpenRouter, fall back to LiteLLM, and keep the last good copy for offline
work. Unknown models say `no price`; Huddle never invents one. The Coach can put a negotiated per-seat price or seat count under `plans`
in `huddle.json`.

The `CLAUDE.md` block has «Standing orders of the Coach»: in the Coach's own sessions, merging a reviewed Issue PR/MR into staging,
`huddle land`, the labels, and the PRs/MRs of `/huddle-update` and `/huddle-team` need no confirmation. Only `/huddle-release` (staging to
production) asks. A Coach who also works on an Issue (a team of one) goes on from the PR/MR to the review and the merge by itself.

## Dependencies

An Issue lists what it needs under «Depends on», one `- #N` per line. A dependency counts as merged only when the Issue is
closed **and** a merged PR/MR closed it. An Issue closed by hand unblocks nothing. Put a note after the number
(`- #209 (see PR #407)`): only the `#N` at the start of the line count, and a number that is not an Issue is a warning
in the labels run, not a failure; that Issue stays `blocked`.

## How a task goes

Huddle includes `/huddle-tdd`, `/huddle-debug`, `/huddle-verify`, and `/huddle-answer-review` to guide a Player through
implementation and Coach feedback. The Coach uses `/huddle-brainstorm` to turn an uncertain request into an Issue; a
Player does not brainstorm a replacement scope. All five work in Claude Code and Codex and never replace the Coach's
review and merge role.

1. The Coach writes the Issue (`/huddle-issue`).
2. `huddle labels`, run by the Coach's session, assigns it when it is ready.
3. The Player runs `/huddle-play <n>`. The session works test first, touching only the allowed files.
4. It opens the PR/MR with `Closes #N`, the real test counts and «What was NOT done», and ends with «✅ Issue #N finished».
5. The Coach reviews (`/huddle-review`): it reads the change and either requests changes or, about to approve, runs the full suite on the exact head and merges. A docs-only round is approved without a new run (Issue #244).
6. A request comes as a comment with a `## Prompt for Claude Code` heading. The session picks it up (`huddle take <n>`),
   pushes the fix and comments «Ready for review again» with the counts. While it works it runs the tests of the area it touched; before the PR/MR and before «Ready for review again», the
   session merges the base branch in and runs the full suite once, so the Coach reviews a branch that is up to date (Issue #195).

## Who does each step

The Coach's session does every step it can. Before it hands you a step, it checks whether it can do the step itself
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

- **A Player, a tester or a client with access** reports it with the **Bug report form** on GitHub, or with the **Bug
  template** on GitLab (fill only the bug block and add the label `needs triage`: GitLab has no issue forms). A report is
  labeled `bug` and `needs triage`, and it is not a ready Issue: `huddle labels` never gives it `ready` or an assignee while
  it has `needs triage`.
- **The Coach** runs `/huddle-bug` with a plain description, a capture or a link, or `/huddle-bug #N` on a raw report.
  The session investigates without changing anything, looks for duplicates, writes the Bug Issue with a probable cause and
  the failing test to write first, and waits for the Coach's OK before creating it (or before rewriting the report and
  removing `needs triage`).
- **Severity** is `blocking` (stops a person or production), `normal` or `minor`. A `blocking` Bug is assigned before every
  other ready Issue.

`huddle labels` creates the labels `bug` and `needs triage` when they are missing; run it once after `/huddle-setup` so the
form can apply them.

## When the session cannot go on

It does not guess. It commits and pushes what is done, comments on the Issue starting with «❓ Decision for the Coach:» (what is blocked, the options with trade-offs, its recommendation), adds `needs decision` and stops with «⛔
Issue #N stopped: waiting for a decision». The Coach answers with `/huddle-decide`, on the Issue and on the PR/MR,
and the session continues on the same branch: it keeps waiting in the background and picks the answer up by itself (leave it open; if
Claude Code was closed, run `/huddle-play <n>`). The session never closes the Issue.

## Issues change only through a session

Every change to an Issue goes through a Huddle session: creating it (`/huddle-issue`, `/huddle-bug`), editing it, closing it, reopening it, and merging its PR/MR. Nobody merges, closes, reopens or edits an Issue by hand on the website or from a phone. The session runs `huddle labels` after the change, so the board stays right with no cloud job.

Still fine by hand on the website: reading and commenting; the bug report form, for people with no session (it comes in as `needs triage` and waits for the Coach's `/huddle-bug`); and a tester's «✅ Tested in staging» comment (the release gate reads it).

This is a rule, not a lock: if someone breaks it, it is not a problem. The next session that opens repairs the board (docs/design.md §22), so a label changed on the website is corrected with no cloud run.

## Not negotiable

- **Never push to the default branch.** Only the Coach merges.
- **Only the allowed files.** If another one is needed, ask first.
- **Test first.** See the failing test, then write the code. Report the commands with their real counts.
- **No production, no secrets.** If a permission or key is missing, stop and tell. Do not look for another way.
- **Nothing is dropped silently.** Done, or listed under «What was NOT done» with the reason.
- **Chat in your language; the repo is in English.** Code, comments, commits, PRs, Issues and docs.

## Design tasks

A design task is an Issue written from the **Design** template (`/huddle-issue` picks it when the Coach asks for a design).
It has the label `design`, which `huddle labels` creates when it is missing, and the same sections as a task (so the labels
job treats it like one: `ready`, `assigned`, `in progress`, `in review`), plus **Screens**, **For whom**, **Visual guide**,
**Content** (real texts, never lorem ipsum) and **Deliverable**. Its allowed files are always `design/<issue number>-<slug>/`:
a design task never changes code.

- **The design system.** A project can set one up once, from its repo, with `/design-sync` in Claude Code (a Coach
  step). The session uses it when it exists; otherwise it follows the Issue's visual guide.
- **Work.** The designer runs `/huddle-play <n>`. The session creates the design with Claude Design and shares the link.
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
and fill the Coach's queue with half-reviewed PRs. More speed comes from more Players, not more windows.

## Progress

A project has **areas**, and the areas are **milestones** (GitHub and GitLab both have them). Each Issue goes in one
milestone; `/huddle-issue` asks which. The progress code only reads milestones; the Coach defines them with
`/huddle-areas`, described next.

### Define the areas with /huddle-areas

How many areas a project needs, which ones, which area an old Issue belongs to and how many Issues are still missing are
judgments. **The number of areas depends on the project and is never fixed**: one project has 3, another more or fewer.
So the Coach does not write them by hand: `/huddle-areas` (Coach only) reads the README, `CLAUDE.md`, the specs and
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

The percentage of an area counts the work that is not written yet. The Coach writes an estimate of the Issues still
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
2. A **«Huddle progress» Issue**, created by `huddle labels` and rewritten after each run, only when its text changes. On
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
| Define or check the areas (Coach) | `/huddle-areas`, or `huddle areas check` |
| Check my setup | `huddle doctor` |
| See what `huddle labels` would change | `huddle labels --dry-run` |
| Update the labels of one Issue only | `huddle labels --issue <n>` |
| Continue after a request | `/huddle-play <n>`, or answer yes to the hook |
| See what waits for the Coach | `huddle queue` |
| See if a newer Huddle exists (the skills say it too) | `huddle notice` |
| Have the Coach's session review by itself (Coach) | `/huddle-watch`, and `/huddle-watch off` to stop |

**What waiting costs.** After a PR/MR opens, the Player's session waits with a small Node process on the Player's own computer
(`huddle wait`) that asks GitHub or GitLab every two minutes, with the Player's own login: it uses no Claude tokens and no GitHub
Actions or CI minutes, and wakes the session only when a request arrives. It needs the session open and the computer on; otherwise the
next session start says a request is pending. `/huddle-watch` is turned on by hand in each session, because turning it on is the Coach's order to review and merge; it stops with `/huddle-watch off` or when Claude Code closes. It waits in the background the same
way (`huddle queue --wait`), so it uses no Claude tokens while nothing waits, and wakes the Coach's session only when something
waits. Without it, the Coach's session start says what waits for them. `/huddle-watch always` keeps it on: it starts again in each of
the Coach's sessions of that repo on that machine (a mark on the machine, not a file of the repo), until `/huddle-watch off`. When several
PRs/MRs wait, the watch reviews them at once, each in a background subagent, within `review_capacity` effort points (default 5), and still
merges them one at a time, checking each one again against the updated base. A PR/MR that no longer merges cleanly is not reviewed: the
watch itself, with no Claude tokens, asks the Player to bring in the base branch (a «🔁 Changes requested» comment, picked up by the
Player's wait as any request). To check from any terminal that the watch and the waits are alive, run `huddle status` (or
`huddle doctor`): each one says its last check, and a stale one says which command starts it again.

## Old worktrees clean themselves

Every Issue's session works in a folder of its own, a git worktree in `.claude/worktrees/`. In a project with dependencies each
folder carries its own `node_modules`, and finished ones used to stay forever until the disk was full. Now Huddle removes them.
It works the same on Windows, macOS and Linux.

**When.** Each time a session starts, in the background: it never slows the start down. You can also run it yourself:

```text
huddle clean --dry-run
huddle clean
```

The first only says what it would do. Each worktree gets a line: `removed <folder>` or `kept <folder>: <why>`.

**What it removes.** Only a worktree under `.claude/worktrees/` that passes every check:

- its work is merged into the default branch (`main` unless `huddle.json` says otherwise);
- nothing in it is uncommitted;
- nobody touched it for 24 hours (a branch that was just created is also «merged», and must not go);
- it is not locked, and it is not the folder the command runs in.

**What it keeps, and why.** Anything unmerged or with unsaved changes, always. A PR that was merged with *squash* is not
recognised (git cannot see it), so that worktree stays: remove it by hand with `git worktree remove <folder>`. The local branch
is never deleted. Before judging, it runs `git fetch`; offline, it judges with what it already has.

**Turn it off.** Put `"clean_worktrees": false` in `huddle.json`: the session start stops doing it, and `huddle clean` still works by hand.

## Installing Huddle

Every Player installs Huddle once on their own machine, then types `/reload-plugins` in the open session (or restarts Claude Code if the skills do not show up). With the `claude` command, in a terminal run
`claude plugin marketplace add SrProfessional/Huddle` and `claude plugin install huddle@huddle` (in the CLI, `/plugin marketplace add ...`
and `/plugin install ...` work too). With only the VS Code extension, which puts no `claude` command in the terminal, type `/plugins`,
add the marketplace `SrProfessional/Huddle` in the **Marketplaces** tab and install `huddle` from the **Plugins** tab with **Install for
this project** (not «Install for you»), once per clone. The Coach sends both routes to each Player after `/huddle-setup`. A Player
(or the Coach) who works in OpenAI Codex installs it the Codex way instead: see [A mixed team](#a-mixed-team-claude-code-and-codex).

The `.claude/settings.json` snippet that setup writes is only a helper. It enables the plugin for the project and, in the
CLI, registers the marketplace silently, only after the trust dialog of that folder itself. When a parent folder is already
trusted there is no dialog and it is not used, and it is not documented for the VS Code extension. `huddle doctor` shows
a «plugin» line so a Player can check their own machine. Its «login» line tells two failures apart: «`gh`/`glab` is not
installed or not on the PATH of this terminal» (with the install command for the system, and on Windows «open a new
terminal, or reload the PATH») and «is not logged in» (with `gh auth login` or `glab auth login`, plus `--hostname <host>`
when `huddle.json` has a host). The SessionStart hook stays silent in both cases.

## The Player keeps working by itself

`/huddle-play` (`$huddle-play` in Codex) with no number works like the Coach's watch: it first resumes what the Coach answered, then
starts what fits in the capacity, and then **keeps watching** with no tokens; when an Issue can start or the Coach answers one, the session
wakes and goes on. Leave the session open and the computer on; `huddle next --wait-off` stops it, and `huddle status` shows it as
«player watch». One per person and repo on a machine.

## The dashboard

`/huddle-dashboard` (`$huddle-dashboard` in Codex; in a terminal, the `dashboard` command of the CLI) writes one private page, `.huddle/dashboard/index.html`, and opens it in
your browser. Add `--no-open` to only write it. It is dark, it works with no internet (its three scripts are copied next to it), and it
stays on your machine: `.huddle/` is ignored by git, which setup and `/huddle-update` add to the `.gitignore`. It shows:

- **Summary**: Issues closed, the team's tokens, what those tokens would cost by API, what the plans cost for the same days, and the difference.
- **Progress by area**, the same numbers as the «Huddle progress» Issue.
- **Who does what now**: what is in progress, waiting for review or for a decision, and whether the watch and the waits are alive.
- **Tokens and cost**: each person, each tool, each model. A model with no price says so.
- **Cost per Issue**: tokens and API cost of each Issue, per effort point, the most expensive first.
- **Pace**: Issues closed per day (per week for all time), the median time from the first commit to the merge, and the review rounds (requests for changes) per PR/MR.
- **Releases**: what is in staging, how much of it was tested, and the last release.

The 7 days, 30 days and all-time buttons change every number that has days. With the operating system set to reduce motion, the page does not move.

## What the dashboard shares

The Huddle dashboard shows the team's tokens and each person's. For that, each session leaves a summary of its tokens on the branch
`huddle-usage`, at most once an hour: per day, tool, model and Issue, **numbers only** (never the text of a conversation). That branch
never mixes with the code, and it has the repo's own visibility: in a private repo only the team sees it. **In a public repo nothing is
shared** unless the team sets `"share_usage": true` in `huddle.json` (then anyone can see those numbers); `false` turns it off anywhere.

To compare the cost with your plan, say your plan once on your machine: `huddle plan claude=max5 codex=plus`. `huddle prices` shows the API
prices in use (and where they came from) and the plan table; `huddle usage` shows your own numbers, `huddle usage --team` the team's.

**When the Coach asks for changes.** Only for what blocks: a requirement not done, a failing test, a bug a user would hit, a security or
privacy hole, data loss, a broken rule. Anything else (a rarer edge case, extra hardening, a nicer structure) does not hold the merge: the
Coach merges and writes it as a new Issue on the spot.

## A mixed team: Claude Code and Codex

The Coach and the Players may each work in **Claude Code** or in **OpenAI Codex**, at the same time. One person can be both, on two
plans: for example the Players' work (and its tokens) in Codex and the reviews in Claude Code, or the other way round. The two tools never
talk to each other directly: they talk through GitHub or GitLab, as every Huddle session does. A Player opens the PR; the Coach's watch
reviews it; the Coach's request wakes the Player's session, which goes on.

**The Coach in Codex.** `$huddle-watch` waits in a process of its own with no tokens (`huddle queue --wait --codex`) and wakes the open
Codex chat when something waits; the chat then reviews, requests changes, merges and lands, as in Claude Code. This was tried live on
2026-11-20, end to end (PR #220 and others). `$huddle-issue`, `$huddle-decide` and `$huddle-release` work in Codex too.

There is **one watch per repo per machine**. Huddle keeps its watch marks in `~/.huddle` on that machine. If you use two
computers as Coach, keep the watch on one at a time. Run `$huddle-watch off` in Codex (or `/huddle-watch off` in Claude
Code) on the first computer before starting the watch on the other. Players may work on both computers.
With both tools open on the same machine, the first Coach session to turn the watch on reviews and merges. The other session says where
it runs («The watch already runs in Codex…»). `huddle status` names the tool. If the owner goes quiet while it reviews (its chat was closed, or it ran out of quota), `/huddle-watch`
in another session says so and asks «Take over?»; on a yes it starts with `--take-over`. The automatic start of `/huddle-watch always`
never takes over.

**One login on two machines.** A Player may work from two computers on the same account (a Windows PC and a Mac, say). Huddle tells them apart: the `machine` command shows each one's id and name, and an Issue started or taken on a machine is claimed there with a comment on the Issue. The capacity counts only the work of this machine, `huddle next` lists the Issues that run on the other one apart and never offers them again, and the files they hold still keep a clashing Issue waiting. To move an Issue to this machine, run `/huddle-play <n>` here.

| Who | Where | Runs |
|---|---|---|
| The Coach | Claude Code or Codex | `/huddle-watch always`, `/huddle-review`, `/huddle-issue`, `/huddle-release` and the other Coach skills (`$huddle-watch` and so on in Codex) |
| A Player | Codex or Claude Code | `$huddle-play <n>` in Codex, `/huddle-play <n>` in Claude Code |

**The language.** Every session, in Claude Code and in Codex, chats with each person in their language from the first message. Huddle
takes the first that is set: the person's own (`huddle language es`, once on their machine; `huddle language` shows it, `--clear`
removes it), then the team's (asked by `/huddle-setup`, and once by `/huddle-update` in a repo set up before, kept as `language` in
`huddle.json`), then the machine's. The repo itself
stays in English.

**What stays in Claude Code:** Design Issues and the review of a design PR (they need Claude Design). In Codex they stop with one line.

**Adapted but not yet tried live in Codex:** `/huddle-bug`, `/huddle-areas`, `/huddle-team`, playing several Issues in parallel
(`$huddle-play` alone), and GitLab. They are written for Codex and should work; tell the Coach if one does not.

**In Codex the skills start with `$`:** `$huddle-play <n>`, `$huddle-watch`, `$huddle-review` and so on, where Claude Code has
`/huddle-…`. Codex has no `/reload-plugins`: after installing or updating Huddle, open a new chat.

**A repo set up with Huddle comes nearly ready in Codex.** `/huddle-setup` and `/huddle-update` write `.codex/config.toml`, which declares
Huddle for Codex in that repo only. On a machine where Codex is new, open the repo in Codex, trust the project when it asks, and run
`codex plugin marketplace upgrade huddle` once in a terminal in the repo; then trust the hook once (step 4 below). A Claude Code session
says once when this machine has Codex but no Huddle in it, and `huddle doctor` shows a «codex» line.

On macOS, follow the [Mac setup steps](#set-up-huddle-on-a-mac-with-codex).

**Setting up a Player's Codex, once** (written for someone with no technical background):

1. 🙋 Install Codex: in VS Code, open **Extensions**, search «Codex», install the one by OpenAI and sign in.
2. 🙋 Open a terminal (**Terminal → New Terminal**) and paste:
   ```text
   codex plugin marketplace add SrProfessional/Huddle
   codex plugin add huddle@huddle
   ```
   You should see: «Added plugin `huddle`». If you see «codex is not recognized»: the extension brings its own `codex`, not on the PATH.
   On Windows, in PowerShell, paste this instead (it finds that `codex` and runs the same two commands):
   ```text
   $codex = (Get-ChildItem "$HOME\.vscode\extensions\openai.chatgpt-*\bin\*\codex.exe" | Sort-Object FullName | Select-Object -Last 1).FullName
   & $codex plugin marketplace add SrProfessional/Huddle; & $codex plugin add huddle@huddle
   ```
3. 🙋 Open the repo folder in VS Code, then choose **Terminal → New Terminal**. The Codex chat in VS Code has no `/hooks`; use this
   terminal Codex once to trust the hook. Paste:
   ```text
   codex --no-daemon
   ```
   On Windows, if `codex` is not recognized, paste the line that finds the extension's Codex, then start it:
   ```text
   $codex = (Get-ChildItem "$HOME\.vscode\extensions\openai.chatgpt-*\bin\*\codex.exe" | Sort-Object FullName | Select-Object -Last 1).FullName
   & $codex --no-daemon
   ```
   Do not leave off `--no-daemon`: without it, Codex stops with «this CLI has no complete local package».
4. 🙋 When terminal Codex shows «Hooks need review», choose **Review hooks**. Go to the **SessionStart** row: the list does not name the
   plugin, so Huddle is the row with **Review 1**. Press Enter. Check that its command is
   `node "${CLAUDE_PLUGIN_ROOT}/bin/huddle" hook` and its plugin is `huddle`, then trust it.
5. 🙋 You should see: **SessionStart** has **Active 1** and **Review 0**. Press Esc, type `/exit`, then open a new Codex chat in the
   repo. The hook runs when that session starts. If you see something else, leave with `/exit` and repeat steps 3 and 4, checking that
   you opened the terminal in the repo folder.
6. 🙋 Let Codex reach GitHub or GitLab: when Codex asks to run `git push`, `gh`, `glab` or `huddle` with network access, approve it.
   Codex's sandbox has no network, so without that the PR cannot be opened and the wait cannot see the Coach's answer.
7. Work as usual: `$huddle-play <n>`. When the PR is open, the session waits in the background with no tokens
   (`huddle wait <n> --codex`); when the Coach answers, the open Codex chat gets a message and goes on by itself.

**Updating Huddle in Codex:** `codex plugin marketplace upgrade huddle`, then `codex plugin add huddle@huddle`, then open a new chat. A
changed hook needs trust again, so repeat steps 3–5 in terminal Codex (not the VS Code chat, which has no `/hooks`). The Coach then runs
`$huddle-update` in each repo (`/huddle-update` in Claude Code), as after any update.

### Set up Huddle on a Mac with Codex

Codex on macOS is adapted for Huddle but not yet tried live.

1. 🙋 **Install Homebrew.** If you need it, follow the installation and **Next steps** at [Homebrew](https://brew.sh/). Homebrew installs tools on your Mac.
   You should see: The installer finishes and tells you how to make `brew` available in Terminal (the app where you paste commands).
   If you see something else: Follow the installer's instructions before continuing.

2. 🙋 **Install the tools.** Open **Terminal** from **Applications → Utilities**, then paste this command.
   ```text
   brew install node gh git
   ```
   You should see: Homebrew installs Node (which runs Huddle), GitHub CLI (which signs you in to GitHub from Terminal) and Git
   (which copies and tracks your project files), or reports that they are already installed.
   If you see something else: If `brew` is missing, complete Homebrew's **Next steps** and open Terminal again.

3. 🙋 **Sign in to GitHub.** In Terminal, paste the following. Choose **GitHub.com**, **HTTPS**, and **Login with a web browser** when prompted.
   ```text
   gh auth login
   ```
   You should see: GitHub CLI confirms that you are logged in.
   If you see something else: Complete the browser prompt and return to Terminal.

4. 🙋 **Install the Codex command.** In Terminal, paste this command. The global install adds `codex` to your PATH (where new terminals look for commands).
   ```text
   npm install -g @openai/codex
   ```
   You should see: npm reports that it added or updated Codex.
   If you see something else: If a new Terminal window cannot find `codex`, check that Homebrew's **Next steps** were applied.

5. 🙋 **Sign in to the Codex extension.** In VS Code, open **Extensions**, search for **Codex**, install the extension published by OpenAI and sign in.
   You should see: The Codex sidebar opens with your account signed in.
   If you see something else: Choose **Sign in** in the sidebar and finish in your browser.

6. 🙋 **Clone your repo.** In Terminal, copy the repo (your team's project) to this Mac. The example copies Huddle to the **Huddle** folder in your home folder. For your own repo, replace `SrProfessional/Huddle` with the name from GitHub and `Huddle` in the destination with your project folder name.
   ```text
   gh repo clone SrProfessional/Huddle "$HOME/Huddle"
   ```
   You should see: Git reports that it is cloning into your project folder.
   If you see something else: For an access error, check the repo name and the account you signed in with.

7. 🙋 **Open a terminal in the repo.** In VS Code, choose **File → Open Folder**, select the folder you just cloned, then choose **Terminal → New Terminal**.
   You should see: The new terminal opens in the repo folder.
   If you see something else: Check that you opened the folder created by the clone command.

8. 🙋 **Trust the project folder.** Start terminal Codex and approve the project trust prompt for your repo if it appears. Sign in if prompted. Close the chat with `/exit` before running the next terminal command.
   ```text
   codex --no-daemon
   ```
   You should see: Codex opens the repo without a warning that its project settings are ignored.
   If you see something else: Reopen terminal Codex from the repo folder and review the trust prompt.

9. 🙋 **Add the Huddle marketplace if needed.** If the repo has no `.codex/config.toml` and you haven't already added the marketplace, paste this in the repo terminal. The marketplace tells Codex where to find Huddle.
   ```text
   codex plugin marketplace add SrProfessional/Huddle
   ```
   You should see: Codex reports that it added the marketplace.
   If you see something else: If it is already configured, continue to the next step.

10. 🙋 **Refresh the marketplace.** In the repo terminal, paste this command.
    ```text
    codex plugin marketplace upgrade huddle
    ```
    You should see: Codex refreshes the Huddle marketplace.
    If you see something else: If Codex cannot find it, check folder trust and whether the repo has `.codex/config.toml`, or complete the previous step.

11. 🙋 **Install Huddle.** In the repo terminal, paste this command.
    ```text
    codex plugin add huddle@huddle
    ```
    You should see: Codex reports that it added Huddle.
    If you see something else: If it cannot find Huddle, repeat the marketplace refresh.

12. 🙋 **Open terminal Codex.** In the repo terminal, paste this command before reviewing the hook (a command that runs when a chat starts).
    ```text
    codex --no-daemon
    ```
    You should see: Codex opens in the repo and may say **Hooks need review**.
    If you see something else: If it cannot find the command, reopen the terminal after installing the Codex command.

13. 🙋 **Trust Huddle's startup hook.** In terminal Codex, type this command. Select **SessionStart**, open Huddle's row, confirm that it runs `node "${CLAUDE_PLUGIN_ROOT}/bin/huddle" hook` for the `huddle` plugin, and choose **Trust**.
    ```text
    /hooks
    ```
    You should see: **SessionStart** shows the Huddle hook as active.
    If you see something else: If the Huddle row is missing, check that you started Codex in the repo after installing Huddle.

14. 🙋 **Leave terminal Codex.** Press Esc to return to the chat, then type this command.
    ```text
    /exit
    ```
    You should see: You are back at the terminal prompt.
    If you see something else: If the hook list is still open, press Esc again first.

15. 🙋 **Set your personal language if the team has none.** Run the following in the terminal for Spanish. Change `es` to your own language code if needed.
    ```text
    node ~/.codex/plugins/cache/huddle/huddle/*/bin/huddle language es
    ```
    You should see: Huddle confirms your language.
    If you see something else: If several versions are installed, replace `*` with the installed version you want to use.

16. 🙋 **Start a new Codex chat.** In the repo, open a new Codex chat in VS Code or terminal Codex.
    You should see: Huddle introduces itself when the chat starts.
    If you see something else: If it does not, review the Huddle hook again in terminal Codex.

## Add or remove someone

Only the Coach changes the team (see [the roles](roles.md)). Adding a person takes three steps:

1. **They can be assigned.** They are a collaborator (GitHub) or a member with at least the Developer role (GitLab). If
   not, Huddle can never assign them an Issue, and it stays `ready`.
2. **Their login is in `assignees`** in `huddle.json`, merged through a PR/MR like any change.
3. **Their machine is ready.** `gh` (or `glab`) is logged in with `gh auth login` (or `glab auth login`), and the plugin is
   installed once, with the two terminal commands `claude plugin marketplace add SrProfessional/Huddle` and
   `claude plugin install huddle@huddle`, or with `/plugins` in the VS Code extension (**Install for this project**). On GitLab, Git must also use `glab` to push (see [the GitLab notes](gitlab.md)).

**The easy way: `/huddle-team`.** It asks add or remove and the login, runs the command below, commits `huddle.json` on a
new branch and opens a PR/MR called «Team: add `<login>`». It never merges and never commits to the default branch. At the
end it prints the message to send the new person, with the commands of step 3.

**The command, if you prefer it by hand:**

```text
huddle team                     the Coach and the assignees: ✔/✖ for «exists» and «can be assigned»
huddle team add <login>         adds the login to assignees
huddle team remove <login>      takes the login out of assignees
```

`add` and `remove` change only `assignees`: every other key, the order and the line endings of the file stay. Adding
someone twice, or removing someone who is not there, says so and changes nothing.

They never invite anyone and never change a platform setting. When the login cannot be assigned, `add` prints the step for
the Coach and writes nothing:

- GitHub: Settings → Collaborators → Add people, or `gh api -X PUT repos/<project>/collaborators/<login>`.
- GitLab: Manage → Members → Invite members, with the role Developer.

Do the step, then run `add` again. To write the file before the step is done, add `--anyway`: that person's Issues stay
`ready` until the step is done. `huddle doctor` has a «team» check that shows a ⚠ with the step for each assignee who
cannot be assigned.

Removing someone does not touch their open Issues: they keep that assignee until the Coach reassigns them.

## A staging branch

`huddle.json` can name a staging (or QA) branch, `staging_branch`, where changes are tested before they go to the default branch.
`/huddle-setup` and `/huddle-update` ask for it; answer `none` if there is none (it is stored as `""`).

With one set, the work of an Issue goes **into staging**: the session starts the branch from the up-to-date staging branch and opens
the PR/MR against it, still writing `Closes #N`. The Issue is **done when that PR/MR is merged into staging**. GitHub and GitLab only
close an Issue when its PR merges into the default branch, so Huddle closes it itself: right after the merge, the Coach's
session runs `huddle land <pr>` (`huddle land <pr> --check` first looks without changing anything). It is safe to run twice. If an Issue
is still open although its PR was merged into staging, `huddle labels` says so with one line; it never closes the Issue by itself,
so an Issue you reopened on purpose after a failed test in staging stays open. Old worktrees are cleaned once their work is merged
into staging. Setup, update and team PRs keep going to the default branch. With no staging branch, none of this changes.

### Tested in staging, then the release

Nothing goes from staging to production until the Coach has seen that **every Issue in staging was tested there**.

- **Who marks.** Only the Coach, with `huddle tested <issue>` (their session runs it when they say the Issue was tested). It writes the comment
  `✅ Tested in staging` on the Issue and puts the label `tested in staging`. Someone else may do it by hand, writing exactly that comment in the web page, **only** if their login is
  in `testers` in `huddle.json`. A Player's comment never counts.
- **What the mark means.** It is the comment that counts, not the label. A mark is valid only if it is **newer than the last time the Issue's PR/MR was merged into staging**: if
  the Issue is reopened and fixed again, the old mark stops counting by itself, and the label is taken off.
- **The release.** The Coach runs `/huddle-release`. It lists what is in staging and not yet in production, asks about every Issue without a valid mark, runs the project's
  own clean check (a fresh copy of staging, a clean install, the tests; it asks if the project has not written down how), shows the list and waits for the Coach's OK. Then it
  opens the PR/MR from staging into the default branch, and merges it with a **merge commit** only when the Coach says so in the same chat. `huddle release` shows the list
  without changing anything.
- **Testing in staging.** The Coach runs the `/huddle-test` skill (`$huddle-test` in Codex) before `/huddle-release`. It lists the Issues in staging that are not tested, in an order it explains, and takes them one at a time: it says in plain words what the Issue changes, gives numbered steps with what you should see, runs the ones it can itself and hands you only what needs your eyes or another device. When you say «passed» it marks the Issue «tested in staging»; «failed» offers a bug Issue or a reopen; «skip» and «stop» leave it unmarked. An Issue can carry its own optional «How to test in staging» section so the steps come from its writer.
- **Two warnings.** If staging received commits that belong to no listed Issue (a hotfix, a back-merge), the Coach must confirm them. If the default branch is **ahead** of staging
  (a hotfix went straight to production), a back-merge PR/MR from the default branch into staging comes first, and the release does not open until it is merged.
- **An Issue that was not tested** can go out only if the Coach gives the reason (`--untested <n> --reason "<why>"`); the reason is written in the PR/MR.
- **Protect the staging branch** on GitHub or GitLab (branch protection): Huddle does not stop a Player from merging into it. The label is cosmetic by design; the release trusts
  only the comments of the Coach and the `testers`.

## Updating Huddle

**Why nothing arrives by itself.** Claude Code only sees a new version of a plugin when the `version` in
`.claude-plugin/plugin.json` changes. New commits on `main` change nothing for anyone: the update arrives with a release,
whose version number is bumped (a test checks that `CHANGELOG.md`, `plugin.json`, `package.json` and `marketplace.json`
agree). Claude Code also leaves auto-update off for a plugin from a third-party marketplace.

**The notice.** The first session of the day on a machine whose Huddle is older than the latest GitHub release starts with
one short block, and Claude says it first in its first answer, in your language: `Huddle <new> is available (you have
<old>)`, the two commands, and a link to what changed. It looks the release up without a login (so GitLab teams get it
too), at most once a day, from a small cache in Claude Code's data folder. If there is no network, GitHub answers with an
error or the answer is slow (3 seconds at most), it says nothing. A pre-release never counts. The Coach's notice has
one more line: after updating, run `/huddle-update` in each repo to get the new templates and any new questions. If you run Huddle
from a clone (`--plugin-dir`), the notice says to pull your clone.

**The notice in the skills.** The session-start notice can miss you: it is shown once a day per machine, and the VS Code extension may
not show a hook's message at all. So `/huddle-play` and `/huddle-update` begin with `huddle notice` and Claude says the
same text in the chat, in your language, as the first thing in its answer, then goes on with your task. The skills keep their own daily
stamp (`skillShownAt` in the same cache file), so a terminal session that used the hook's notice does not silence them, and they never
use the hook's day. `huddle notice [--json]` is read-only and needs no login.

**Each project updates on its own.** Huddle is installed per project (`/huddle-setup` writes it in the project's `.claude/settings.json`),
so update inside each project where Huddle is used: run the two commands from the project's folder, with `--scope project` on
`claude plugin update`, and type `/reload-plugins` (restart Claude Code if the new skills do not show up). A project can be on an older version than another; `claude plugin list` shows the
version of each installation and its scope.

**Doctor.** `huddle doctor` has a `version` line: ✔ `huddle 0.4.0 (latest)`; ⚠ `huddle 0.3.0, latest is 0.4.0` with the
two commands; or ⚠ `could not check the latest release` when offline. It is a warning, never a failure.

**Doctor, the repo.** `huddle doctor` also has a `setup` line, read from the repo's files only: ✔ `set up for 0.4.2 (up to date)`;
⚠ `set up for 0.4.1, Huddle is 0.4.2: run /huddle-update` when a file would change or a question is pending; ✔ with a
note when only the version number differs and there is nothing to refresh.

**Auto-update.** Turn it on once per person: `/plugin` → **Marketplaces** → `huddle` → **Enable auto-update**. The VS Code
extension uses `/plugins`. `/huddle-setup` does not write `"autoUpdate": true` in the project's `.claude/settings.json`:
the Claude Code docs only say clearly that managed settings can enforce it for a marketplace, and a project setting was
not proven to work, so each person turns it on (it is a step in the [first-day guide](first-day.md)). Until then the
notice above is the safety net.

**One command: `/huddle-update`.** It does everything, in this order: the version notice; the plugin (`claude plugin marketplace update huddle`
then `claude plugin update huddle@huddle --scope project`, run for you); the project's files, in a worktree and a branch of their own
(`huddle-update-<version>`), using the **new** version's templates, so you never change branch; the pending questions; and the PR.
It ends by telling you to type `/reload-plugins` in the open session (in the terminal and in VS Code); if the new skills do not show up, restart
Claude Code (close `claude` and open it again; in VS Code, «Player: Reload Window» or close VS Code and open it again). If the `claude`
command cannot be run from the session (for example in the VS Code extension, which puts none in the terminal), it still refreshes the files with the Huddle
that is installed and tells you to update the plugin with `/plugins` or the terminal commands, and then run `/huddle-update` again. By hand, the same plugin update is `/plugin marketplace update huddle` and the Installed tab of `/plugin`, or the two terminal commands. If you work from
a clone with `--plugin-dir`, pull it instead. The first update to a version that has this skill is done the old way (your installed
`/huddle-update` is the old one); from then on it is one command. `huddle update` is the command behind it. It reads `setup_version` in `huddle.json`
(the Huddle release the repo was last set up for), refreshes the block and the templates, writes the new `setup_version`, and says
what changed and which templates it kept because you edited them. When a release needs an answer your repo does not have yet, it
asks **only that question**, once, and never again; with no new question it asks nothing. `huddle update --check` tells you what would
change without writing anything. (`/huddle-setup` is for a first install: in a repo that already has a valid `huddle.json` it asks
nothing and only refreshes; a half-written `huddle.json` is asked only for what is missing.) It replaces only what is between
`<!-- huddle:start v1 -->` and `<!-- huddle:end -->` in `CLAUDE.md`, so your own rules stay. Edited templates are kept.
**There is no cloud labels job to choose.** The sessions keep the labels right and the board repairs itself when a session opens, so setup writes no labels job and uses no CI minutes; it does not ask about it. A team that wants a cloud run anyway (it uses CI minutes) can write `"labels_job": "hourly"` or `"events"` in `huddle.json` by hand and run `/huddle-update`.
If your repo runs the labels job under its own file name, setup keeps that file, adds no second labels job, and tells you
when its `HUDDLE_REF` pins an older Huddle: move it to the new tag (or its full commit SHA) in a PR.
