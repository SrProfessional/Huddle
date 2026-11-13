# Huddle as an open-source Claude Code plugin: design

**Name:** Huddle: Decision-led development for teams coding with AI
**Status:** approved by the AI Manager (2026-11-05)
**Repo:** `SrProfessional/huddle`, public, MIT license, English only.

## 1. Goal

Today Huddle lives inside SocialCortex, mixed with that project's rules. This work makes it a product that any team can
install in its own repo in a few minutes. It has to work with **GitHub** and with **GitLab**, both on gitlab.com and on a
company's own GitLab server.

SocialCortex becomes its first user. It must keep working the same way during the whole move.

## 2. Decisions already made (Santiago, 2026-11-05)

| Topic | Decision |
|---|---|
| Where | Public repo under `SrProfessional` |
| License | MIT |
| Language | English only (code, docs, templates) |
| Platforms | GitHub (github.com, plus GitHub Enterprise Server through `host`) and GitLab (gitlab.com and self-managed through `host`) |
| Name in text | «Huddle: Decision-led development for teams coding with AI». No em dash. |

## 3. What Huddle is

A team method for people who code with Claude Code. The idea behind it:

- One task = one Issue = one branch = one PR (MR on GitLab).
- Each Issue carries a «Prompt for Claude Code» block that the developer pastes into a new session.
- One person, the **AI Manager**, hands out Issues, answers decisions, reviews and merges. Only that person touches
  production and secrets.
- The developer's session never drops a requirement silently. If it cannot go on, it stops with a «❓ Decision for the
  AI Manager» comment.
