# Huddle as an open-source Claude Code plugin: design

**Name:** Huddle: Decision-led development for teams coding with AI
**Status:** approved by the Coach (2026-11-05)
**Repo:** `SrProfessional/huddle`, public, MIT license, English only.

**The two roles (Issue #166, 2026-11-15).** The person who writes the Issues, answers the decisions, reviews and merges is the **Coach**;
the people who work on the Issues with a Claude Code session, code or design, are the **Players**. Until 0.8 they were called «AI
Manager» (which read as «an AI that manages») and «developer» (which left out the designers). In a huddle the coach calls the play and
the players run it, and the main command is already `/huddle-play`. The key `ai_manager` in `huddle.json` and the label «changes
requested from AI Manager» of older repos keep working (§6, §22); the released sections of the CHANGELOG keep the old names.

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
- Each Issue carries a «Prompt for Claude Code» block that the Player pastes into a new session.
- One person, the **Coach**, hands out Issues, answers decisions, reviews and merges. Only that person touches
  production and secrets.
- Every change to an Issue goes through a Huddle session (creating, editing, closing, reopening, merging); nobody does it by hand on the website (§22). The session
  runs `huddle labels` afterwards, and the next session that opens repairs the board if someone did.
- The Player's session never drops a requirement silently. If it cannot go on, it stops with a «❓ Decision for the
  Coach» comment.
- The status of each Issue lives in labels: `ready`, `assigned`, `in progress`, `in review`, `blocked`, `needs decision`,
  `changes requested from Coach`. A job updates them from each Issue's «Depends on» section.
  `needs decision` and `changes requested from Coach` are stop labels (Issue #85): while one is on, `in progress` and `in review` are off, and the
  usual status comes back once the request is taken or the question is answered.
- With a staging branch (§21) there is one more label, `tested in staging`. It is not a status label: it is not renamable, `closedCleanup` leaves it on closed Issues, the labels job
  only removes it from an **open** Issue, and `huddle land` removes it when it lands a PR. It shows a comment (the evidence); the gate never reads the label.
- After opening its PR, the session waits in the background for the Coach's review and continues on its own. When
  Claude Code is reopened, a hook says whether a request is pending.

## 4. Packaging: a Claude Code plugin

A plugin, not a plain skill: only a plugin can ship the SessionStart hook together with the skills.

```
huddle/
  .claude-plugin/plugin.json      name, version, description
  skills/
    huddle-setup/SKILL.md         installs Huddle in a repo (asks the platform, host, Coach, team)
    huddle-play/SKILL.md          a Player starts an Issue, or picks it up again after the Coach answered it
    huddle-issue/SKILL.md         the Coach writes a new Issue from the template
    huddle-review/SKILL.md        the Coach reviews a PR/MR and posts the request or merges
    huddle-decide/SKILL.md        the Coach answers a «needs decision»
    huddle-watch/SKILL.md         the Coach's session checks every few minutes what waits for it and reviews it
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
| «Before starting a task», «When the Coach must decide», «The Coach role» | Migrations (rule 8), Node 24, Neon and production names |
| `scripts/huddle/*` and their 29 tests | Example data that teaches English (rule 7) |
| The Issue and PR templates, the labels workflow | `docs/equipo/migraciones.md`, `conocimiento.md` |
| The generic parts of `docs/equipo/README.md`, `roles.md`, `primer-dia.md` | The project's own notes in those files |

**How the rules get into a repo:** `huddle-setup` writes them into the repo's `CLAUDE.md` between
`<!-- huddle:start v1 -->` and `<!-- huddle:end -->`. An update replaces only that block, so the project's own text is never
touched. The block refers to `huddle.json` for names (the Coach, labels), never to SocialCortex.

**The same block in `AGENTS.md` (Issue #200).** OpenAI Codex reads `AGENTS.md`, not `CLAUDE.md`, so `huddle-setup` and `huddle-update`
write the same block, with the same markers, into both files at the repo root (the result says `claudeMd` and `agentsMd`: created, inserted
or updated). A repo set up before gets `AGENTS.md` on its next `/huddle-update`. Both files are built before anything is written, so a file
with half a marker stops setup with nothing changed and names that file. Codex reads at most 32 KiB of `AGENTS.md` text in all; the block is
about 7 KB, and a test keeps it under 16 KiB. Its heading says «Claude Code or Codex».

## 6. Configuration: `huddle.json` at the repo root

Replaces `docs/equipo/team.json`. No secrets ever go in it.

```json
{
  "$schema": "https://raw.githubusercontent.com/SrProfessional/huddle/main/huddle.schema.json",
  "platform": "gitlab",
  "host": "gitlab.example.com",
  "project": "team/app",
  "coach": "santiago",
  "assignees": ["ana", "luis"],
  "max_open_per_person": 2,
  "default_branch": "main",
  "staging_branch": "staging",
  "labels": { "changes": "changes requested from Coach" }
}
```

- `platform`: `github` or `gitlab`.
- `host`: empty means github.com or gitlab.com.
- `project`: `owner/repo` on GitHub, or the project path (groups allowed) on GitLab.
- `coach`: the login of the Coach. Required. Older repos have `ai_manager` (the name before Issue #166): it is still read, and when both are
  set they must name the same login. Setup writes `coach` on a new repo and leaves an existing `ai_manager` as it is. The code reads it
  in one place (`coachOf` in `lib/cli/config.mjs`), so a list of Coaches (one per area) can come later.
- `default_branch`: the branch Issues are merged into (default `main`).
- `language`: optional (Issue #209); the language the sessions chat in with the team, for example `es`. Absent or `""` means each
  person's machine language. A person's own choice wins: `huddle language <lang>` (a file of their own, `~/.huddle/language.json`, read by
  Claude Code and Codex alike) or Claude Code's `language` in `~/.claude/settings.json`. The order, first that is set: the person's, the
  team's, the machine's locale (`Intl`). The session-start hook names it in one line of context, in both tools; when the person writes in
  another language, the session answers in theirs. `huddle language` prints it and where it came from; `--clear` removes the person's own.
- `staging_branch`: optional; the branch where changes are tested before they go to the default branch. Absent or `""` means none
  (today's behaviour). Stored and validated only for now; see §21.
- `labels_job`: optional; how the cloud labels job runs: `sessions` (the default when absent), `hourly` or `events`. Never asked:
  only written by hand. See §23.
- `labels`: optional renames. The defaults are the seven labels of §3.

**On a branch with no `huddle.json` (Issue #179).** A branch made before Huddle was set up has no `huddle.json` (and no Huddle block in
`CLAUDE.md`), but the repo is set up on its default branch. The root is found inside the git repo only (`findRoot` stops at
`git rev-parse --show-toplevel`, so a worktree under `.claude/worktrees/` never takes the main checkout's file). With no file there, the
config is read from the default branch with git and no network: `git show <ref>:huddle.json`, where `<ref>` is what `origin/HEAD` points
to, else `origin/main`, else `origin/master` (`defaultBranchFile` in `lib/cli/config.mjs`). It is validated the same way, the commands
print one line on stderr («this branch has no huddle.json; using the one on origin/main»), and `huddle doctor` says which copy it read.
`huddle update` and setup write only a real file on the current branch: there they change nothing and say «this branch has no
huddle.json: update it from <ref> (git merge <ref>) or run /huddle-update from a branch made from it». The SessionStart hook says when
the branch has no Huddle block in `CLAUDE.md` but the default branch has one, and tells Claude to read it with `git show <ref>:CLAUDE.md`.
A repo whose default branch has no `huddle.json` either is still not set up.

`bin/huddle doctor` checks the setup: the file is valid, `gh`/`glab` is logged in to that host, the labels exist, and the
Coach can be found.

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
| `branchExists(name)` → boolean | `gh api repos/:o/:r/branches/:name`; only «Not Found» is `false`, any other failure is thrown | `GET /repository/branches/:name`; only a 404 is `false`, any other failure is thrown |
| `reviewInfo(n)` → `{ number, merged, base, body }` (§21) | `gh pr view <n> --json number,state,baseRefName,body,mergedAt`; an unknown number is the `notFound` flag | `GET /merge_requests/:iid` (`state`, `target_branch`, `description`); a 404 is the `notFound` flag |
| `mergedReviews(base, { limit })` → `[{ number, base, body, mergedAt }]` (§21) | `gh pr list --state merged --base <base> --limit <limit>`, sorted by `mergedAt`, newest first | `GET /merge_requests?state=merged&target_branch=<base>&order_by=updated_at&sort=desc`, sorted by `merged_at` |
| with `staging_branch` set (§21): `reviews`, `reviewsClosing(n)`, `issueForBranch(branch)` | the open PRs into staging whose body closes the Issue (one `gh pr list --base <staging>` per run) join `closedByPullRequestsReferences`; `issueForBranch` also reads the body of a PR into staging | `GET /issues/:iid/related_merge_requests` replaces `closed_by` (same one call per Issue, same `memo`); an MR is kept when it targets staging or the default branch and its description closes the Issue; `issueForBranch` reads the description of an MR into staging |
| with `staging_branch` set (§21): `issueState(n)` and `listMilestones()` `merged` | today's rule **or** a merged PR whose base is staging and whose body closes the Issue (a second, aliased `CROSS_REFERENCED_EVENT` timeline in the same GraphQL query) | today's rule **or** a merged MR into staging whose description closes the Issue (the same `related_merge_requests` read) |
| `reviewMerge(n)` → `clean`, `conflicting` or `unknown` (Issue #195, §19); a failed read is `unknown`, never an error | `gh pr view <n> --json mergeable` (`MERGEABLE`, `CONFLICTING`, else unknown) | `GET /merge_requests/:iid`: `has_conflicts` or `detailed_merge_status` `conflict`; `mergeable` (or `merge_status` `can_be_merged`) is clean |
| every call | retried on 429 (and 5xx except a POST), at most 3 tries and 60 s (`lib/platform/retry.mjs`) | same |

**The staging rule.** With `staging_branch` unset (`""`), the table above is exact: the same calls with the same arguments, the same
results. With it set, an Issue is «merged» when it is closed **and** (today's rule **or** a merged PR/MR whose base is the staging
branch and whose body closes it). A PR into staging that only mentions `#N` does not count, nor does a PR into any other base, nor
an Issue closed by hand with no such PR. The link is read by the pure function `closesIn` (§21).

Things that work differently on GitLab, and what Huddle does about them:

1. **No «closed as completed».** A dependency counts as merged only when a merged MR closed it. An Issue closed by hand
   does not unblock anything, the same rule as on GitHub.
2. **The CI does not react to Issue events.** The labels job runs on a pipeline schedule (every 10 minutes) and on every MR
   pipeline. `huddle-setup` explains how to create the schedule. A webhook is optional and can come later.
3. **The job needs a token.** `CI_JOB_TOKEN` cannot edit Issues. The Coach creates a project access token with the
   `api` scope and stores it as a masked, protected CI variable `HUDDLE_TOKEN`. Huddle only reads the variable: setting it
   up is a step for the Coach, described in the guide.
4. **Self-approval** may be disabled on GitLab, as on GitHub. The Coach approves with a comment, then merges.
5. **Notes include system notes** («added label …»). The adapter drops them before the core sees them.
6. **The «Closes #N» link** works on both, but on GitLab only for MRs into the default branch. The MR template uses `Closes #N`. With a staging branch (§21) neither platform links a PR/MR into it, so `huddle land` closes the Issue.

**The shared contract test:** one suite of scenarios (pending request, request already taken, dependency merged or closed
by hand, draft review, renamed label…) runs against both adapters. Each adapter gets canned `gh`/`glab` responses, so the
suite never touches a real GitHub or GitLab. Before each release, a smoke test runs by hand on a sandbox repo on github.com
and a sandbox project on gitlab.com.

## 8. Security

- Only the Coach's comments count as requests (by login, from `huddle.json`), as today.
- Tokens are never read from or written to files. Huddle uses the login of `gh`/`glab`, or `HUDDLE_TOKEN` in CI.
- The hook fails silently and quickly (timeout 45 s; quiet when offline).
- The skills never merge, deploy or change settings unless the session belongs to the Coach.

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

## 11. Things for the Coach

- Create the public repo `SrProfessional/huddle`.
- Get a gitlab.com account for the sandbox project of H9.
- Put the project access token in place for that project (H9).

## 12. Progress

A team sees how far each part of its project has come, as a percentage, and the total. It works for any project on GitHub
or GitLab and asks nothing specific of one team. Decided by the Coach on 2026-11-06 (Issue #28).

**Areas are milestones.** A project has areas (for example «Social networks», «Content» and «Ads»); each Issue goes in one
milestone, on GitHub and on GitLab alike. The progress code only reads milestones. Creating and editing them, and putting Issues in them, is the job of `huddle areas`
(Issue #42), and only after the Coach's OK: the skill `/huddle-areas` proposes the areas, the estimates and the
classification, and the CLI prints every change before writing it.

**The Issues not written yet count.** The Coach keeps an estimate of the Issues still missing in each area, in the
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
With a staging branch the milestone query reads 10 milestones per page (50 without one) with 100 Issues each and 100 references per Issue: GitHub refuses a query whose worst case (the `first:` values multiplied down a path) is over 500,000 nodes, and 50 x 100 x 100 plus the rest was 510,050; 10 x 100 x 100 is about 100,000, and the paging reaches the other milestones.

## 13. The session does every step it can

Asked by the Coach on 2026-11-08 (Issue #50). The Coach's own Claude Code session does every step it can, and
Huddle gives step-by-step instructions only for the steps that truly need the person.

**The rule.** Before a session hands a step to the Coach (or to a Player), it checks whether it can do the step
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
If you see something else: copy the whole list and send it to the Coach's session.
````

**Where it applies.** `/huddle-review` merges, tags and releases itself once its own session approved, and asks only for
the 🙋 steps. `/huddle-issue` marks the steps only a person can do with «🙋» and leaves every other step to the session.
The closing message of every skill says what the session did, and writes the next step as 🙋 steps when it is the person's.
The smoke test marks each step «Session» or «🙋 Only you», and `docs/team-guide.md` explains all of it.

**Never around a refusal.** If a permission is denied or a credential is missing, the session stops and asks, as always:
it never looks for another way.

## 14. Bugs

Asked by the Coach on 2026-11-09 (Issue #55). A bug has its own Issue type, so it carries what a task does not have:
evidence, a probable cause and the failing test to write first.

**Two ways a bug comes in.**

- **From the Coach.** The Coach describes it in plain words, with a capture or a link if there is one, and runs
  `/huddle-bug`. The session investigates without changing anything: it reads the code, searches for the error text, reads
  the recent commits of that area, runs the area's tests and reproduces the bug when the repo's own tools can. Then it
  writes the Bug Issue, shows the draft and creates it after the Coach's OK.
- **From anyone else** (a Player, a tester, a client with access). On GitHub, the person uses the «Bug report» form; on
  GitLab, the Bug template with the `needs triage` label. A report with `needs triage` is never `ready` and never assigned.
  The Coach runs `/huddle-bug #N`: it rewrites the report into the full Bug Issue, keeps the reporter's text under
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

Asked by the Coach on 2026-11-09 (Issue #58). A designer works a Huddle Issue from a Claude Code session, like a
Player, and makes the design with Claude Design inside that session.

**The Design template.** Every Task section, plus Screens, For whom, Visual guide, Content (real texts, never lorem ipsum)
and Deliverable. Its allowed files are always `design/<issue number>-<slug>/`: a Design Issue never changes code. Label:
`design`, created by `huddle labels`. The labels job treats a Design Issue exactly like a task.

**The flow.**

1. The designer pastes the Issue's prompt. The session creates the design as a Claude Design artifact, with the project's
   design system when one is set up (`/design-sync`, the Coach's step), or else the Issue's visual guide.
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

Asked by the Coach on 2026-11-11 (Issue #76). Every Issue's session works in its own worktree in `.claude/worktrees/`
(a Coach's review adds `rev-*` ones), and nothing removed them. In a project with dependencies each carries its own
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
   `origin/HEAD`, then `origin/master`; when none resolves, **nothing is removed**. With `staging_branch` set (§21) the base is `origin/<staging_branch>` and nothing else: an Issue's work is finished when it is merged into staging, and a fallback to the default branch would remove work that has not reached staging. A squash merge is not detected, so that
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

Asked by the Coach on 2026-11-11 (Issue #81). `/huddle-setup` is a first-install flow; after a release the only way to
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
needs a new answer adds its entry: `staging-branch` (`since: 0.8.0`, §21), `language` (`since: 0.9.6`, §6, Issue #209). 0.8.0 also asked `labels-job` (§23); Issue #130
removed it, so it is never pending again.

**The command.** `huddle update [--check] [--dry-run] [--json] [--answer key=value ...]`. It needs no platform and no login:
only files, never the network.

- No flags: refreshes the block of `CLAUDE.md` and of `AGENTS.md` (§5), the templates and the labels job exactly as setup does (a template the
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
on a branch and open a PR/MR. Pending questions: it asks **only those**, in one message, in the Player's language, offering
the default, then runs `huddle update --answer ...`. It never asks for a token. The Coach's session does every step it
can (§13).

**One command (Issue #104).** `/huddle-update` does the whole update, so the person does not switch branch, open a terminal or run a
second command. Order: (1) the version notice; (2) the plugin: `claude plugin marketplace update huddle`, then `claude plugin update
huddle@huddle --scope project`, run in the project (if `claude` cannot be run from the session it goes on with the installed Huddle and
says to update with `/plugins` or the terminal and run `/huddle-update` again); (3) the files, in a worktree and branch of their own,
`huddle-update-<version>` from the up-to-date default branch, entered with `EnterWorktree`, running `huddle update --json` from the
**new** version's folder (a sibling of `${CLAUDE_PLUGIN_ROOT}`, found by `newPluginRoot` in `lib/core/update.mjs`), because the session
still has the old skills loaded; (4) the pending questions, as before; (5) the PR/MR, which a Player's session never merges and the Coach's session merges itself (Issue #147); (6) the
last line: `/reload-plugins` applies the new version in the open session, in the terminal and in VS Code. Since Issue #136 step (2) runs
every time, not only when the notice or `doctor` saw a newer release (the lookup is cached and can be hours late: on 2026-11-14 a cache
read that morning said 0.7.0 and a repo on 0.8.0 skipped 0.8.1). It runs `claude plugin marketplace update huddle`, reads
`claude plugin list --json`, and updates the `huddle@huddle` entry this project uses: a `project` entry whose `projectPath` is the repo
root (`--scope project`, run from there), else the `user` entry (`--scope user`); with neither it points to `/huddle-setup`. It was tried on a real project:
`claude plugin update` from a second terminal, then `/reload-plugins` in the open session, and the skill added by the new version showed
up, in both. «Restart Claude Code» (and «Player: Reload Window» in VS Code) is the fallback only. A plugin updated from the `/plugins`
dialog applying by itself was not tried, so no text says it. `huddle update` itself does not change. The first update to a version
that has this skill is done the old way, since the installed `/huddle-update` is the old one. Texts never say «open a new session» after an
install or an update; a test walks the docs, the skills, the site and the CLI strings for it.

**Where a repo is told it needs it.**

- `huddle doctor` has a `setup` line: ✔ `set up for 0.4.2 (up to date)`; ⚠ `set up for 0.4.1, Huddle is 0.4.2: run
  /huddle-update` (when `update --check` would change something or has a question); ✔ with a note when only the
  version differs and nothing would change. It reads files only.
- The update notice (`lib/core/update.mjs`) for the Coach says `/huddle-update`. The Player's notice is unchanged.

**What it never does.** It never overwrites a template the project edited, never changes a key of `huddle.json` it was not
given or does not own, never commits, never touches the network.

**Only what the person must do (Issue #147).** Seen on 2026-11-15: a 0.5.1 repo updated to 0.8.3 was told to run `huddle labels` once
and to send every Player the install routes, which read as missing steps; `huddle labels --dry-run` would have created 0 labels.

- `setup()` writes those two notes only on a **first install** (no `huddle.json` before the run). A refresh and `huddle update` leave them
  out: the labels exist (the session start's labels pass creates any new one) and the team installed Huddle already.
- `/huddle-setup` on a project already set up: with `huddle.json` here, `huddle doctor` tells the Coach from a Player; a Player
  is told «This project already uses Huddle; its Coach is <login>…» (type `/reload-plugins`, work with `/huddle-play <n>`) and nothing
  changes. With no `huddle.json` here, it first looks at the remote's default branch (`git show origin/HEAD:huddle.json`, else `origin/main`,
  else `origin/master`, after `git fetch origin`): if the file is there, an old clone is told to update its copy, so it never becomes a
  first install that offers the Player's own login as Coach. A failed fetch is said in one line and setup goes on.
- The Coach's session merges the update PR/MR itself, without asking (asked by the Coach on 2026-11-15: asking was one more
  step for nobody's benefit). The Coach typing `/huddle-update` is the order (nothing runs it by itself): merge commit, branch kept. A refused
  merge (branch protection, a required review) stops with one line, never another way. A Player's session still never merges.
- `/huddle-update`'s last line says the project's Huddle files apply to every branch once its PR/MR is merged into the default branch
  (older branches get them when updated from it), and that the plugin itself is per machine, not per branch.

## 18. One command to work on an Issue: `/huddle-play`

Asked by the Coach on 2026-11-11 (Issues #83 and #100). Issue #83 split the work in two commands: one to start an Issue and
one to pick it up again after the Coach answered. Two names for «work on this Issue» confuse people (which
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
   changes nothing, and offers to wait (`huddle wait <n>`). Pending: it runs `huddle take <n>` (it marks the request 👀 and prints the Coach's prompt) and follows that prompt with the same rules. Only comments by the `coach` login count. The Player is told which
   request it is and is **not** asked to paste anything. It pushes, comments «Ready for review again» with the real counts (none for a design
   Issue), never touches the status labels, and starts `huddle wait <n>` again.
3. It closes with the usual message («✅ Issue #N finished» or «⛔ Issue #N stopped»), the link, the counts, what was not done and the next
   step (a step the session takes, or 🙋 steps), as in §13. «Who does each step» stays as it is.
4. **After a decision question (Issue #151).** «When you cannot go on» ends with «⛔ Issue #N stopped: waiting for a decision» and then starts
   `huddle wait <n>` in the background, as after the PR/MR and after «Ready for review again»: `/huddle-decide` answers with a «Prompt for
   Claude Code» comment, which `wait` already takes as a pending request, so the session continues by itself (`huddle take <n>`). Before, no
   wait ran there and the Player had to type `/huddle-play <n>`. A stop for a dependency («waiting for #X») starts no wait: there is no
   comment to wait for.

Nothing else about the flow changes: `huddle pending`, `huddle take`, `huddle wait`, the labels and the review prompts stay as they are. Only
the name the person types changes.

**The Coach's prompt.** The first line of a «Prompt for Claude Code» comment (`huddle-review`, `huddle-decide`) is
`First run /huddle-play <n>: it marks this request as taken (👀), so the Issue shows «in progress».`


## 19. Watching what waits for the Coach: `huddle queue` and `/huddle-watch`

Asked on 2026-11-11 (Issue #88). The Coach had to tell its session to look at the PRs and questions that wait for it. One
command now starts a check every few minutes inside the Coach's Claude Code session, and a read-only CLI command lists what waits.

**What waits for the Coach.** Three cases, taken from the same data `huddle labels` reads (the open Issues, the open non-draft
PRs/MRs and `requestState`), **not** from the label text, so the answer is right before the labels job runs:

- `review`: an open Issue with an open, non-draft PR/MR whose request state is `null` (the work is done and nobody asked for changes:
  the «in review» status of `statusOf`). A pending or taken request is the Player's turn, not the Coach's.
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
Waiting for the Coach:
  #42  review    PR #51   Add login form
  #47  decision           Which payment provider?
  #53  triage             Login page crashes on Safari
```

or `Nothing is waiting for the Coach.` (on GitLab the reference reads `MR !51`). `--json` prints
`{ "waiting": [{ "issue": 42, "title": "...", "waits": "review", "pr": 51, "head": "<the PR's head commit sha>" }, ...] }`; `pr` and `head`
only for `review`. `head` comes from the adapter operation `reviewHead(n)` (§7), the head commit sha of PR/MR `n` (GitHub: `gh pr view <n> --json headRefOid`;
GitLab: `diff_refs.head_sha` of the MR), one call per `review` item. Each `review` item also carries `merge`, from the adapter operation
`reviewMerge(n)` (§7, Issue #195): `clean`, `conflicting` or `unknown` (GitHub: `gh pr view <n> --json mergeable`; GitLab: `has_conflicts`
and `detailed_merge_status` of the MR); a failed read is `unknown`, never an error of the queue. It is best effort: if one cannot be read, that item prints
`head: null` and one line goes to stderr (`huddle queue: could not read the head of PR #51 (Issue #42): <reason>`), and the exit is still 0.
Exit 0 when it ran, with or without items; 1 on a platform error, with one clear line; 2 on a bad flag. A repo without `huddle.json`
gets the same «not configured» error as the other commands.

**The skill `/huddle-watch [interval|off|status]`.** For the Coach only: it runs `huddle doctor` first and stops with a clear line
if the login is not `coach`.

1. **On** (no argument, or an interval such as `5m`; default 2 minutes, allowed 2 to 60). If this session already runs the watch's
   background wait, it is already on and no second one starts. **Check now (Issue #107):** the session runs the full `huddle labels` and
   then `huddle queue --json` once and handles what it lists (step 3 and 4); when nothing waits it says «Nothing is waiting for the Coach.», so the person sees that it ran. **Then it waits in the background (Issue #157).** Until 0.8.5 the watch was a recurring job
   (`CronCreate`): each tick woke the session for a Claude turn that re-read its context only to run `labels` and `queue`, and most ticks
   found nothing; the job also expired after 7 days. Now the session starts `huddle queue --wait <seconds> --seen <keys>` as a background
   command, the way a Player's session runs `huddle wait`. Each round, that Node loop reads the queue **first** and ends as soon as an
   item not in `--seen` waits, printing `{ "waiting": [...] }` with the new items; only a round where nothing new waits runs the full labels
   pass (quietly; Issue #120, §22: local and free, so the board is right every few minutes even for what nobody's session handled; a
   failure does not stop it). Found in staging on a real project: the labels pass took 4m46s and the queue 15 s, so running the labels
   first made every wake about five minutes late. The session handles
   them and starts the wait again. Keys: `<pr>@<head>` for a review that stopped (a new commit makes it new again) and `#<issue>` for a
   decision or a triage already said. Interval: default 120 seconds (Issue #243: each review round lost up to 5 minutes to the old default; the wait spends no Claude tokens, and the full labels pass still runs at most every 15 minutes), 120 to 3600. It refuses a login that is not `coach`. The API
   use per hour is the same as the old job at the same interval; the Claude tokens while nothing waits go to zero.
2. The first message says that **turning the watch on is the Coach's order to review and merge, as if they asked for each review**,
   that it uses no Claude tokens while nothing waits, and what stops it (`/huddle-watch off`, or closing Claude Code, because the wait
   lives only in the session; it needs the session open and the computer on). Nothing turns it on by itself.
3. **`review`:** `/huddle-review` on that PR with its usual rules: all good, approve and merge; changes needed, the «🔁 Changes
   requested» comment. Either way the item leaves the queue by itself. If the review **stops** (a failing test, a missing requirement, a
   merge the platform refuses, a missing permission) the watch says it once, with the reason, and does not try that PR with that `head`
   again; a new commit changes `head` and makes it a new item.
4. **`decision` and `triage` are never answered by the watch:** they are the person's decisions. One line per new item, once per Issue.
5. **Off:** `huddle queue --wait-off` leaves a stop mark for this repo (next to the update cache, never in the repo); the waiting loop finds
   it at its next round, clears it, prints `{ "stopped": true }` and ends, so off works even when the session lost the background command's
   ID (it also stops the command when it knows the ID). A new `--wait` clears an old mark. Nothing running: it says so. **Status:** whether
   this session runs the wait, its interval, and whether «always» is set.
   **Always (Issue #160, asked by the Coach on 2026-11-15).** With no Claude tokens while nothing waits, the only reason left to turn
   the watch on by hand each time is that it is the order to merge. `/huddle-watch always` gives that order once: `huddle queue --always`
   (Coach only) leaves a mark for this repo next to the update cache, on this machine only (never in the repo: no PR, nobody else
   affected), and turns the watch on. At each session start, when the login is `coach` and the mark is set, the hook adds one line
   («Huddle: the watch starts now, as you asked (/huddle-watch always). /huddle-watch off stops it.») and a context that tells Claude to
   start the watch before anything else, as `/huddle-watch` does; it replaces the start line's «act on nothing until asked», since that
   order was given, while the line about what waits still shows. A hook's context reaches Claude with the person's first message, so the
   watch starts then. `/huddle-watch off` (`--wait-off`) also clears the mark. A Player's login never starts it.
6. «Who does each step», and every command in the full `node "${CLAUDE_PLUGIN_ROOT}/bin/huddle"` form.

**The start line (Issue #138).** With the watch off nothing told the Coach what waits. When the login is the `coach`, the
SessionStart hook (`huddle hook`) reads what waits with the same computation as `huddle queue` (`waitingItems` in `lib/cli/run.mjs`,
without the head commits), in parallel with its other reads and inside its time limit, and adds one visible line first, for example
«Huddle: 4 things wait for the Coach: PRs to review #51, #52; a decision on #47; a bug report to triage #53. Type
/huddle-review <pr>, or /huddle-watch to let this session check by itself.» (`MRs` and `!` on GitLab). Its `additionalContext` tells
Claude to say it first, in the person's language, and to review, merge, answer or triage nothing until the person asks: the line only
informs, because turning the watch on is the order to merge and that stays the Coach's explicit act. Nothing waiting, a Player's
login, no login or a failed read: the hook adds nothing. The login is read once for this line and the update notice.

**What waiting costs.** A Player's waiting session (`huddle wait`) is a Node process on their computer that asks the platform every
two minutes with their own login: no Claude tokens and no CI minutes while it waits. Since Issue #157 `/huddle-watch` waits the same way
(`huddle queue --wait`): no Claude tokens while nothing waits; the session's model works only on what waits. The guides and the website
say both.

**Faster review rounds (Issue #244, decided 2026-11-21).** Each round used to run the whole suite twice (the Player before pushing, the Coach
again in a clean copy), about 8 minutes of tests for even a one-line change. Now, and never CI (its minutes end up paid, so no workflow is added
or widened, for this repo or a project's): the Coach reads the change first and runs the full suite **only when it is about to approve**; when it
already has something to ask for, it asks without running the tests, since another round follows anyway. Before any approval and merge the
full suite runs in a fresh worktree on the exact head it merges (the watch's recheck too): never a merge without that run. A docs-only round
(the delta since `Reviewed head:` touches no code and no test) is approved without a new run, saying so in the review: the head's last full run
by the Coach, in an earlier round of the same PR, stands. The Player runs the tests of the area it touches while it fixes and the full suite once,
right before pushing, after merging the base; the counts it reports are that last full run's.

**Not here:** answering decisions or triaging bugs on its own, desktop or phone notifications, a cloud routine that runs with the
computer off, starting the watch when a session opens, a cheaper model for the reviews (the review and the merge are the steps that need
the most judgment).

## 20. The version notice inside the skills: `huddle notice`

Asked on 2026-11-11 (Issue #91). The SessionStart hook's «newer Huddle» notice (§17's update cache, Issue #65) is shown at most once every
24 hours per machine, and only where the client shows the hook's message. A terminal session can use up the day's notice, and a VS Code
session then shows nothing. A skill runs in the chat, so what it says is seen in every client.

**`huddle notice [--json]`.** Read-only, and it needs no login. It uses the same release lookup as the hook (`latestRelease`: cached for a
day, 3 seconds at most; since Issue #136 a cached answer lower than the installed version is stale and looked up again, and the
`version` line of `huddle doctor`, run on purpose, looks up first with `{ fresh: true }` and falls back to the cache) and the same text (`noticeText`, with the Coach's extra line when `isManager()` says so, as the hook asks it:
only when there is something to show; with no `huddle.json` or no login nobody is the Coach). It prints the text when a newer
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
`version` line of `huddle doctor` say `claude plugin update huddle@huddle --scope project`, run inside the project. Since Issue #143 they
name the scope Huddle is really installed in: `installScope(ctx)` in `lib/core/update.mjs` reads Claude Code's
`<CLAUDE_CONFIG_DIR or ~/.claude>/plugins/installed_plugins.json` (`ctx.installedPluginsPath`), a local file read once. A `project` entry
for the repo root (compared without case and with either slash) keeps `--scope project`; otherwise a `user` entry gives `--scope user`
(«Huddle is installed for your user on this machine»); no file, an unreadable one or no Huddle entry falls back to `--scope project`.
`claude plugin marketplace update` has no scope. The team guide says: update inside each project where Huddle is used, open a new
session, and that a project can be on an older version than another.

**Not here:** the hook's own notice (unchanged), a skill that runs the update by itself, a `doctor` line about several installations, and
finding out why the hook's notice does not show in VS Code.

## 21. A staging branch: first staging, then production

Asked by the Coach on 2026-11-13 (Issue #109, the first of four). Some teams test every change in a staging (or QA)
branch before it reaches the default branch. Huddle learns that flow in four Issues that go out together in one release
(0.8.0), because the first alone would ask a question that nothing uses yet.

**The flow, in short** (read this before H47 to H49):

1. `huddle.json` names the branch: `staging_branch`. With it set, an Issue's PR/MR targets the staging branch, not the default one.
2. An Issue is **done** when its PR/MR is merged into staging. `huddle land` closes it (the «Closes #N» link only fires on the
   default branch, so Huddle closes the Issue itself).
3. A **«tested in staging» marker** says that what is in staging was tried. It is required before the Coach releases staging
   to the default branch with `/huddle-release`.
4. With `staging_branch` unset (absent or `""`), every behaviour stays exactly as it is today.

**What each Issue builds.**

| Issue | Builds | State |
|---|---|---|
| H46 (#109) | The key `staging_branch`: stored, validated, asked by `/huddle-setup` and `/huddle-update`. Nothing reads it for behaviour. | done |
| H47 (#111) | The adapters understand staging: they read the Issue link from the PR/MR body, give the «merged into staging» evidence, `branchExists`, and the `doctor` check. | done |
| H48 (#114) | The flow: branches start from staging, PRs target it, `huddle land` closes the Issue when its PR is merged there, the labels job warns about one that is still open, `huddle clean` judges by staging. | done |
| H49 (#115) | The «tested in staging» marker, `huddle tested`, `huddle release`, the gate and `/huddle-release`. | done |

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

**How the link is read (H47, #111).** GitHub and GitLab link a PR/MR to an Issue, and close it, only when it targets the **default**
branch. A PR into staging gets no link at all (GitHub: «the keywords are ignored, no links are created»), so with `staging_branch`
set the adapters read the link themselves. Without it, nothing changes: the same calls, the same results.

- **`closesIn(text, project)`** (`lib/core/closes.mjs`, pure). The Issue numbers a PR/MR body closes with the platform keywords
  (`close`, `closes`, `closed`, `fix`, `fixes`, `fixed`, `resolve`, `resolves`, `resolved`, any case) followed by `#N`, or
  `owner/repo#N` when that is this project. A bare `#N` is a mention, not a link. Anything inside an HTML comment, a fenced code
  block or inline code is ignored (the templates carry `Closes #N` hints there). No duplicates, ascending.
- **«Merged».** `merged = closed AND (today's rule OR a merged PR/MR whose base is staging_branch and whose body closes #N)`. It is a
  union, so existing projects and hotfixes straight into the default branch keep working. An Issue closed by hand with no such PR is
  not merged.
- **GitHub.** `issueState` and `listMilestones` add a second, aliased timeline (`CROSS_REFERENCED_EVENT`) to the query they already
  send and apply the rule exactly per Issue (a further page is read when an Issue is mentioned by more than 100 PRs). `reviews` and
  `reviewsClosing` add the open PRs into staging whose body closes the Issue: one `gh pr list --base <staging> --state open` per
  run, not per Issue. `issueForBranch` reads the body of the open PR of that branch when its base is staging.
- **GitLab.** `GET /issues/:iid/related_merge_requests` replaces `closed_by`: it lists the MRs that mention the Issue with their
  target branch, description and state. One is kept when its target is staging or the default branch and its description closes the
  Issue. The cost is the same (one call per Issue, through the same `memo` between `beginRun()` and `endRun()`). `issueForBranch`
  reads the description of an MR into staging instead of `closes_issues`.
- **`branchExists(name)`** (new operation): whether the remote has the branch. Only «not found» is `false`; any other failure is thrown.
- **`huddle doctor`**, with `staging_branch` set, adds one line: ✔ «branch X exists on the remote», or ✖ with the fix (create it, or
  run `/huddle-update` to change the answer). A failed lookup (offline) is a ⚠. Unset, the doctor prints what it always printed.

**The flow (H48, #114).** With `staging_branch` set, an Issue's work goes **into staging**, and the Issue is **done when its PR/MR is merged there**.
Unset, nothing below applies and every command, text and call stays as it was.

- **Where branches start and where PRs go.** The Issue's branch starts from the up-to-date staging branch and its PR/MR is opened **against** it,
  with `Closes #N` in the body (`/huddle-play`). `/huddle-issue` writes «from an up-to-date <staging> (the default branch when there is no staging)».
  `/huddle-review` refuses to merge an Issue PR whose base is not staging: it asks for it to be retargeted.
- **Two adapter operations** (both platforms, §7). `reviewInfo(n) -> { number, merged, base, body }` (GitHub `gh pr view <n> --json number,state,baseRefName,body,mergedAt`;
  GitLab the MR: `state`, `target_branch`, `description`; an unknown number carries the `notFound` flag of #99). `mergedReviews(base, { limit }) ->
  [{ number, base, body, mergedAt }]`: the merged PRs/MRs into `base`, newest merge first, at most `limit` (default 50); the warning below uses it, and so will H49's release list.
- **`huddle land <pr> [--check]`.** Coach only (`adapter.me()` is `coach`; otherwise «only the Coach lands a PR», exit 1). With no
  `staging_branch`: «no staging branch is set: nothing to land», exit 1. `--check` changes nothing: it prints `ok: PR #<pr> (base <staging>) closes #<n>, #<m>`
  or the first problem and exits 1 (the PR does not target staging, its body has no closing keyword, or an Issue it names is not an Issue); a PR still open is fine
  for `--check`. Without `--check` the PR must be **merged** and its base must be staging, else it refuses with the reason. Then, for each Issue `closesIn(body)`
  names: if it is open, `closeIssue(n, { reason: 'completed' })` and «closed #<n>»; if it is closed, «#<n> was already closed». So it is idempotent, never
  reopens, and never touches an Issue the PR does not name. All the Issues are looked up before the first is closed. Exit 0 when it ran, 1 on a refusal or a
  platform error (one line), 2 on a bad argument. `/huddle-review` runs `land <pr> --check` before the merge and `land <pr>` right after it, then the labels pass.
- **The labels job warns, it does not close.** In the full `huddle labels` run, for each open Issue that a PR from `mergedReviews(staging)` closes, one line:
  `warning: #<n> is open but PR #<p>, merged into <staging>, closes it: run huddle land <p>, or it was reopened on purpose`. It never closes an Issue by itself,
  so an Issue reopened after a failed test in staging stays open.
- **`huddle clean`.** Its base for «merged into» is `origin/<staging_branch>` (§16), so the worktree of an Issue merged into staging is cleaned.
- **Meta PRs** (setup, update, team) keep targeting the default branch: they change the repo's Huddle files, not an Issue's work, and have no Issue to land.

**Not in H48:** the «tested in staging» marker, `/huddle-release`, the release PR from staging to the default branch and the back-merge of a hotfix (H49), and the
real-platform checks above.

**The marker and the release (H49, #115).** With `staging_branch` set, nothing reaches the default branch (production) until the Coach has seen that **every
Issue in staging was tested there**. Unset, the commands say «no staging branch is set» and nothing else changes.

- **The marker.** The evidence is a **comment**, `✅ Tested in staging`; the label `tested in staging` is only its visible projection. A comment counts only when its author is
  `coach` or a login in `testers` (a new optional list in `huddle.json` and its schema, empty by default); a Player's comment never counts. `huddle tested <issue>`
  (Coach only) posts the comment and adds the label. It refuses with «no staging branch is set», a caller who is not the `coach`, an Issue that is **open**
  (it has not landed, §21 H48), and an Issue that no PR merged into staging closes. A `testers` login may write the same comment by hand in the web page.
- **The label** is a separate constant (`TESTED_LABEL`, like `DESIGN_LABEL`), **not** one of the seven `LABELS`, so `closedCleanup` leaves it on the closed Issues it lives on. It is not
  renamable. `ensureLabels` creates it only with staging set. The labels job removes it from any **open** Issue (reopened means not tested) and `huddle land` removes it from every
  Issue it lands.
- **Validity.** An Issue is tested iff a valid comment is **newer than the `mergedAt` of the latest merged staging PR that closes it**. A fix after the test (reopen, new PR, land)
  invalidates it by itself, even if the label was left on: **the gate reads dates, never the label**. A fix under another Issue (a Bug) is its own Issue and needs its own marker;
  Huddle does not try to attribute by files.
- **What is in staging and not yet released** is computed, never stored: the merged PRs into staging (`mergedReviews(staging, { limit })`, which now carries `mergeSha`, GitHub
  `mergeCommit.oid`, GitLab `merge_commit_sha`) whose merge commit is **not an ancestor** of `origin/<default_branch>` (`git merge-base --is-ancestor`, as `huddle clean`
  does), and the Issues they close (`closesIn`). This needs the release PR to be a **merge commit**, never squash or rebase; Huddle already merges with `--merge`.
- **`huddle release [--json]`** (read-only) lists the staged Issues as `{ issue, pr, tested, by, at }`, the untested ones, and **two warnings** when they apply:
  (1) `stray-commits`: staging received commits that belong to no listed Issue after the newest test (the first-parent history of staging that the default branch lacks; a hotfix or
  a back-merge), so the Coach must confirm them; (2) `default-ahead`: the default branch has commits that are not merges and that staging lacks (a hotfix went straight to
  production), so a **back-merge** PR from the default branch into staging must be merged first. Merge commits are not counted for (2), because the release PR itself leaves one on
  the default branch. Exit 0 when it ran, 1 on a platform error, 2 on a bad argument.
- **`huddle release open`** (Coach only; new adapter operation `openReview({ base, head, title, body }) -> { number, url }` on both platforms) opens the PR/MR from staging into
  the default branch. It **refuses** while any staged Issue is untested (naming them), while the default branch is ahead of staging, and when nothing is staged.
  `--untested <n> --reason "<why>"` lets one named Issue through (repeat the pair for more); a reason is required, it is written in the PR body one line per Issue, and it may not hold
  a closing keyword. The body lists the Issues as plain `#N` with **no closing keyword**, so nothing is closed twice. There is no «leave an Issue out» in this version: it needs a
  revert in staging, conflicts when other Issues depend on it, and is a separate decision.
- **`/huddle-release`** (Coach only; `huddle doctor` first). In order: `huddle release --json` (and the back-merge first when the default branch is ahead); for each untested
  Issue, ask whether it was tested and run `huddle tested <n>` only on a yes; the project's **clean check** on staging (the one the project documents in its `CLAUDE.md`: a fresh
  worktree of `origin/<staging>`, a clean install, its test command; when none is documented it asks and never invents one; a failing suite stops the release); show the list and
  wait for the OK; `huddle release open`; merge with a merge commit only when the Coach says so in the same chat.
- **Branch protection.** A staging branch should have branch protection on the platform: nothing technical in Huddle stops a Player from merging into it. The label is cosmetic by
  design; the gate trusts only the comments by authorised authors.

**Not in H49:** «leave an Issue out» of a release (a guided revert), a PR check as a second form of the marker, the release notes and the tag (the Coach makes them as in
`/huddle-review`), and the real-platform checks of H47's open points (on a throwaway repo, before the release of the four). What the tests cannot confirm here either:
that `gh` and `glab` accept `POST pulls` and `POST merge_requests` with these fields, that `mergeCommit` is filled for a PR merged with `--merge`, and that `merge_commit_sha` is
filled on GitLab for a merged MR.

**What the tests cannot confirm** (no real platform in them; the Coach checks it on a throwaway repo with a staging branch
before the release): that GitHub creates a `CROSS_REFERENCED_EVENT` for a PR into a non-default base; that GitLab's
`related_merge_requests` lists an MR into a non-default branch and needs the «Closes #N» in the description; a self-managed GitLab with
a custom closing pattern; the size of the milestones query with the PR bodies.

## 22. The labels of one Issue: `huddle labels --issue <n>`

The full `huddle labels` reads the whole repo: every open Issue, their dependencies, the comments of each managed Issue and the list
of closed Issues. Run by a cloud job on every Issue, PR and comment event, that costs more included minutes than a small private repo
has, and when the minutes run out nobody's labels are updated. `huddle labels --issue <n> [--dry-run]` is the same job narrowed to
one Issue, so the session that moves an Issue (start, PR opened, stopped for a decision, merged) can keep the board right by itself,
with no cloud run for each event. The skills call it (Issue #120, H51, «who runs it and when» below); the labels job template that
makes the cloud job a cheap safety net is H52.

**`n` must be a positive integer.** `--issue` with no value, a non-number or `0` prints the usage and exits 2. Without `--issue`
nothing changes: the full run reads and does what it always did.

**The scope.** What the run reads and changes:

- `n` is **open**: `n` alone. It never assigns, and the «Huddle progress» Issue is not touched.
- `n` is **closed**: the open Issues that list `#n` under «Depends on» (found in the list of open Issues the full run already reads),
  plus `n` itself for its own cleanup. It assigns what comes out `ready`, and rewrites the progress Issue (a merge moves the
  percentages).
- `n` is **not an Issue** (a PR/MR number, a typo, a deleted Issue): one line on stderr, exit 1, nothing changed.
- `n` is open and has **no «Depends on»** section (not managed by Huddle): one line, nothing changed, exit 0.

**What it does for the Issues in scope, with the code of the full run** (restricted, not copied): reads the state of their
dependencies and nothing else; reads where the Coach's requests stand (comments and commits of the scope only); sets the status
labels and the two request labels with the same rules; when `n` is closed, takes its stale Huddle labels off. For that cleanup the
adapter has one more operation, `issueLabels(n)`, which reads the labels of one Issue in any state, so the list of closed Issues is
not read. The Issues are found with the same «Depends on» parser.

**Only the Coach assigns.** With `n` closed, the run assigns a `ready`, unassigned Issue of the scope by the same rule as
today (fewest open Issues, the cap `max_open_per_person`) only when the login of the caller (`adapter.me()`) is `coach` in
`huddle.json`. For anyone else it prints «assignment skipped: only the Coach assigns» and goes on with the labels.

**What it never does.** Read the comments of an Issue outside the scope, change the label of an Issue outside the scope, create
labels (the full run does; `huddle doctor` reports a missing one), or touch the project's other Issues. With `--dry-run` it prints
what it would do and changes nothing. It prints the lines the full run prints for what it changes, then `N label change(s).` Exit 0
when it ran, 1 on a platform error (login, network, rate limit) with one clear line, 2 on a bad argument.

**Who runs it and when (Issue #120, H51).** In every skill the command is `node "${CLAUDE_PLUGIN_ROOT}/bin/huddle" labels --issue <n>`, `n` the
Issue of the work. It is **best effort**: if it fails (no permission to edit labels, the platform is unreachable) the session says one line
with the reason and goes on; it never stops or blocks the task and never asks the person anything. The cloud job, or the next session,
catches up.

| Session | Skill | Runs `labels --issue <n>` right after |
| --- | --- | --- |
| Player | `huddle-play` | the branch is created and `in progress` added; `huddle take` marks a request; the PR/MR is opened; it stops for a decision (after `needs decision` and the «❓ Decision for the Coach» comment); a fix is pushed and «Ready for review again» commented |
| Coach | `huddle-review` | «🔁 Changes requested» is posted; the merge (with a staging branch, `huddle land <pr>` first), when the Issue is closed |
| Coach | `huddle-decide` | the answer is posted (the command takes `needs decision` off) |
| Coach | `huddle-watch` | not per Issue: the full `huddle labels` runs before `huddle queue --json` in each tick and in the first check (§19) |

A Player's session never assigns (`--issue` with an open Issue does not) and never edits a Huddle label by hand: the command computes
them. For a closed `n` (after the merge) it recomputes the Issues that wait for it and assigns the ones that come out ready, which only the
Coach's login does. The `/huddle-setup` and `/huddle-update` block in `CLAUDE.md` says the same. **The cloud job is the safety net**,
unchanged by this Issue (its template and triggers are H52): both can run at once, since the command computes from the current state and
changes nothing that is already right.

**The full run stays the safety net.** A session only handles the events it sees. A PR merged from a phone, a label removed by hand
or an Issue closed on the web are caught by the next full `huddle labels`.

**The rule (Issue #125, H54).** Every change to an Issue goes through a Huddle session: creating it (`/huddle-issue`, `/huddle-bug`), editing it, closing it, reopening it, and merging its PR/MR. Nobody merges, closes, reopens or edits an Issue by hand on the website or from a phone. The session runs `huddle labels` after the change, so the board stays right with no cloud job.

Still fine by hand on the website: reading and commenting; the bug report form, for people with no session (it comes in as `needs triage` and waits for the Coach's `/huddle-bug`); and a tester's «✅ Tested in staging» comment (the release gate reads it). This is a rule, not a lock: Huddle puts no lock on the platform (branch protection is the project's own setting). If someone
breaks the rule, it is not a problem: the next session that opens repairs the board (below). `hourly` and `events` (§23) exist for a team
that wants a cloud run anyway; Huddle does not recommend them.

**Two gaps the rule would leave, closed.**

- **A new Issue gets its labels at once.** `/huddle-issue` and `/huddle-bug` run the **full** `huddle labels` once right after creating the Issue
  (for `/huddle-bug #N`, after rewriting the report and taking `needs triage` off): it puts `ready` or `blocked` on the new Issue and assigns
  it, which a scoped run never does for an open Issue. Best effort, as above.
- **Reopening has a written way.** Only the Coach's session reopens an Issue (for example one that failed its test in staging):
  `gh issue reopen <n>` (or `glab issue reopen <n>`) with a comment that says why, then `huddle labels --issue <n>` and the full
  `huddle labels` once, so the «tested in staging» label goes and the Issues that depend on it are blocked again. `huddle-review` and
  `huddle-release` say it. The fix is a new PR/MR on the same Issue.

**The board repairs itself when a session opens.** The SessionStart hook (`huddle hook`) starts `huddle clean` in the background (§16); in the
same way it starts a labels pass in the background, detached, so the session never waits for it and a failure never breaks the session start.

- The pass is the full `huddle labels` with a new flag, `--no-assign`: it recomputes every label from the real state of the Issues and
  PRs/MRs and **never assigns**. The hook adds `--no-assign` unless the login is the `coach` (only the Coach's session assigns, so
  two sessions that open at once cannot give one Issue to two people). `huddle labels --no-assign [--dry-run]` is usable by hand.
- It runs at most once every 10 minutes per repo and machine (a stamp file next to the update cache), so opening several sessions in a row
  does not repeat it.
- When it changed something, the **next** hook output or skill notice says one line: «Huddle corrected N label(s): something changed outside
  a session.» When it changed nothing it says nothing. The pass writes its count to a small file in the same cache folder (the hook passes
  its path in `HUDDLE_LABELS_COUNT_FILE`); the hook and `huddle notice` read it and clear it, so the line shows once.
- `"labels_on_start": false` in `huddle.json` turns it off (like `clean_worktrees`). With `labels_job` set to `hourly` or `events` it still
  runs: it is local and free.
- Offline or not logged in: silent, and nothing is written. The hook only starts the pass and returns; its time budget does not change.

**Cost on GitLab.** `listOpenIssues` reads `closed_by` once per open Issue, and the scoped run still lists the open Issues to find the
dependents of a closed `n`. A lighter read is possible if it proves too heavy; it is not part of this command.

**The session's own label, in the same run (Issue #153).** Seen on 2026-11-15 on a real project: a session added `in progress` and ran
`labels --issue` 5½ minutes later, so `assigned` stayed next to `in progress`; then it added `needs decision` and did not run it, so
`in progress` stayed next to the stop label until another session did. Two steps can be left half-done; one cannot. So the two labels a
Player's session sets are flags of the scoped run: `huddle labels --issue <n> --started` adds `in progress` and `--needs-decision`
adds `needs decision` (each under its `labels` name), then the same run recomputes `n`, which takes `assigned` (or `in progress`) off.
`--dry-run` writes nothing. Only with `--issue`, only one of the two (else exit 2), only on an open, managed Issue (a closed one: one line,
nothing changed). `/huddle-play` and the `CLAUDE.md` block use these flags and never say to add the label by hand. Each output line says
what goes on and what comes off (`#5 → in progress − assigned`, `#6 − in progress`); «(keeps its label)» hid a removal and is gone.

**`blocked` also means «waits for a shared file» (Issue #250).** `blocked` means «waits for a dependency or for a shared file». An assigned Issue whose start the scheduler (§24, the same `schedule` that `huddle next` uses) holds because it shares an allowed file with an active Issue of the same person (in progress, or with changes requested) gets `blocked` instead of `assigned`, keeps its assignee, and the run prints the reason: `#239 → blocked − assigned (waits for #5: shares lib/cli/run.mjs with #5)`; `huddle next` prints the same Issue and path. There is no new label. The labels run puts `blocked` on when the conflict starts and takes it off (back to `assigned`) when it clears, also when the blocking Issue goes to review or closes, since each run recomputes from the state. Active work is classified once, by `holdsFiles` (`lib/core/issue-status.mjs`), for the board and for `huddle next`: in progress (also a taken request), or a request that came back (pending) with no open dependency, even when its PR is open; an Issue only awaiting review, stopped for a decision or waiting for a dependency holds nothing. A scoped run on the blocker (`labels --issue n`, `--started`, or after it closes) also reconciles the assigned Issues that may wait for its files, so the start and the close move them with no other run. A wait for capacity alone, or for another candidate that has not started, is not a block: it stays `assigned`, because it is the Player's own load; and when the person is over capacity the scheduler gives capacity first, as `huddle next` does. The capacity used is what the Coach allows, never a Player's local lowering. This came from the board showing only `assigned` while `huddle next` held #239 (`lib/cli/run.mjs`) and #244 (`docs/design.md`) (#230).

**The old name of «changes requested from Coach» (Issue #166).** Until 0.8 the label was «changes requested from AI Manager». Both names are
read as the same label (`OLD_LABELS` in `lib/cli/run.mjs`), and the full `huddle labels` renames the old one on the platform once
(`renameLabel`, GitHub `gh label edit --name`, GitLab `PUT labels/:id` with `new_name`), before it creates the missing labels, so the
Issues that carry it keep it under the new name. A name the project set under `labels` in `huddle.json` is left alone.

## 23. The cloud labels job is a safety net: `labels_job` in `huddle.json`

Until 0.7 the labels job ran on **every** Issue, PR and comment event plus every 30 minutes (GitHub), or on every MR pipeline plus a
10-minute schedule (GitLab). On a private repo that was more than 1,000 runs in 13 days, enough to use up a small project's included CI
minutes, and when the minutes run out nobody's labels are updated. Since §22 the sessions keep the labels right themselves, so the cloud
job stops being the engine and becomes a cheap safety net, and each project chooses how much of it to run.

**The setting.** `labels_job` in `huddle.json` and `huddle.schema.json`: an optional string, one of

| Value | What runs in the cloud |
| --- | --- |
| `sessions` | **The default when the key is absent.** Nothing. The sessions (§22) keep the labels right: no cloud job and no CI minutes. `/huddle-setup` writes no labels job file. |
| `hourly` | The job runs once an hour and on a manual run, and on nothing else. A safety net for a team where changes may happen outside a session. |
| `events` | As before: every event, plus the schedule. For a project that wants the labels to follow the platform at once and has the minutes for it. |

`loadConfig` returns it normalised (`'sessions'` when absent). Any other value is refused naming the field (`huddle.json: "labels_job" must be one of sessions, hourly, events`).

**Why `sessions` is the default (Issue #125, H54).** One rule makes the cloud job unnecessary: every change to an Issue goes through a Huddle session: creating it (`/huddle-issue`, `/huddle-bug`), editing it, closing it, reopening it, and merging its PR/MR. Nobody merges, closes, reopens or edits an Issue by hand on the website or from a phone. The session runs `huddle labels` after the change, so the board stays right with no cloud job. (§22). With every
change made from a session, the sessions keep the board right with no cloud run and no CI minutes, and a change someone makes on the website against the
rule is repaired by the next session that opens (§22). `hourly` (about 24 runs a day) and `events` remain only as values written by hand,
for a team that wants a cloud run anyway and has the CI minutes for it; they are not asked (see «Not asked» below).

**One template per platform, three renderings.** `templates/github/workflows/huddle-labels.yml` and `templates/gitlab/huddle-labels.gitlab-ci.yml`
are the `events` rendering, exactly as before. `/huddle-setup` and `huddle update` choose the triggers from the setting when they write the
file (`lib/setup/labels-job.mjs`, `renderLabelsJob`), so the three modes are renderings of the same file and cannot drift. The `permissions`, the
`concurrency` group, the pinned `HUDDLE_REF` and the steps are the same in every rendering.

- **GitHub.** `events`: today's `on:` block. `hourly`: `schedule: - cron: '17 * * * *'` (a minute that is not :00 or :30, where the platform is busiest) plus `workflow_dispatch`, and nothing else. `sessions`: no file.
- **GitLab.** `events`: today's `rules` (the schedule and `merge_request_event`). `hourly`: the `schedule` rule and a `web` rule (a manual run). `sessions`: no file, and no `include` in `.gitlab-ci.yml`.
- **On GitLab the interval is a project setting**, not in the file (CI/CD > Schedules). The file's comment says to set the cron `17 * * * *` for `hourly` and `*/10 * * * *` for `events`. The Coach's session creates or updates the schedule with `glab api` (`/projects/:id/pipeline_schedules`); when it cannot, it gives a «🙋 Only you» step (§13).
- **A file the project edited is kept**, as always: it is reported as `skipped` with the way to get the new one. A file that is any rendering of ours (today's template, or another mode's) is **not** an edit: it is refreshed to the mode asked. Moving to `sessions` never deletes a file: the report names the file, says it can go because the sessions keep the labels, and says to delete it in a PR; a repo that wants to keep its cloud job sets `"labels_job": "hourly"` (or `"events"`) in `huddle.json` by hand.
- The report adds one line, `Labels job: <mode>. …`, that says what the setting asks for.

**Not asked (Issue #130).** 0.8.0 asked this in `/huddle-setup` and once in `/huddle-update` (question `labels-job`). It is asked no
more: every repo gets `sessions` with no question, and setup and update do not write the key. The reason: the safety net `hourly` gave is
already there for free. The session-start repair (§22) recomputes every label from the real state each time a session opens, locally and
with no CI minutes; the only thing `hourly` adds is a repair while nobody has a session open, which nobody needs, since nobody is working
then. Asking would only offer a person a choice that costs quota. `hourly` and `events` keep working when written by hand in `huddle.json`
(the schema, the renderings, `huddle doctor` and `lib/setup/cli.mjs --labels-job`, for scripts, are unchanged), and a value already in
`huddle.json` is kept. No skill or guide offers them.

**`huddle doctor`.** One line, `labels job: <mode>`; with `sessions` it says that nothing runs in the cloud and the sessions keep the labels right.

**What does not change.** `huddle labels` itself, the pinned `HUDDLE_REF` of a project (refreshing the file only changes the triggers; moving the pin is a PR the Coach's session opens), and the real cron of a GitLab project (the Coach sets it).

## 24. The effort of an Issue: 1, 2 or 3 points

Asked by the Coach on 2026-11-15 (Issue #162), as the base of two later steps: how many Issues one Player's session works on at once
(Issue #164) and how many PRs/MRs the Coach's watch reviews at once (Issue #165).

**The scale.** 1 small (a text, a one-file fix), 2 medium (a screen or an endpoint with its tests), 3 large (a migration, several layers,
many files). Not 5: with a capacity of 5 points, one Issue of 5 would fill it alone, and between 3 and 5 people argue more than they
estimate. An Issue clearly larger than «large» is a sign to split it into parts with «Depends on» between them.

**The section.** Every Issue template has «## Effort» right after «## Depends on». `effortOf(body)` in `lib/core/effort.mjs` reads `1`, `2`,
`3`, `S`/`M`/`L` or `small`/`medium`/`large` (HTML comments left out), and gives **2** when the section is missing or unreadable, so old
Issues keep working.

**The suggestion.** `suggestEffort(body)` reads only what the Issue already says and adds points:

| Signal | Points |
|---|---|
| Allowed files | 0-2: 0, 3-6: 1, 7-12: 2, more than 12: 4 |
| Tests that must pass | 0-2: 0, 3-5: 1, more than 5: 2 |
| A migration (a path with `migration`, or the word in the goal) | 1 |
| Top-level folders the allowed files span | 0-2: 0, 3-4: 1, 5 or more: 2 |

0-1 points is effort 1, 2-3 is 2, 4-5 is 3, 6 or more is 3 with `split: true` and a reason that says to split it. A blocking bug never
changes the effort (it only goes first); the reasons say so. It returns `{ effort, reasons, split }`.

**The command.** `huddle effort <n>` prints «#n: effort E (from its «Effort» section)» or «(the default: it has no «Effort» section)»; an
Issue that is not open is one line and exit 1. `huddle effort --suggest <file>` prints the suggestion for a draft as JSON. Read-only.

**The skills.** `/huddle-issue` and `/huddle-bug` write the draft to a temporary file outside the repo, run `huddle effort --suggest`,
write its effort in the section and show the reasons; the Coach may change it. With `split: true` they propose the split before creating
the Issue.

**Capacity and several Issues at once (Issue #164).** A Player's **capacity** is how many effort points of active work their session takes
on at once: `capacity` in `huddle.json` (default **5**), or `capacity_per_person` (`{ login: points }`), both set by the Coach. The Player can
only **lower** theirs, on their machine: `huddle capacity <points>` leaves a mark next to the update cache (never in the repo), a higher
value is refused, and `huddle capacity reset` restores it. `schedule({ active, candidates, capacity })` in `lib/core/schedule.mjs` decides:
active work (in progress, or with changes requested) uses room and an Issue in review uses none; the candidates (assigned, ready, no stop
label, not a Design Issue) go in by order, blocking bugs first then the oldest, while the sum stays within the capacity; two Issues that
share an allowed file never run at once; an Issue bigger than the whole capacity runs alone when nothing else is active. `huddle next
[--json]` prints it, with the reason of each wait. An assigned Issue held by a shared file with active work shows `blocked` on the board (§22, Issue #250). `/huddle-play` with no number follows `skills/huddle-play/parallel.md`: it hands each
Issue that starts to a background subagent with a clean context (so no Issue pays for another's context), keeps the review waits in the
main session, continues the same subagent with SendMessage when a request comes (or a new one when SendMessage is not available, as the
docs do not promise it in the VS Code extension), and runs `huddle next` again when room frees. Checked against the Claude Code docs on
2026-11-15: background subagents can run Bash, git and gh and push, up to 20 at once by default; a permission prompt of a subagent appears
in the main session; closing the main session stops them. Each subagent makes its own worktree from the staging branch with git (the
Agent tool's worktree isolation starts from the default branch).

**Never above the capacity (Issue #240).** A request that came back (changes requested) is active work again even while it waits for room or a shared file, so
its points count in `used` and a new start is weighed against them (only a request that waits for an open dependency holds nothing). When `used` is
already above the capacity, `schedule` starts nothing and says why on each Issue: «6 of 5 points in use: finish one first» (before any shared-file reason), and `next` also gives the overall reason in words («Over capacity: …») and in `--json` (`over`).

**Parallel reviews (Issue #165).** When several PRs/MRs wait, the Coach's watch reviews them at once, each in a background subagent with
a clean context, while the sum of their efforts stays within `review_capacity` in `huddle.json` (default **5** points; a PR/MR bigger than
it is reviewed alone). Each review item of `huddle queue --json` and `queue --wait` carries its Issue's `effort` (2 when it has none). A
subagent follows «Reviewing for the watch» of `/huddle-review`: the whole review, the «🔁 Changes requested» comment when something must
change, and a verdict («ready to merge», «needs changes», «stopped»), but it never approves or merges. The merges stay in the watch's main
session, **one at a time**: before each one, the PR/MR is checked again against the updated base (it still merges cleanly and its tests
pass on the branch updated with the base, in a fresh worktree), because the merge before it may have changed the base; if not, the
Player gets a «🔁 Changes requested» comment to update the branch and nothing is merged. Then the next review that fits starts.

**Standing orders of the Coach (Issue #175).** Claude Code asks before an outward action (a merge, a push) unless the authorization is
written down for good, so a session that read «merge it yourself» in `/huddle-review` could still stop and ask. Seen on 2026-11-15: after
the first Issue of a new repo the session said «if you say merge, I will merge PR #12 to staging, close Issue #4 with huddle land and
update the labels», and waited. The `CLAUDE.md` block now has «Standing orders of the Coach»: in a session whose login is the Coach,
merging into staging (or the default branch when there is none) an Issue PR/MR that passed `/huddle-review`, `huddle land` and `huddle
labels` right after, the PRs/MRs of `/huddle-update` and `/huddle-team`, and starting the watch with `/huddle-watch always` set need no
confirmation. Only `/huddle-release` (staging to production) still waits for the Coach's word. And a Coach who works on an Issue (a team
of one) does not stop after opening the PR/MR: `/huddle-play` runs `/huddle-review` on it right away, in a fresh worktree with the tests
run again, and merges on all good. A Player who is not the Coach never merges.

**Heartbeats (Issue #181).** Only the session that started the watch or a wait knew it was running; if it hung, closed or lost its context,
nobody could tell. Each round, `huddle queue --wait` writes `{ at, every }` to `huddle-watch-<repo id>.beat` next to the update cache (never in
the repo; `--wait-off` and a stop clear it), and `huddle wait <n>` writes its entry in `huddle-waits-<repo id>.beat`, a map by Issue (a finished
Issue removes its entry). `huddle status [--json]` reads them with no network and no login: the watch is on, stale (older than twice its
interval plus a minute: «the session that ran it is closed or stopped: run /huddle-watch») or off, with whether «always» is set; each wait
is on or stale («run /huddle-play <n>»). `huddle doctor` shows the same lines. `/huddle-watch status` runs `huddle status`, so it answers right
even when its session lost track, and `/huddle-play` with no number adds it to its list.

**One repo, one id (Issue #185).** The per-repo files on the machine (the labels stamp, the watch's stop mark, «always», the heartbeats,
the capacity) are named by an id of the repo's root. It is the hash of the real path (symlinks and 8.3 short names resolved), with forward
slashes and no trailing slash, lower-cased on Windows and macOS, so `d:\x\repo` from VS Code and `D:\x\repo` from a terminal are one repo.
Until 0.9.2 the id hashed the path as it came; a mark or a heartbeat left under that older id (the drive letter in either case) is still
read, and `/huddle-watch off` clears it too.

**The Coach's session decides, and keeps going (Issue #189).** Seen on 2026-11-16: the Coach's session waited about two hours on questions
with an obvious recommended answer (a bundle budget raised a little, a test registry file allowed for three lines, writing the follow-up
Issues it had itself proposed). The `CLAUDE.md` block now says: a question with a clear best answer is not asked; the session takes it,
says in one line what it decided and why (in the chat and as a comment on the Issue or PR/MR), and goes on. Technical and process choices
are its own (limits and budgets, allowed files for its own tests or registries, the order of the work, retargeting, follow-up Issues,
a Player's technical decision); it asks the Coach only about what users see or do, a feature's scope, priorities, money, accounts or
secrets, security or privacy, deleting work or data, and production. `/huddle-decide`, `/huddle-watch`, `/huddle-review` and
`/huddle-issue` follow it. The block also says that «AI Manager» and «developer» in older text mean the Coach and the Player, and
`huddle update` notes the lines of the project's own `CLAUDE.md` text that still use them, which `/huddle-update` rewrites in its PR.

**On time, and a failing round shows (Issue #191).** Seen on 2026-11-16: four PRs became ready between 19:50 and 19:54 UTC, the watch's
last round had been at 19:48, and the Coach's session said «nothing is left in review» at 19:55. The watch was alive but late: each round
read the queue, ran the full labels pass (about 5 minutes on that project) and then slept the whole interval, so rounds came every ~10
minutes. Now a round starts every interval from the start of the previous one (it sleeps only what is left), and the labels pass runs at
most every 15 minutes inside the loop. The heartbeat of the watch and of a Player's wait is written after a round read the queue (or the
Issue) without an error; a failing round keeps the last good time and records `lastError`, which `huddle status` shows («last round
failed … ; last good check …»). And when anyone asks what waits, the Coach's session reads `huddle queue` first, never its memory.

**Reviews cost less (Issue #195).** Seen on 2026-11-17: with 19 PRs in review, the Coach's account hit its usage limit twice, because
PRs fell behind the base branch and were reviewed again after each update. Four savings, none of them a change of what is checked:

- **The watch answers a conflict itself, with no tokens.** When `queue --wait` finds a `review` item with `merge: 'conflicting'`, it does
  not wake the Coach's session: it posts on the PR/MR and on its Issue a «🔁 Changes requested: update the branch» comment whose «Prompt
  for Claude Code» block asks the Player to run `git fetch origin` and `git merge origin/<base>` (the staging branch, else the default
  branch), resolve the conflicts, run the tests, push and comment «Ready for review again» with the counts; then it runs
  `labels --issue <n>`. It posts once per PR/MR head: a hidden marker in the comment (`<!-- huddle: update requested for <sha> -->`)
  keeps a restarted watch from asking again. The Player's wait picks it up as any request. A `clean` or
  `unknown` item wakes the session as before (GitHub computes `mergeable` lazily, so `unknown` is never treated as a conflict).
- **The Player brings the base in first.** `/huddle-play` merges `origin/<base>` before opening the PR/MR and before «Ready for review
  again», and reports the test counts after that merge.
- **A later round reads only what changed.** `/huddle-review` ends each review comment with `Reviewed head: <sha>`; on the next round it
  reads the Player's answer to each item and `git diff <old>..<new>`, not the whole PR again. The tests still run in a fresh worktree.
- **Test output is summarized.** The review keeps only the summary lines of the test output (the counts and the failures).

### The Player's watch (Issue #248)

Seen on 2026-11-21: a Player chat in Codex, run with no number, said «no Issue can start» and stopped, while #230 held 2 points with a
Coach request nobody had taken (its per-Issue wait had died with a closed session) and four Issues waited on its files. Now `huddle next`
also lists `resume`: each active Issue with a pending Coach request, keyed `resume:#n:<comment id>`. `huddle next --wait [s] [--seen keys]`
is the Player's watch, like the Coach's: no tokens; every 120 s by default it re-reads the plan and wakes the session (prints
`{ actionable }`) when something not seen can start or must be resumed; `--codex` runs it as a process of its own that queues «Huddle
(Player): … Run $huddle-play and do it» into the Codex chat, and a failed delivery is recorded in its heartbeat and retried next round,
never marked seen. One per Player and repo on a machine: under `~/.huddle`, an owner record `{ run, pid, tool, session, stopped }`
changed only under an exclusive lock file, and a heartbeat. Each launch makes a run id and claims before its child starts; the child
gets `--run <id>`. A live, not stopped run refuses a second launch; a dead one frees it. `next --wait-off` marks the run stopped (it
keeps its ownership until it exits). At every round and right before telling anything, a run that is stopped, or that another launch
took over, ends without waking anyone. `huddle status` shows «player watch», with a note when Codex only queued the message (it could
not resume the session). A resume is scheduled like a start: against the work already running (an active Issue whose request was
taken), the capacity and the open dependencies, never a Design Issue. An Issue the watch followed is told finished (`actionable.finished`,
key `done:#n`) only when it really closed, and stays pending until a delivery succeeds. Parallel play resumes first, then starts, and
never ends on an empty queue: it keeps that one watch, which replaces the per-Issue waits of parallel play. This holds in Claude Code
as in Codex, by the Coach's decision on #248 (numbered play keeps its per-Issue wait).

## 25. OpenAI Codex

Decided by the Coach on 2026-11-20: Huddle also runs in OpenAI Codex. The first delivery is for **Players**; the Coach stays in Claude Code
(the watch, parallel reviews, releases), and Design Issues stay in Claude Code (they need Claude Design). One repo serves both tools: the
same skills, the same `huddle` command and the same marketplace file. Sessions of the two tools never talk to each other directly: they talk
through GitHub or GitLab (Issues, PRs/MRs, comments, labels), so one person can run the Coach in Claude Code and Players in Codex at the
same time, on two plans.

**What was proven on a real Codex (Issue #199).** `codex-cli 0.171.0-alpha.13`, bundled with the VS Code extension (not on the PATH:
`<extension>/bin/windows-x86_64/codex.exe`), on Windows, 2026-11-20:

- **No Codex manifest is needed.** `codex plugin marketplace add <path or owner/repo>` reads `.claude-plugin/marketplace.json` as it is,
  and `codex plugin add huddle@huddle` installs the plugin («installed, enabled 0.9.5»). From GitHub:
  `codex plugin marketplace add SrProfessional/Huddle`, then `codex plugin add huddle@huddle`. Updating: `codex plugin marketplace upgrade
  huddle`, then `codex plugin add huddle@huddle` again. There must be no `plugin.json` at the repo root (openai/codex#39895: Codex then
  drops every hook of the plugin silently); a test keeps it so.
- **The skills load** as `huddle:huddle-play` and so on (`codex debug prompt-input` lists all eleven). Codex gives the model the folder of
  the plugin's `skills/`, but it does not replace `${CLAUDE_PLUGIN_ROOT}` inside a `SKILL.md`.
- **The session-start hook runs** (`hooks/hooks.json`, the same file Claude Code reads). Codex runs it through `cmd.exe` on Windows, replaces
  `${CLAUDE_PLUGIN_ROOT}` in the command itself, and sets both `PLUGIN_ROOT` and `CLAUDE_PLUGIN_ROOT` to the installed plugin folder. Its
  input is `{ session_id, transcript_path: null, cwd, hook_event_name: "SessionStart", model, permission_mode, source }`. The
  `hookSpecificOutput.additionalContext` it prints reaches the model (asked, the model quoted it back).
- **The hook must be trusted once in terminal Codex.** The VS Code chat has no `/hooks`, but terminal Codex shares its configuration:
  start it with `codex --no-daemon` (or the extension's executable on Windows), choose «Review hooks» at «Hooks need review», then
  review and trust Huddle's `SessionStart` command. Codex skips an untrusted hook, and a changed hook needs trust again. Trust was given
  this way on 2026-11-20 and checked with a `codex exec` run with no bypass: the model quoted the hook's line.
- **The model.** A ChatGPT account may refuse the model set in the Player's `config.toml` («The 'gpt-5.5' model is not supported when using
  Codex with a ChatGPT account»); `codex debug models` lists the ones offered.
- **Waking a Codex session (Issue #201).** `codex queue --thread <id> --message <text>` queues a message into a session; with the session
  open in the VS Code extension, the chat took the message and answered it by itself (2026-11-20, twice: once from `codex queue`, once from
  Huddle's own `codexQueue`). `--resume` warns «could not resume thread … start a local daemon» and the message is still delivered. The
  commands the Codex agent runs get the session id as `CODEX_THREAD_ID` (and `CODEX_HOME`, `CODEX_VERSION`), not `PLUGIN_ROOT`.

**The hook in Codex.** `huddle` tells Codex apart by `PLUGIN_ROOT`, which only Codex sets (`toolOf` in `lib/cli/main.mjs`). In Codex the
hook always adds one line of context, even when nothing waits: «Huddle (OpenAI Codex): the huddle command is node "<plugin>/bin/huddle".
Where a Huddle skill writes node "${CLAUDE_PLUGIN_ROOT}/bin/huddle", run that instead.» In Claude Code the hook's output does not change. The Coach's `/huddle-watch always` mark never asks a Codex session to start the watch
(the same login may play there): the watch runs in Claude Code.

**The wait in Codex (Issue #201).** `huddle wait <n> --codex`, run by the Codex agent, starts the same wait as a process of its own,
tagged with `--codex-thread <CODEX_THREAD_ID>`, and returns at once (a Codex command must not block the session). That process polls as
`huddle wait` always does, with no tokens; when the Coach leaves a request it queues «Huddle: the Coach left a request on Issue #n (<url>). Run
$huddle-play n and follow it.» into the session, and when the Issue is finished it queues one line saying so. `--codex` outside a Codex
session (no `CODEX_THREAD_ID`) says so and exits 1. `findCodex` finds the command: the `codex` on the PATH (not an npm `.cmd` shim, which
would need a shell), else the newest one bundled with the OpenAI extension under `~/.vscode`, `~/.vscode-insiders` or `~/.cursor`. If the
session is closed, the message waits in its queue, and the next session start says a request waits, as in Claude Code.

**The skills in Codex (Issue #201).** `/huddle-play` has one paragraph for Codex: the `huddle` command the session start named, a plain
`git worktree add` instead of `EnterWorktree`, `huddle wait <n> --codex` for every background wait, a Design Issue that stops («this Issue
is done in Claude Code (it needs Claude Design)»), and **no review or merge in Codex**, even on the Coach's login (a team of one keeps the
Coach in Claude Code, whose watch reviews). The Coach's skills (decide, review, watch, release, issue, bug, areas, team) stop in Codex with one
line: «/huddle-<name> runs in Claude Code, where the Coach works.»

**The Codex sandbox (Issue #202).** Proven on 2026-11-20 with `codex exec --sandbox workspace-write`: `CODEX_SANDBOX_NETWORK_DISABLED=1`
is set and `gh` cannot even start (`spawnSync gh EPERM`), so every command that reaches the platform needs network access, which the
Player approves when Codex asks; a detached child started by the agent's command did outlive it (it wrote its file 20 s later). So
`huddle wait <n> --codex` refuses with one clear line when `CODEX_SANDBOX_NETWORK_DISABLED` is `1` («run it again with network access:
approve it when Codex asks»), and `/huddle-play` says the same for `git fetch`, `git push`, `gh`, `glab` and `huddle`. The team guide's
«A mixed team» section gives the Player's setup.

**The GitLab template test in Codex (Issue #207).** Inside the Codex sandbox, the four runtime checks in `test/templates/gitlab-job.test.mjs`
failed with `spawnSync sh ENOENT`; outside the sandbox, after network access was approved and Git's `sh` was on `PATH`, all seven passed.

**The language (Issue #209).** Seen on 2026-11-20: a Codex session opened with only `$huddle-play 207` answered a Spanish-speaking
Player in English: there were no words to go by, Windows said `en-US` and no `language` was set. Now the session start names the language
(§6), so the first answer is in it.

**One watch per repo, whatever the tool (Issue #211).** Decided by the Coach on 2026-11-20: with Claude Code and Codex open at once on the
Coach's login, the first session that turns the watch on reviews and merges; the other says so and does not start. The per-repo files
(«always», the stop mark, the heartbeats, the capacity, and now the owner) live in one tool-neutral folder, `~/.huddle`; the old folder
next to a tool's update cache is still read, as the old ids are (#185), so an «always» set before is kept. `queue --wait` writes the owner
(`{ tool, session }`: `CODEX_THREAD_ID` in Codex, else `CLAUDE_CODE_SESSION_ID`). Another session's `queue --wait` stops with «The watch
already runs in <tool> (another session), last check <ago>: this session does not start a second one.» while the owner's heartbeat is
fresh, or while the owner reviews: when the watch returns items it keeps the watch for 45 minutes, since the loop ends while its session
reviews. The same session restarts its own watch freely; `queue --wait-off` from any session frees it; `huddle status` names the tool.

**The watch in Codex (Issue #212).** `queue --wait <s> [--seen <keys>] --codex`, run by the Codex agent, starts the watch as a process of its
own with `--codex-thread <CODEX_THREAD_ID>` and returns at once (as `wait --codex`, #201); it refuses outside Codex, with no network, and
when another session holds the watch (#211). The process runs the usual loop with no tokens; when items wait it prints them as always and
queues «Huddle's watch: N item(s) wait for the Coach (seen keys: …). Run $huddle-watch and review them.» into the Codex chat. The
session-start hook no longer skips the Coach's «always» in Codex (#199 did): it asks the Codex session to start the watch the Codex way, or,
when another session holds it, names that session in the visible line and asks for nothing. `/huddle-watch` has its Codex steps.

**The Coach's skills in Codex (Issue #213).** The stop lines of #201 go: decide, review, release, issue, bug, areas and team work in Codex,
each with one note: the `huddle` command the session start named, `git worktree add` for worktrees, and network access for `gh`, `glab`,
`git push` and `huddle`. `parallel.md` says a subagent is a Codex subagent there. What still needs Claude Code: a Design Issue (`/huddle-play`
stops) and a design PR in review (`/huddle-review` stops: it needs Claude Design to look at). `/huddle-play` on the Coach's login reviews and
merges in Codex as in Claude Code, unless another session holds the watch (#211), which reviews instead.

**A set-up repo comes nearly ready in Codex (Issue #215).** Proven on 2026-11-20 (codex-cli 0.171, an isolated `CODEX_HOME`): in a trusted
project, a repo file `.codex/config.toml` with `[marketplaces.huddle]` (git, `https://github.com/SrProfessional/Huddle.git`) and
`[plugins."huddle@huddle"] enabled = true` makes Codex see the marketplace in that repo only; after one `codex plugin marketplace upgrade
huddle` it lists `huddle@huddle  installed, enabled`, and outside the repo it is not listed. Setup and update write that file (the project's
own tables kept, the Huddle ones added once; a hand-written `huddle` marketplace with another source is kept and reported). What stays per
machine: trusting the project, that one command, and trusting the hook (#207). `huddle doctor` shows a «codex» line when `findCodex` finds a
Codex: ✔ when its `CODEX_HOME/plugins/cache/huddle` exists, ⚠ with the command otherwise, and a Claude Code session start says the ⚠ once per
repo. Not checked: whether the VS Code extension runs the upgrade by itself when it opens the repo.

**The Coach in Codex, end to end (Issue #214).** On 2026-11-20, on the Coach's machine, a Claude Code session played #214 as the Player and
opened PR #220 while the Coach's watch ran in Codex. From Claude Code, `huddle status` said «watch: on, in Codex» and `queue --wait` refused:
Claude Code did not start a second watch. The Codex watch woke its chat with «Huddle's watch: 1 item waits for the Coach…» and the review
began; it stopped once on the Coach's OpenAI usage limit and went on in the same chat when the quota came back. A second Codex chat opened
meanwhile refused to start the watch, since the first one held it (the stuck-owner case Issue H90 handles). Then the Codex review asked for a
change (this note and the README heading); the Player's `huddle wait` in Claude Code woke on it, and the change was pushed for review again.
The Coach's Codex session then reviews this round and merges and lands it.

**Taking over a stuck watch (Issue #222).** Seen in the live run of 2026-11-20: the Codex session that held the watch took PR #220 and hit
the OpenAI usage limit, and a new chat could not start the watch for 45 minutes. Decided by the Coach: two refusals. While the owner's loop
runs (no `reviewingUntil`, fresh heartbeat), «The watch already runs in <tool>…», and nobody takes it. While the owner only holds it to
review, the owner record keeps what it took and since when, and the refusal says «Another session (<tool>) took PR #220 to review 30 minutes
ago and has not checked since. If it is stuck, take over with --take-over (ask the person first).» `queue --wait … --take-over` (with
`--codex` too) then takes it and says so. `/huddle-watch` asks the person before passing it; the «always» start never passes it.

**The language holds (Issue #221).** Seen in the live run of 2026-11-20: with `huddle language es` set, a Codex chat still answered in English
until the Coach wrote in Spanish: «es» was terse, and the message that wakes the chat («Huddle's watch: …», in English) arrives as if the
person wrote it. Now the session-start line names the language in full (`Intl.DisplayNames`: «Spanish (es; …)») and says that messages from
Huddle itself and slash commands never change it, and every message Huddle queues into a Codex chat ends with «Answer the person in Spanish.».

**Updating in Codex (Issue #225).** Found before the 0.9.6 release: the version notice, `huddle doctor` and `/huddle-update` gave only Claude
Code's steps. In a Codex session (`inCodex`: the hook's tool, or `CODEX_THREAD_ID`) they give Codex's: in a terminal in the repo,
`codex plugin marketplace upgrade huddle` and `codex plugin add huddle@huddle` (the extension's own `codex` when it is not on the PATH),
trust the hook again in terminal Codex if it asks, then a new Codex chat. `/huddle-update` and `/huddle-setup` have one Codex note. The
installed version is read from the running plugin's own `plugin.json`, in Codex as in Claude Code.

**The rules** reach Codex through `AGENTS.md` (§5, Issue #200).

**Files on the machine.** Codex sets `CLAUDE_PLUGIN_DATA` to its own data folder, so the update cache and the heartbeat files of a Player's
Codex session live there, apart from Claude Code's: `huddle status` run from one tool does not see the other tool's waits.

**A request another session already took (Issue #239).** The session start line may be minutes old: with two sessions on one login (a Claude Code session and a Codex chat) the other one may have taken the request meanwhile. Before it asks «Do you want me to continue?», the session runs `huddle pending <n>` again; with nothing pending it says in one line that another session took it and goes on with the person's own request. `huddle take <n>` on a request already marked 👀 prints one line saying so and exits 1, instead of printing the prompt again.

## 26. The dashboard

The first dashboard data is local-only token accounting. `huddle usage [--json] [--since <YYYY-MM-DD>]` reads the Claude Code project
transcripts below `<CLAUDE_CONFIG_DIR or ~/.claude>/projects/` and Codex sessions below `<CODEX_HOME or ~/.codex>/sessions/`. It never
sends a transcript, prompt, answer, path outside this checkout, or token total to the platform.

The command includes this checkout and every one of its Git worktrees. Claude Code assistant entries are keyed by `requestId` (or message
id) so streaming repeats count once. Cache creation uses the reported total or the sum of the 5-minute and 1-hour counts when only
the breakdown is present. Codex sessions count only when their saved `cwd` is one of those folders. Repeated token snapshots count once,
and the checkout's Git branch supplies attribution when the event has no branch. The platform adapter resolves each distinct recorded
branch through its PR or MR. An unresolved branch is `no Issue`. A broken or half-written JSONL line
is skipped and named once on stderr, without stopping the report.

`--json` writes exactly `{ person, rows }`: `person` is the platform login read once, and a row is
`{ day, tool, model, issue, input, output, cacheRead, cacheWrite, reasoning }`. The rows group totals by day, tool, model and Issue;
every usage value is a number and no message text appears in the output. The plain report shows those same columns. `--since` keeps days on
or after the inclusive date.

### The team's numbers: the huddle-usage branch (Issue #230)

So the dashboard can show the whole team and each person, every session leaves its summary on the orphan branch `huddle-usage`:
`usage/<login>/<YYYY-MM-DD>.json` = `{ person, day, rows }`, the rows of `huddle usage` for that day. Numbers only: no message text, no
path. `huddle usage --push` writes it with git plumbing and a private index file (`read-tree` of the branch's tip, `hash-object`,
`update-index`, `write-tree`, `commit-tree`, `push <commit>:refs/heads/huddle-usage`), so the working tree, the real index and the current
branch are never touched; a day already there is replaced, other days and other people are kept; a push rejected because someone pushed
meanwhile fetches and retries once on top. The session-start hook starts `huddle usage --push` as a process of its own at most once an
hour per repo (a mark under `~/.huddle`). `huddle usage --team [--json]` reads every file of the branch after a fetch: `{ team, people }`,
the team's rows summed and each login's rows apart; with no branch yet, an empty team. The branch has the repo's own visibility, so the
Coach decided (2026-11-21): `--push` shares by itself only in a private or internal repo (the adapters' `repoVisibility()`); in a public one,
or when the visibility cannot be read, it shares nothing and says so, unless `share_usage` in `huddle.json` is `true`; `false` never shares.

### API and plan prices

The dashboard compares API token cost with subscriptions. `prices --json` returns the API table, its source and date, and the dated plan
table. Huddle keeps OpenRouter prices for one day under `~/.huddle` and tries LiteLLM if OpenRouter is unavailable. If both fail, it uses
the last kept copy. An unknown model or ambiguous bare name without an exact match or explicit alias is reported as `no price`.

The 2026-11-20 snapshot in `lib/usage/plans.json` uses US list prices in USD. `monthly_usd` is the monthly-billed rate, per seat where
marked. `annual_monthly_equivalent_usd` is the public monthly equivalent for annual billing where available.

- Claude Pro is $20 monthly or $200 per year (about $16.67 per month). The `max5` key maps to Max at $100, and `max20` maps to Ultra
  (formerly Max 20x) at $200, both billed monthly. [Claude pricing](https://claude.com/pricing), [Ultra plan](https://support.claude.com/en/articles/17728952-what-is-the-ultra-plan).
- Claude Team Standard and Premium are $25 and $125 per seat with monthly billing, and $20 and $100 per seat per month with annual
  billing. [Claude Team plan](https://support.claude.com/en/articles/9266767-what-is-the-team-plan).
- ChatGPT Plus is $20 monthly. The `pro` key represents Pro 200 at $200 monthly. The `business` key represents a Standard seat at $25
  with monthly billing or $20 per month with annual billing. [Plus](https://help.openai.com/en/articles/6950777-what-is-chatgpt-plus),
  [Pro tiers](https://help.openai.com/en/articles/9793128-about-chatgpt-pro-tiers), [Business pricing](https://openai.com/business/pricing/).

`huddle.json` may override the rate used for monthly cost calculations or the seat count under `plans`. The annual equivalents remain
public reference figures. Each person stores their selection with `plan claude=max5 codex=plus`.

### The dashboard page (Issue #232)

The `dashboard [--no-open]` command of the CLI (`/huddle-dashboard` in Claude Code, `$huddle-dashboard` in Codex) writes `.huddle/dashboard/index.html` and copies
`gsap.min.js`, `ScrollTrigger.min.js` and `lenis.min.js` from `site/vendor/` next to it, then opens the page with the system's program (`start`, `open`
or `xdg-open`); `--no-open` only writes it. `.huddle/` is ignored by git: setup and update add it to the repo's `.gitignore` (any of `.huddle`,
`.huddle/`, `/.huddle`, `/.huddle/` already there counts, and the line takes the file's own line ending). The page loads nothing from the network; the only
network read of the command is the API price list (§26 prices), through the same daily cache.

**Data.** The token rows are every person's from the huddle-usage branch, with my own days replaced by the ones read from this machine's transcripts.
The API cost of a row is its tokens times the price of its model; a model with no price counts nothing and is named, a cache price the source does
not list charges nothing, and a Codex row's cached tokens (already inside its input) are charged once, at the cache rate; reasoning tokens are part of the
output. «Paid in plans» is the monthly price of the plan, prorated to the days of the range: my own plan is the one I chose with `plan`; anyone else's is the
only plan with `seats` that `huddle.json` sets under `plans` for that tool, split per seat when it is one plan for several people; with none, the person and
tool are named as «plan not set», never guessed. The difference is the API cost minus what the plans cost.

**Cost per Issue** groups the rows by Issue (tokens without an Issue are one line apart), sorted by API cost, and divides by the Issue's effort points (its
«Effort» section, read with the adapter's `issueBody` for a closed Issue). **Pace** reads the last 60 merged PRs/MRs into the staging branch (the default
branch with none) that close Issues: Issues closed per day (per week for all time), the median hours from the PR/MR's first commit to its merge, and the
review rounds, which are the Coach's «Prompt for Claude Code» requests on the PR/MR or its Issues before the merge. The first commit stands for «in progress»
because the platform gives no timestamp for a label through the adapters; a read that fails leaves only that number out.

**Style and motion.** Dark only: background #0F1117 with drifting light, cards #1A1D26 and #1D2130 with 24 px radius, text #F2F4F8 and #A3A8B6, blue
#2F6BFF to #4C8DFF, orange #F5A524 (in progress), pink #F0476B (changes or decision; its text is #F25A7A, for 4.5:1 on both cards) and green #5FD068 (done).
Motion: header and summary cards enter in a stagger with numbers counting up, sections reveal on scroll, rows slide in, bars grow; the light, the pulse of the
watch dot, the breathing savings card and the hover lift are CSS. Each element has one tween with explicit end values and its styles cleared at the end, and a
3 s safety ends any unfinished tween. With `prefers-reduced-motion: reduce` no script moves anything and the page is complete.
