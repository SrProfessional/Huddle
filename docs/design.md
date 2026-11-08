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
- After opening its PR, the session waits in the background for the AI Manager's review and continues on its own. When
  Claude Code is reopened, a hook says whether a request is pending.

## 4. Packaging: a Claude Code plugin

A plugin, not a plain skill: only a plugin can ship the SessionStart hook together with the skills.

```
huddle/
  .claude-plugin/plugin.json      name, version, description
  skills/
    huddle-setup/SKILL.md         installs Huddle in a repo (asks the platform, host, AI Manager, team)
    huddle-start/SKILL.md         a developer starts or continues an Issue
    huddle-issue/SKILL.md         the AI Manager writes a new Issue from the template
    huddle-review/SKILL.md        the AI Manager reviews a PR/MR and posts the request or merges
    huddle-decide/SKILL.md        the AI Manager answers a «needs decision»
  hooks/hooks.json                SessionStart (startup|resume) -> bin/huddle hook
  bin/huddle                      one CLI: labels | wait | take | pending | hook | doctor
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
  "labels": { "changes": "changes requested from AI Manager" }
}
```

- `platform`: `github` or `gitlab`.
- `host`: empty means github.com or gitlab.com.
- `project`: `owner/repo` on GitHub, or the project path (groups allowed) on GitLab.
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
   changes. A project with no milestones gets none. It is found by a marker comment in its body, `<!-- huddle:progress -->`, never by its title. It has no
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