- The status of each Issue lives in labels: `ready`, `assigned`, `in progress`, `in review`, `blocked`, `needs decision`,
  `changes requested from AI Manager`. A job updates them from each Issue's «Depends on» section.
  `needs decision` and `changes requested from AI Manager` are stop labels (Issue #85): while one is on, `in progress` and `in review` are off, and the
  usual status comes back once the request is taken or the question is answered.
- After opening its PR, the session waits in the background for the AI Manager's review and continues on its own. When
  Claude Code is reopened, a hook says whether a request is pending.

## 4. Packaging: a Claude Code plugin

A plugin, not a plain skill: only a plugin can ship the SessionStart hook together with the skills.

```
huddle/
  .claude-plugin/plugin.json      name, version, description
  skills/
    huddle-setup/SKILL.md         installs Huddle in a repo (asks the platform, host, AI Manager, team)
    huddle-play/SKILL.md          a developer starts an Issue, or picks it up again after the AI Manager answered it
    huddle-issue/SKILL.md         the AI Manager writes a new Issue from the template
    huddle-review/SKILL.md        the AI Manager reviews a PR/MR and posts the request or merges
    huddle-decide/SKILL.md        the AI Manager answers a «needs decision»
    huddle-watch/SKILL.md         the AI Manager's session checks every few minutes what waits for it and reviews it
  hooks/hooks.json                SessionStart (startup|resume) -> bin/huddle hook
  bin/huddle                      one CLI: labels | wait | take | pending | queue | hook | doctor (and progress, areas, team, clean, update, notice)
  lib/
    core/                         pure logic, no network (today: issue-status.mjs, review-requests.mjs)
    platform/
      index.mjs                   picks the adapter from huddle.json
      github.mjs                  adapter on `gh`
      gitlab.mjs                  adapter on `glab`
  templates/
    CLAUDE.huddle.md              the generic rules, inserted between markers
    github/                       ISSUE_TEMPLATE/task.md, pull_request_template.md, workflows/huddle-labels.yml
    gitlab/                       issue_templates/Task.md, merge_request_templates/Default.md, huddle-labels.gitlab-ci.yml
    docs/                         team guide, roles, first day (generic)
  test/                           unit tests + the shared adapter contract (§7)
  LICENSE  README.md  CHANGELOG.md
```

Node ≥ 22 and no runtime dependencies. The only tools it calls are `git` plus `gh` or `glab`.

## 5. What moves out of SocialCortex, and what stays

| Moves to Huddle (generic) | Stays in SocialCortex |
|---|---|
| Rules 1-4, 6 (stop on a missing credential), 9, 10 and 11 of `CLAUDE.md` | What the product is, the folder map, the test commands |
| «Before starting a task», «When the AI Manager must decide», «The AI Manager role» | Migrations (rule 8), Node 24, Neon and production names |
| `scripts/huddle/*` and their 29 tests | Example data that teaches English (rule 7) |
| The Issue and PR templates, the labels workflow | `docs/equipo/migraciones.md`, `conocimiento.md` |
| The generic parts of `docs/equipo/README.md`, `roles.md`, `primer-dia.md` | The project's own notes in those files |

**How the rules get into a repo:** `huddle-setup` writes them into the repo's `CLAUDE.md` between
`<!-- huddle:start v1 -->` and `<!-- huddle:end -->`. An update replaces only that block, so the project's own text is never
touched. The block refers to `huddle.json` for names (the AI Manager, labels), never to SocialCortex.

## 6. Configuration: `huddle.json` at the repo root

Replaces `docs/equipo/team.json`. No secrets ever go in it.

```json
{
  "$schema": "https://raw.githubusercontent.com/SrProfessional/huddle/main/huddle.schema.json",
  "platform": "gitlab",
  "host": "gitlab.example.com",
  "project": "team/app",
  "ai_manager": "santiago",
  "assignees": ["ana", "luis"],
  "max_open_per_person": 2,
  "default_branch": "main",
  "staging_branch": "staging",
  "labels": { "changes": "changes requested from AI Manager" }
}
```

- `platform`: `github` or `gitlab`.
- `host`: empty means github.com or gitlab.com.
- `project`: `owner/repo` on GitHub, or the project path (groups allowed) on GitLab.
- `default_branch`: the branch Issues are merged into (default `main`).
- `staging_branch`: optional; the branch where changes are tested before they go to the default branch. Absent or `""` means none
  (today's behaviour). Stored and validated only for now; see §21.
- `labels`: optional renames. The defaults are the seven labels of §3.

`bin/huddle doctor` checks the setup: the file is valid, `gh`/`glab` is logged in to that host, the labels exist, and the
AI Manager can be found.

## 7. The platform adapter

All network access goes through one interface. The core never calls `gh` or `glab`.

| Operation | GitHub (`gh`) | GitLab (`glab api`, REST v4) |
|---|---|---|
| `listOpenIssues()` with body, assignees, labels | `gh issue list --json …` | `GET /projects/:id/issues?state=opened` (paged) |
| `issueState(n)` → `{open, merged}` | closed **and** the last `ClosedEvent` (GraphQL `timelineItems`) has a merged PR as `closer` (a hand close also gives `COMPLETED`) | closed **and** `GET /issues/:iid/closed_by` has a merged MR |
| `openReviews()` → PR/MR numbers, not drafts | `gh pr list` | `GET /merge_requests?state=opened`, `draft == false` |
| `reviewsClosing(n)` | `closedByPullRequestsReferences` | `GET /issues/:iid/closed_by` |
| `comments(n)` / `postComment` / `editComment` | issue comments API | notes API (`system == false` only) |
| `markTaken(commentId)` (👀) | reaction `eyes` | award emoji `eyes` on the note |
| `setLabels(n, add, remove)` / `ensureLabels()` | `gh issue edit`, `gh label create --force` | `PUT /issues/:iid` `add_labels`/`remove_labels`, `POST /labels` |
| `assign(n, user)` | `gh issue edit --add-assignee` | `PUT /issues/:iid` `assignee_ids` (looks the user up first) |
| `merge(review)` | `gh pr merge --merge` | `PUT /merge_requests/:iid/merge`, never removing the source branch |
| `me()` | `gh api user` | `GET /user` |
| `findIssuesByTitle(title)` → open Issues with that title, oldest first | REST `GET /repos/:o/:r/issues?state=open` (pull requests dropped) | `GET /projects/:id/issues?state=opened&search=…&in=title`, exact title kept |
| `closeIssue(n, { reason })` | `PATCH /issues/:n` `state=closed`, `state_reason` `not_planned` or `completed` | `PUT /issues/:iid` `state_event=close` |
| `setIssueMilestone(n, title\|null)` → `{ reopened }` | `PATCH /issues/:n` `milestone` | `PUT /issues/:iid` `milestone_id`, read back; a closed milestone is reopened, assigned and closed again |
| every call | retried on 429 (and 5xx except a POST), at most 3 tries and 60 s (`lib/platform/retry.mjs`) | same |

Things that work differently on GitLab, and what Huddle does about them:

1. **No «closed as completed».** A dependency counts as merged only when a merged MR closed it. An Issue closed by hand
   does not unblock anything, the same rule as on GitHub.
2. **The CI does not react to Issue events.** The labels job runs on a pipeline schedule (every 10 minutes) and on every MR
   pipeline. `huddle-setup` explains how to create the schedule. A webhook is optional and can come later.
3. **The job needs a token.** `CI_JOB_TOKEN` cannot edit Issues. The AI Manager creates a project access token with the
   `api` scope and stores it as a masked, protected CI variable `HUDDLE_TOKEN`. Huddle only reads the variable: setting it
   up is a step for the AI Manager, described in the guide.
4. **Self-approval** may be disabled on GitLab, as on GitHub. The AI Manager approves with a comment, then merges.
5. **Notes include system notes** («added label …»). The adapter drops them before the core sees them.
6. **The «Closes #N» link** works on both, but on GitLab only for MRs into the default branch. The MR template uses `Closes #N`.

**The shared contract test:** one suite of scenarios (pending request, request already taken, dependency merged or closed
by hand, draft review, renamed label…) runs against both adapters. Each adapter gets canned `gh`/`glab` responses, so the
suite never touches a real GitHub or GitLab. Before each release, a smoke test runs by hand on a sandbox repo on github.com
and a sandbox project on gitlab.com.

## 8. Security

- Only the AI Manager's comments count as requests (by login, from `huddle.json`), as today.
- Tokens are never read from or written to files. Huddle uses the login of `gh`/`glab`, or `HUDDLE_TOKEN` in CI.
- The hook fails silently and quickly (timeout 45 s; quiet when offline).
- The skills never merge, deploy or change settings unless the session belongs to the AI Manager.

## 9. Parts (one Issue each)

| # | Part | Depends on |
|---|---|---|
| H1 | Create the repo (README, LICENSE, plugin skeleton, CI with Node 22 and 24). Move the pure core and its 29 tests unchanged. | — |
| H2 | The adapter interface, `github.mjs`, and the shared contract test, with the GitHub fakes. | H1 |
| H3 | `gitlab.mjs`, with the GitLab fakes passing the same contract, and `host` for both platforms. | H2 |
| H4 | `bin/huddle` (labels, wait, take, pending, hook, doctor) on the adapter, `huddle.json` and its schema. | H2 |
| H5 | The templates: the CLAUDE.md block, the GitHub and GitLab Issue/PR/MR templates, the labels workflow and the GitLab CI job. | H4 |
| H6 | The skills (setup, start, issue, review, decide) and the hook. | H4, H5 |
| H7 | The public docs: what Huddle is, a 5-minute install, roles, the GitLab notes of §7. | H6 |
| H8 | Move SocialCortex onto the plugin: `huddle.json` replaces `team.json`, the generic block replaces the generic rules, and `scripts/huddle` is removed. | H6 |
| H9 | Smoke test on a sandbox github.com repo and a sandbox gitlab.com project, then release v0.1.0. | H3, H7 |

H3 and H5 can run in parallel with H4. H8 runs in the SocialCortex repo, and nothing else there changes until it starts.

## 10. Out of scope (for v0.1)

- Bitbucket, Azure DevOps, Gitea.
- A GitLab webhook receiver (the schedule is enough at first).
- A web dashboard of the queue.
- Translations of the docs.

## 11. Things for the AI Manager

- Create the public repo `SrProfessional/huddle`.
- Get a gitlab.com account for the sandbox project of H9.
- Put the project access token in place for that project (H9).

## 12. Progress

A team sees how far each part of its project has come, as a percentage, and the total. It works for any project on GitHub
or GitLab and asks nothing specific of one team. Decided by the AI Manager on 2026-11-06 (Issue #28).

**Areas are milestones.** A project has areas (for example «Social networks», «Content» and «Ads»); each Issue goes in one
milestone, on GitHub and on GitLab alike. The progress code only reads milestones. Creating and editing them, and putting Issues in them, is the job of `huddle areas`
(Issue #42), and only after the AI Manager's OK: the skill `/huddle-areas` proposes the areas, the estimates and the
classification, and the CLI prints every change before writing it.

**The Issues not written yet count.** The AI Manager keeps an estimate of the Issues still missing in each area, in the
milestone's description, on a line of its own:

```text
Huddle remaining: 4
```

- The line is matched on its own line, as `Huddle remaining:` and a whole number. The first such line wins.
- No line, or a line whose value is not a whole number (`four`, `-2`, `4 or 5`), means remaining 0, and the report says the
  estimate is missing for that area.

**Formulas.** For one area:

| Name | Meaning |
|---|---|
| `merged` | Issues that are closed and whose last close was a merged PR/MR (the same rule as `issueState`, §7) |
| `total` | `merged` plus the Issues of the milestone that are still open |
| `remaining` | the estimate of the description (0 when missing) |
| `percent` | `merged ÷ (total + remaining)`, rounded **down** to a whole number |

An Issue closed «not planned», or closed by hand (without a merged PR/MR), counts in neither `merged` nor `total`: it was
never going to be part of the work. An area with `total + remaining = 0` shows «—», never `NaN` or `0%`.

The **total** of the project is the sum of `merged` over the sum of `total + remaining` of all areas, rounded down, with
the same «—» rule. The areas that count are the **open milestones and the milestones closed in the last 90 days**, so a
finished area stays visible for a while and then leaves the percentage.

**No area.** Open Issues with no milestone are listed as «no area» with their count and are left out of every percentage.
The progress Issue itself is not counted.

**Three places.**

1. **A «Huddle progress» Issue.** The labels job creates it once and rewrites it after the labels, only when its text
   changes. A project with no milestones gets none. It is the open Issue whose body **starts with** the marker line `<!-- huddle:progress -->` **and** whose title is «Huddle progress»: neither
   alone is enough, so an Issue that quotes the marker is never touched (Issue #52). It is looked up through the platform's list
   of Issues, not its search (GitHub search indexes a new Issue late), and every run heals duplicates: the oldest stays, the
   others are closed with «Duplicate of #N». It has no
   «Depends on», so the labels logic ignores it. On GitHub it is pinned; GitLab has no pinned Issues, so it is only
   created. `"progress_issue": false` in `huddle.json` turns it off.
2. **`huddle progress`**, a table of areas with a text bar and the total. `--json` prints the data.
3. **One line when a session opens**, in the SessionStart hook's visible `systemMessage`, for example
   `Progress: Content 60% · Social networks 100% · Ads 0% · Total 53%`. It appears only when the project has milestones, it
   sits next to the pending-request line, and offline it stays silent.

**Best effort.** Progress never stops the labels. If a platform call for progress fails, the labels run has already updated
the labels and reports one line about the error.

**Adapter operations** (added to §7): `listMilestones({ since })` returns the open milestones and the ones closed since
`since`, each with its description and its Issues as `{ number, open, merged }`; `createIssue`, `updateIssue` and
`pinIssue` (a no-op on GitLab). On GitHub one GraphQL query per page reads the milestones with their Issues and the last
close of each; on GitLab the REST equivalents are used (the closing date of a milestone is its `updated_at`, which GitLab
does not expose otherwise; GitHub decides by `closedAt`). GitLab costs one `closed_by` call per closed Issue, at most 8 at a
time. The hook ends the process right after it prints, so a call still running cannot hold it past its timeout. Open Issues now also carry their `milestone`, so «no area» costs no extra call.

## 13. The session does every step it can

Asked by the AI Manager on 2026-11-08 (Issue #50). The AI Manager's own Claude Code session does every step it can, and
Huddle gives step-by-step instructions only for the steps that truly need the person.

**The rule.** Before a session hands a step to the AI Manager (or to a developer), it checks whether it can do the step
itself with the tools and logins it has: `gh`, `glab`, the sandboxes and git. If it can, it does it itself and reports what
it did. Merging an approved PR/MR, tagging a release, creating a release page, running a smoke-test step on the sandboxes
and filling «Results» are all the session's steps.

**What goes to the person.** Only a step that needs something the session cannot have:

- a second person's account;
- a payment;
- a secret (creating, copying or pasting a token);
- a phone or another device, or watching a new Claude Code window;
- a legal or business decision;
- a paid action the person must approve;
- a permission that was denied.

**The «🙋 Solo tú» format** (the label is «🙋 Only you» in English texts). Every human-only step is written as numbered
steps for someone with no technical background:

1. **One action per step.** Exactly where to go, and what to click.
2. **A copy block** (a text block) for anything that is typed or pasted, written exactly as it must be pasted.
3. **«You should see:»** what the person sees when it worked.
4. **«If you see something else:»** what to do then.
5. **No jargon without a one-line explanation.** The first time a word such as terminal, clone or token appears, its
   meaning follows in brackets.

An example, as it is written in a document:

````text
🙋 Only you
1. Open a terminal (the window where you type commands) in the sandbox folder.
2. Copy this line, paste it in the terminal and press Enter:
   ```text
   huddle doctor
   ```
You should see: a list where every line starts with ✔.
If you see something else: copy the whole list and send it to the AI Manager's session.
````

**Where it applies.** `/huddle-review` merges, tags and releases itself once its own session approved, and asks only for
the 🙋 steps. `/huddle-issue` marks the steps only a person can do with «🙋» and leaves every other step to the session.
The closing message of every skill says what the session did, and writes the next step as 🙋 steps when it is the person's.
The smoke test marks each step «Session» or «🙋 Only you», and `docs/team-guide.md` explains all of it.

**Never around a refusal.** If a permission is denied or a credential is missing, the session stops and asks, as always:
it never looks for another way.

## 14. Bugs

Asked by the AI Manager on 2026-11-09 (Issue #55). A bug has its own Issue type, so it carries what a task does not have:
evidence, a probable cause and the failing test to write first.

**Two ways a bug comes in.**

- **From the AI Manager.** The AI Manager describes it in plain words, with a capture or a link if there is one, and runs
  `/huddle-bug`. The session investigates without changing anything: it reads the code, searches for the error text, reads
  the recent commits of that area, runs the area's tests and reproduces the bug when the repo's own tools can. Then it
  writes the Bug Issue, shows the draft and creates it after the AI Manager's OK.
- **From anyone else** (a developer, a tester, a client with access). On GitHub, the person uses the «Bug report» form; on
  GitLab, the Bug template with the `needs triage` label. A report with `needs triage` is never `ready` and never assigned.
  The AI Manager runs `/huddle-bug #N`: it rewrites the report into the full Bug Issue, keeps the reporter's text under
  «Original report» and removes `needs triage`.

**The Bug template.** A bug block first: What happens, What should happen, How to reproduce, Evidence, Severity, Probable
cause, The failing test to write first. Then every Task section, so the labels job and `/huddle-play` read it like a
task. Label: `bug`.

**Severity.** `blocking` (it stops a person or production), `normal` or `minor`, written under «Severity». The labels job
assigns a `blocking` Bug before every other ready Issue.

**Duplicates.** Before writing, `/huddle-bug` searches the open and recently closed Issues for the same symptom. When one
matches, it offers to add the new evidence there instead.

**Labels.** `bug` and `needs triage` are created by `huddle labels`. They are not status labels and are not renamable. GitHub
limits a label description to 100 characters, and a test checks every label Huddle creates against that limit.

## 15. Design tasks

Asked by the AI Manager on 2026-11-09 (Issue #58). A designer works a Huddle Issue from a Claude Code session, like a
developer, and makes the design with Claude Design inside that session.

**The Design template.** Every Task section, plus Screens, For whom, Visual guide, Content (real texts, never lorem ipsum)
and Deliverable. Its allowed files are always `design/<issue number>-<slug>/`: a Design Issue never changes code. Label:
`design`, created by `huddle labels`. The labels job treats a Design Issue exactly like a task.

**The flow.**

1. The designer pastes the Issue's prompt. The session creates the design as a Claude Design artifact, with the project's
   design system when one is set up (`/design-sync`, the AI Manager's step), or else the Issue's visual guide.
2. **The design is polished only through the chat.** The designer asks for every change in words and never edits the
   canvas by hand. If the session notices a change it did not make, it says so and asks whether to keep it.
3. On «ready» and a one-line confirmation, the session saves `README.md` (artifact link, screens, decisions, round),
   `design.html` and `screens/` (desktop and phone) in `design/<n>-<slug>/`, opens the PR and closes.
4. `/huddle-review` reviews a design PR without tests: screens, content, visual guide, contrast and phone width. Changes
   requested are a new round, kept as a new commit. **The repo is the design's history**, because Claude Design has no
   version history.
5. After the merge, `/huddle-review` offers the build Issue «Build <screen> from design #N», which depends on the design
   Issue and takes the `design/` folder as its spec.

## 16. Finished worktrees clean themselves

Asked by the AI Manager on 2026-11-11 (Issue #76). Every Issue's session works in its own worktree in `.claude/worktrees/`
(an AI Manager's review adds `rev-*` ones), and nothing removed them. In a project with dependencies each carries its own
`node_modules`, so they filled the disk silently. Huddle now removes the finished ones, on Windows, macOS and Linux.

**The command.** `huddle clean [--dry-run] [--no-fetch] [--quiet]`. It lists the worktrees with
`git worktree list --porcelain` and removes the ones that pass **every** check below. For each one it prints
`removed <path>` or `kept <path>: <reason>`. `--dry-run` prints the same and removes nothing; `--quiet` prints nothing (the
hook). It calls only `git`, never `gh` or `glab`, and needs no login.

**What it removes.** A worktree is removed only when all of these hold; one failed check keeps it:

1. It is under `<main worktree>/.claude/worktrees/`. The main worktree is the first entry of `git worktree list`, not
   `ctx.root` (inside a worktree, `findRoot` finds the worktree's own `huddle.json`). A worktree anywhere else is never touched.
2. It is not the main worktree, not the one the command runs in (`cwd` inside it), not locked and not bare.
3. It has no uncommitted work: `git status --porcelain` is empty (ignored files such as `node_modules` do not count).
4. Everything in it is merged: its HEAD commit is an ancestor of the default branch (`git merge-base --is-ancestor`). That
   covers branches and the detached `rev-*` worktrees. The base is `origin/<default_branch>` of `huddle.json`, then
   `origin/HEAD`, then `origin/master`; when none resolves, **nothing is removed**. A squash merge is not detected, so that
   worktree stays: the rule errs toward keeping.
5. It has not been touched for 24 hours (modification time of its HEAD reflog, `<git-dir>/logs/HEAD`). A branch just created
   from `main` is also an ancestor of `main` and clean; it must not go while a session starts on it.

**Fetch.** Before judging it runs `git fetch origin --quiet` once, best effort and limited to 20 s, because a merge on the
platform is only visible after a fetch. A failure (offline) is not an error: it judges with what it has. `--no-fetch` skips it.

**How it removes.** `node_modules` first, with `fs.rm` (`recursive`, `force`, `maxRetries`, which copes with Windows file
locks and deep trees); then `git worktree remove <path>` **without `--force`** (git itself refuses an unclean worktree: a
second guard); then `git worktree prune`. A failure on one worktree (a file in use, another session) is
`kept <path>: could not remove: <first line>` and the run goes on. The local branch is **not** deleted.

**Automatic.** The SessionStart hook starts `huddle clean --quiet` as a detached process (`detached`, `stdio: 'ignore'`,
`windowsHide: true`, `unref()`), so a slow delete never delays or breaks the start of a session, and the hook's output does not
change. `huddle.json` has `clean_worktrees` (boolean, default `true`); `false` turns the hook off and the command still works.
Two sessions that start together may both run it: the second finds nothing or fails on a path that is gone, silently.

**Windows, macOS and Linux.** Paths from git (`D:/x`, `/private/var/x`) and from Node (`D:\x`, `/var/x`) are compared after
`fs.realpathSync` and one normal form, case-insensitively on Windows and macOS (their default file systems) and
case-sensitively on Linux. No shell, no `rm -rf`, no `du`: only `git` and Node's own modules. CI runs the tests on
`ubuntu-latest`, `macos-latest` and `windows-latest`.

## 17. Updating a repo: `huddle update` and `/huddle-update`

Asked by the AI Manager on 2026-11-11 (Issue #81). `/huddle-setup` is a first-install flow; after a release the only way to
refresh a repo was to run it again. Updating a repo to the installed Huddle is now one command and, when the new release needs
an answer the repo does not have yet, only that question.

**What it is.** `/huddle-setup` installs Huddle in a repo for the first time. `/huddle-update` brings an already-set-up repo
to the installed Huddle version. They share one code path (`lib/setup/index.mjs`); `/huddle-setup` in a repo that already has
a valid `huddle.json` tells the session to use `/huddle-update` (and, as §14 says, it only refreshes and asks nothing).

**Which version the repo is at.** `huddle.json` has `setup_version` (string, `major.minor.patch`), written by setup and by
update, never by hand. Absent means «set up before this existed»: it counts as `0.0.0`, so every question that applies is
asked once. Setup writes it too, except when a question is still pending: then it keeps the old one so the question is not hidden.

**New questions come from a registry.** `lib/setup/questions.mjs` is a list of
`{ id, since, key, ask, options?, default?, needed(config) }`: `since` is the release that introduced the question, `key` the
`huddle.json` key its answer is written to, `needed(config)` whether this repo still has to answer it. A question is
**pending** when `since` is newer than the repo's `setup_version` **and** `needed(config)` is true (the key is not set yet). A
question never repeats: once its key is in `huddle.json` it is not asked again, whatever the version. The registry is **empty
in 0.4.x** (no release asks anything yet): the mechanism ships first, and the tests use a fake registry. The first release that
needs a new answer adds its entry: `staging-branch` (`since: 0.8.0`, §21).

**The command.** `huddle update [--check] [--dry-run] [--json] [--answer key=value ...]`. It needs no platform and no login:
only files, never the network.

- No flags: refreshes the block of `CLAUDE.md`, the templates and the labels job exactly as setup does (a template the
  project edited is kept and reported), writes `setup_version`, and prints what changed. Exit 0.
- Pending questions without answers: it changes **nothing**, prints each question (`--json`: `pendingQuestions: [{ id, key,
  ask, options, default }]`) and exits **3**, so the skill knows to ask.
- `--answer key=value` gives an answer (the value is read as JSON when it is, else as text). The key must be one of the
  pending questions and the value must pass `huddle.schema.json`; any other key is refused, so no secret ever goes in
  `huddle.json`. When every pending question is answered it refreshes and writes the answers.
- `--check` writes nothing: `up to date` (exit 0) or what would change and which questions are pending (exit 3). `--dry-run`
  prints the full change and writes nothing (exit 3 when a question is pending, else 0).
- No `huddle.json`: it fails (exit 1) and says to run `/huddle-setup`. A bad flag is exit 2.

**The skill `/huddle-update`.** Runs `huddle update --json`. No pending questions: it has already updated; the session reports
what changed (the block, the templates written, the templates kept because they were edited, the notes) and says to commit it
on a branch and open a PR/MR. Pending questions: it asks **only those**, in one message, in the developer's language, offering
the default, then runs `huddle update --answer ...`. It never asks for a token. The AI Manager's session does every step it
can (§13).

**One command (Issue #104).** `/huddle-update` does the whole update, so the person does not switch branch, open a terminal or run a
second command. Order: (1) the version notice; (2) the plugin: `claude plugin marketplace update huddle`, then `claude plugin update
huddle@huddle --scope project`, run in the project (if `claude` cannot be run from the session it goes on with the installed Huddle and
says to update with `/plugins` or the terminal and run `/huddle-update` again); (3) the files, in a worktree and branch of their own,
`huddle-update-<version>` from the up-to-date default branch, entered with `EnterWorktree`, running `huddle update --json` from the
**new** version's folder (a sibling of `${CLAUDE_PLUGIN_ROOT}`, found by `newPluginRoot` in `lib/core/update.mjs`), because the session
still has the old skills loaded; (4) the pending questions, as before; (5) the PR/MR, which a developer's session never merges; (6) the
last line: `/reload-plugins` applies the new version in the open session, in the terminal and in VS Code. It was tried on a real project:
`claude plugin update` from a second terminal, then `/reload-plugins` in the open session, and the skill added by the new version showed
up, in both. «Restart Claude Code» (and «Developer: Reload Window» in VS Code) is the fallback only. A plugin updated from the `/plugins`
dialog applying by itself was not tried, so no text says it. `huddle update` itself does not change. The first update to a version
that has this skill is done the old way, since the installed `/huddle-update` is the old one. Texts never say «open a new session» after an
install or an update; a test walks the docs, the skills, the site and the CLI strings for it.

**Where a repo is told it needs it.**

- `huddle doctor` has a `setup` line: ✔ `set up for 0.4.2 (up to date)`; ⚠ `set up for 0.4.1, Huddle is 0.4.2: run
  /huddle-update` (when `update --check` would change something or has a question); ✔ with a note when only the
  version differs and nothing would change. It reads files only.
- The update notice (`lib/core/update.mjs`) for the AI Manager says `/huddle-update`. The developer's notice is unchanged.

**What it never does.** It never overwrites a template the project edited, never changes a key of `huddle.json` it was not
given or does not own, never commits, never touches the network.

## 18. One command to work on an Issue: `/huddle-play`

Asked by the AI Manager on 2026-11-11 (Issues #83 and #100). Issue #83 split the work in two commands: one to start an Issue and
one to pick it up again after the AI Manager answered. Two names for «work on this Issue» confuse people (which
one do I type now?), and the session already knows the answer: an Issue with no branch is started, an Issue with its branch and a request
waiting is continued. So there is one command, `/huddle-play <n>`. The two old commands no longer exist: no alias, no
deprecated copy. This is a breaking change for the person who types, so the release that carries it is 0.6.0. An Issue or a review comment
written before it that names the old commands has to be edited. There is no new CLI command: the skill uses `huddle pending` and `huddle take`.

**The skill `/huddle-play <n>`.** After the version notice (§20), it reads the Issue and finds its branch (the «Branch» section), and decides:

1. **Neither a local branch nor `origin/<branch>` exists:** the Issue was never started. It checks «Depends on», creates the branch in a
   worktree of its own, adds `in progress`, runs the tests, works with TDD, opens the PR/MR, closes with the usual message and starts
   `huddle wait <n>` in the background. A Design Issue keeps its own flow (§15).
2. **The branch exists:** the Issue was started. It enters the Issue's worktree (`.claude/worktrees/<branch>`; if the folder is gone but the
   branch exists, it creates it again without `-b`) and switches the session into it. It runs `huddle pending <n>`. Nothing pending: it says so,
   changes nothing, and offers to wait (`huddle wait <n>`). Pending: it runs `huddle take <n>` (it marks the request 👀 and prints the AI
   Manager's prompt) and follows that prompt with the same rules. Only comments by the `ai_manager` login count. The developer is told which
   request it is and is **not** asked to paste anything. It pushes, comments «Ready for review again» with the real counts (none for a design
   Issue), never touches the status labels, and starts `huddle wait <n>` again.
3. It closes with the usual message («✅ Issue #N finished» or «⛔ Issue #N stopped»), the link, the counts, what was not done and the next
   step (a step the session takes, or 🙋 steps), as in §13. «When you cannot go on» and «Who does each step» stay as they are.

Nothing else about the flow changes: `huddle pending`, `huddle take`, `huddle wait`, the labels and the review prompts stay as they are. Only
the name the person types changes.

**The AI Manager's prompt.** The first line of a «Prompt for Claude Code» comment (`huddle-review`, `huddle-decide`) is
`First run /huddle-play <n>: it marks this request as taken (👀), so the Issue shows «in progress».`


## 19. Watching what waits for the AI Manager: `huddle queue` and `/huddle-watch`

Asked on 2026-11-11 (Issue #88). The AI Manager had to tell its session to look at the PRs and questions that wait for it. One
command now starts a check every few minutes inside the AI Manager's Claude Code session, and a read-only CLI command lists what waits.

**What waits for the AI Manager.** Three cases, taken from the same data `huddle labels` reads (the open Issues, the open non-draft
PRs/MRs and `requestState`), **not** from the label text, so the answer is right before the labels job runs:

- `review`: an open Issue with an open, non-draft PR/MR whose request state is `null` (the work is done and nobody asked for changes:
  the «in review» status of `statusOf`). A pending or taken request is the developer's turn, not the AI Manager's.
- `decision`: an open Issue with the label `needs decision` and request state `null` (nobody answered yet).
- `triage`: an open Issue with the label `needs triage` (a raw bug report).

Rules that follow from `plan` and `statusOf` (they decide what the labels say, so the queue agrees with them):

- An Issue appears **once**, in this order: `triage`, then `decision`, then `review`. A raw report is never reviewed (`plan` skips it) and a
  question stops the work, so its PR is not «in review» either.
- `triage` and `decision` are listed for any open Issue, with or without a «Depends on» section. `review` follows `plan`: an Issue with
  **no «Depends on» section is not managed** and is never listed for `review`.
- A closed Issue is never listed. The queue does not look at «Depends on» being merged: a PR for a blocked Issue is still a PR to review.

**`huddle queue [--json]`.** Read-only: it never writes a label, a comment or a file. The pure function
`waitingFor({ open, openPrs, requests })` in `lib/core/queue.mjs` (`requests`: Issue number to `requestState`, as `plan` takes it) returns
the items sorted by Issue number. Text output:

```text
Waiting for the AI Manager:
  #42  review    PR #51   Add login form
  #47  decision           Which payment provider?
  #53  triage             Login page crashes on Safari
```

or `Nothing is waiting for the AI Manager.` (on GitLab the reference reads `MR !51`). `--json` prints
`{ "waiting": [{ "issue": 42, "title": "...", "waits": "review", "pr": 51, "head": "<the PR's head commit sha>" }, ...] }`; `pr` and `head`
only for `review`. `head` comes from the adapter operation `reviewHead(n)` (§7), the head commit sha of PR/MR `n` (GitHub: `gh pr view <n> --json headRefOid`;
GitLab: `diff_refs.head_sha` of the MR), one call per `review` item. It is best effort: if one cannot be read, that item prints
`head: null` and one line goes to stderr (`huddle queue: could not read the head of PR #51 (Issue #42): <reason>`), and the exit is still 0.
Exit 0 when it ran, with or without items; 1 on a platform error, with one clear line; 2 on a bad flag. A repo without `huddle.json`
gets the same «not configured» error as the other commands.

**The skill `/huddle-watch [interval|off|status]`.** For the AI Manager only: it runs `huddle doctor` first and stops with a clear line
if the login is not `ai_manager`.

1. **On** (no argument, or an interval such as `5m`; default 5 minutes, allowed 2 to 60). `CronList` first: a job whose prompt starts with
   `[huddle-watch]` means it is already on, so no second one starts and the skill says when it runs next. Otherwise `CronCreate` a
   recurring job on a minute that is not :00 or :30 (for example `2-59/5 * * * *`) whose prompt starts with `[huddle-watch]`: run
   `huddle queue --json`; nothing waits, say nothing; otherwise handle the items one at a time, oldest first.
2. The first message says that **turning the watch on is the AI Manager's order to review and merge, as if they asked for each review**,
   what stops it (`/huddle-watch off`, or closing Claude Code, because the job lives only in the session) and that a recurring job
   expires after 7 days.
3. **`review`:** `/huddle-review` on that PR with its usual rules: all good, approve and merge; changes needed, the «🔁 Changes
   requested» comment. Either way the item leaves the queue by itself. If the review **stops** (a failing test, a missing requirement, a
   merge the platform refuses, a missing permission) the watch says it once, with the reason, and does not try that PR with that `head`
   again; a new commit changes `head` and makes it a new item.
4. **`decision` and `triage` are never answered by the watch:** they are the person's decisions. One line per new item, once per Issue.
5. **Off:** `CronList`, `CronDelete` the `[huddle-watch]` job. Nothing running: it says so. **Status:** on or off, the interval and the next run.
6. «Who does each step», and every command in the full `node "${CLAUDE_PLUGIN_ROOT}/bin/huddle"` form.

**Not here:** answering decisions or triaging bugs on its own, desktop or phone notifications, a cloud routine that runs with the
computer off, starting the watch when a session opens. A job fires only while the session is open and idle.

## 20. The version notice inside the skills: `huddle notice`

Asked on 2026-11-11 (Issue #91). The SessionStart hook's «newer Huddle» notice (§17's update cache, Issue #65) is shown at most once every
24 hours per machine, and only where the client shows the hook's message. A terminal session can use up the day's notice, and a VS Code
session then shows nothing. A skill runs in the chat, so what it says is seen in every client.

**`huddle notice [--json]`.** Read-only, and it needs no login. It uses the same release lookup as the hook (`latestRelease`: cached for a
day, 3 seconds at most) and the same text (`noticeText`, with the AI Manager's extra line when `isManager()` says so, as the hook asks it:
only when there is something to show; with no `huddle.json` or no login nobody is the AI Manager). It prints the text when a newer
release exists **and** the skills have not shown it in the last 24 hours; otherwise it prints nothing. It keeps its own timestamp,
`skillShownAt`, in the same cache file: it never reads or writes the hook's `shownAt`, and the hook never reads `skillShownAt`, so the two
cannot use each other's day. The pure function is `skillNotice(ctx, isManager)` in `lib/core/update.mjs`. It always exits 0 (offline, an
unreadable version or a lookup that fails print nothing); 2 on a bad flag. `--json` prints
`{ "show": true|false, "installed": "...", "latest": "...", "text": "..." }`; `latest` and `text` are `null` when `show` is false and
nothing newer exists. When a newer release exists but was already shown today, `show` is false, `latest` is that release and `text` is
`null`. The only file it writes is the update cache.

**The skills.** `/huddle-play` and `/huddle-update` begin with `node "${CLAUDE_PLUGIN_ROOT}/bin/huddle" notice` (the full
form). When it prints text, the session says it to the person, in their language, as the first thing in its answer, and then goes on with
the task: the notice never stops the work and never asks anything. When it prints nothing, the session says nothing about versions.

**The update steps (checked 2026-11-11).** `claude plugin update --help` has `-s, --scope <scope>` (`user`, `project`, `local`, `managed`;
default: auto-detect), and `claude plugin list` shows one `huddle@huddle` entry per scope, each with its own version (a machine can
hold a user install and several project installs at once, on different versions). `/huddle-setup` installs Huddle **per project** (the
marketplace and `enabledPlugins` in the project's `.claude/settings.json`), so the update names that scope: `updateSteps` and the
`version` line of `huddle doctor` say `claude plugin update huddle@huddle --scope project`, run inside the project.
`claude plugin marketplace update` has no scope. The team guide says: update inside each project where Huddle is used, open a new
session, and that a project can be on an older version than another.

**Not here:** the hook's own notice (unchanged), a skill that runs the update by itself, a `doctor` line about several installations, and
finding out why the hook's notice does not show in VS Code.

## 21. A staging branch: first staging, then production

Asked by the AI Manager on 2026-11-13 (Issue #109, the first of four). Some teams test every change in a staging (or QA)
branch before it reaches the default branch. Huddle learns that flow in four Issues that go out together in one release
(0.8.0), because the first alone would ask a question that nothing uses yet.

**The flow, in short** (read this before H47 to H49):

1. `huddle.json` names the branch: `staging_branch`. With it set, an Issue's PR/MR targets the staging branch, not the default one.
2. An Issue is **done** when its PR/MR is merged into staging. `huddle land` closes it (the «Closes #N» link only fires on the
   default branch, so Huddle closes the Issue itself).
3. A **«tested in staging» marker** says that what is in staging was tried. It is required before the AI Manager releases staging
   to the default branch with `/huddle-release`.
4. With `staging_branch` unset (absent or `""`), every behaviour stays exactly as it is today.

**What each Issue builds.**

| Issue | Builds | State |
|---|---|---|
| H46 (#109) | The key `staging_branch`: stored, validated, asked by `/huddle-setup` and `/huddle-update`. Nothing reads it for behaviour. | this Issue |
| H47 | The adapters: open a PR/MR against a given base. | next |
| H48 | The flow: `huddle land`. | next |
| H49 | The «tested in staging» marker and `/huddle-release`. | next |

**The key (H46).** `staging_branch` is an optional string in `huddle.json` and `huddle.schema.json`.

- Absent or `""` means no staging branch. `""` is how «none» is written as an answer (like `host`), so it passes the schema.
- `loadConfig` returns it normalised: `staging_branch: ''` when absent or empty, otherwise the name.
- It must differ from `default_branch`: `huddle.json: "staging_branch" must not be the same as "default_branch"`.
- It must be a plain branch name: no spaces, no leading `-` (it will be passed on the command line as `--base`), no `..`, not
  ending in `/` or `.lock`. The error names the field.

**Asked.** `/huddle-setup` asks, after the default branch: «Does the project have a staging (or QA) branch where changes are
tested before they go to <default branch>? Give its name, or none.» (`--staging-branch`; `none` is written as `""`). Running setup
again keeps an answer already given. `/huddle-update` asks it of a repo that has no `staging_branch` key (§17: id
`staging-branch`, `since: 0.8.0`, default `""`); a repo that answers «none» gets `"staging_branch": ""`, so it is not asked again.

**Not in H46:** any use of the key, the `doctor` checks, the PR templates, a label, a new skill. The question is registered with
`since: '0.8.0'`; if H46 had to go out alone, it would stay out of `QUESTIONS` until the release.
