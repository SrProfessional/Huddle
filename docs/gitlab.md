# Huddle on GitLab

Huddle works on gitlab.com and on a company's own GitLab server. The commands are the same as on GitHub, but GitLab
differs in a few places. Everything on this page except the first section is done by the AI Manager.

## Configuration

`huddle.json` at the repo root (`/huddle-setup` writes it):

```json
{
  "platform": "gitlab",
  "host": "gitlab.example.com",
  "project": "team/app",
  "ai_manager": "santiago",
  "assignees": ["ana", "luis"]
}
```

- `project` is the project path; groups and subgroups are allowed (`group/sub/app`).
- `host` is empty for gitlab.com.

## Self-managed host

1. Put the server name in `"host"`, without `https://` (for example `gitlab.example.com`).
2. Log in to that server: `glab auth login --hostname gitlab.example.com`. Check it with `huddle doctor`: the `login`
   line must say you are logged in to that host.
3. In CI nothing more is needed: the job uses the server's own name (`CI_SERVER_FQDN`).
4. A self-managed server must reach `gitlab.com` (to download `glab`) and `github.com` (to fetch Huddle) from its
   runners. If it cannot, mirror both inside your network and point `HUDDLE_REF` and the job's download lines at the
   mirrors.

## The schedule

GitLab CI does not react to Issue events, so the labels job runs on a schedule. With `labels_job: "events"` it also runs on every merge request pipeline (the merge request ones only skip, see below); with `hourly` it runs on the schedule and on a manual run (`web`); with `sessions` (the default) there is no job file at all (see [How often it runs](#how-often-it-runs)).
It runs in the `test` stage, which GitLab always defines, so it works in a project with no other CI.

1. Add to your `.gitlab-ci.yml`: `include: local: huddle-labels.gitlab-ci.yml`.
2. Go to **CI/CD > Schedules > New schedule**.
3. Cron: `17 * * * *` (the `hourly` mode) or `*/10 * * * *` (the `events` mode). Target branch: the default branch. Leave it active.

The schedule is what changes the labels. A comment does not start a pipeline, and the merge request pipelines do not
have the token (see below), so on GitLab a label can take up to 10 minutes to change, also after a push to a merge
request. With the `hourly` mode a label can be up to an hour old when nobody has a session open.

## How often it runs

`labels_job` in `huddle.json` picks the mode: `sessions` (the default: no cloud job), `hourly` or `events`. **On GitLab the interval is a
project setting, not part of `huddle-labels.gitlab-ci.yml`.** To change the mode: run `/huddle-setup` with the new answer (or edit `huddle.json` and run
`/huddle-update`), then change the cron of the schedule in **CI/CD > Schedules** to `17 * * * *` for `hourly` or `*/10 * * * *` for `events`; for `sessions`
delete the schedule and the `include` line. The AI Manager's session can do the schedule with `glab api`; if it cannot, it gives you the steps.

## The HUDDLE_TOKEN step

The job token (`CI_JOB_TOKEN`) cannot edit Issues, so the job needs a token of its own. A token (a long password that lets a
program act for you) is a secret, so the AI Manager's session cannot create it and never sees it. This step is only the AI
Manager's, once per project.

🙋 Only you

1. Open the project on GitLab in your browser. In the left menu click **Settings**, then **Access tokens**.
2. Click **Add new token**. In **Token name** type the text below:
   ```text
   huddle
   ```
3. Set an expiry date you will remember to renew. Under **Select a role** choose **Maintainer**. Under **Select scopes** tick
   only **api**.
4. Click **Create project access token**. You should see: a box with a long text that starts with `glpat-` and a copy
   button. If you see something else: you do not have the Owner or Maintainer role; ask the project owner and stop here.
5. Click the copy button next to the token. Do not paste it in a chat, a file, an Issue or a commit: the variable below is
   the only place for it.
6. In the left menu click **Settings**, then **CI/CD**. Next to **Variables** click **Expand**, then **Add variable**.
7. In **Key** type the text below:
   ```text
   HUDDLE_TOKEN
   ```
8. Click in **Value**, paste the token (Ctrl+V), and tick **Mask variable** and **Protect variable**.
9. Click **Add variable**. You should see: `HUDDLE_TOKEN` in the list with «Protected» and «Masked» next to it, and no token
   text. If you see something else: if the page says the value cannot be masked, check that you pasted only the token,
   with no spaces or line breaks, and try again.

Because the variable is protected, the schedule must run on a protected branch. The default branch normally is.
Merge request pipelines from unprotected branches do not get the variable: there the job ends green, prints
«Huddle: HUDDLE_TOKEN is only available on protected branches; the schedule on the default branch updates the
labels.» and changes nothing. That is expected; keep the variable protected. On a schedule or on a protected branch
a missing token still fails the job.

Huddle only reads the variable. It never reads a token from a file, never prints it and never turns on shell tracing.

## On the developer's machine

Every developer who works on a GitLab repo needs two things on their own machine. The AI Manager's session checks them once in
the [smoke test](smoke-test.md).

1. **`glab` must be on the PATH of the terminal that starts Claude.** If it is not, the SessionStart hook stays silent
   and `huddle doctor` shows ✖ on `login`: «glab is not installed or not on the PATH of this terminal», with the install
   command (`winget install --id GLab.GLab` on Windows, `brew install glab` on Mac). After installing `glab` on Windows,
   open a new terminal, or reload the PATH in PowerShell with the line `huddle doctor` prints. If `glab` runs but is not
   logged in, the line says «glab is not logged in» and gives `glab auth login` (with `--hostname <host>` when `huddle.json` has a host).
2. **Git must use `glab` for gitlab.com.** If it does not, a session cannot push: the credential manager cannot open a
   browser from a session. In a terminal where `glab` is on the PATH run:

   ```text
   git config --global --add credential.https://gitlab.com.helper "!glab auth git-credential"
   ```

   and check it with `git ls-remote origin`: it must answer with no prompt. (For a self-managed host, use that host
   instead of `gitlab.com`.)

Labels change by the schedule, so they can take up to an hour in the default mode, 10 minutes with `events` (see [The schedule](#the-schedule)).

## What works differently

| On GitLab | What Huddle does |
|---|---|
| A close has no reason and no closing event, only `closed_by`. | A dependency counts as merged only when a merged MR closed it. An Issue closed by hand unblocks nothing (GitHub gives the same result by reading the event that closed the Issue). |
| Notes include system notes («added label ...»). | The adapter drops them before anything reads comments. |
| Issues and merge requests are numbered separately (Issue #2 and MR !2 are different things). | Requests left on an MR are read through the MR, and messages say «MR !2» instead of «PR #2». |
| Self-approval may be disabled. | The AI Manager approves with a comment, then merges. |
| `Closes #N` works only for MRs into the default branch. | The MR template uses `Closes #N`. Open the MR into the default branch. |
| Merging can remove the source branch. | Huddle merges without removing it. |
| There are no pinned Issues. | The «Huddle progress» Issue is created, but not pinned. Find it in the Issue list by its title, «Huddle progress». |
| Reading progress costs one call per closed Issue (`closed_by`). | At most 8 `glab` calls run at once. A milestone with 300 closed Issues means 300 calls on every labels run and every session start, so keep finished areas closed: a closed milestone leaves the percentage after 90 days. In the session hook the progress read is dropped after 20 s. |
| A closed milestone cannot be set on an Issue: GitLab answers «ok» and leaves the Issue as it was. | `huddle areas assign` reads the Issue back; for a closed milestone it reopens it, assigns the Issue, closes it again and says so. |
| The API limits how many calls you can make (HTTP 429). | `glab` calls are retried on a 429 and on a 5xx, up to 3 tries and 60 s. If it is still limited, `huddle` says «rate limited, try again in N s» and stops; run it again later. |
| A milestone has no closing date. | The date of its last update stands for it, to decide if it closed in the last 90 days. Only project milestones are read. |

## With a staging branch

When `huddle.json` has a `staging_branch`, an MR into it does not close its Issue: GitLab closes an Issue only for an MR into the
default branch, and it does not link the two. Huddle reads the link itself, from the MR description (`Closes #N`, `Fixes #N`,
`Resolves #N`; not inside a comment or a code block), using the Issue's `related_merge_requests`. Put the keyword in the description,
not only in a commit. A self-managed server with a custom closing pattern is not read: Huddle uses the keywords above.

## Check it

1. `huddle doctor`: all ✔.
2. In **CI/CD > Schedules**, run the schedule once with **Play**. The `huddle-labels` job should pass and log the label
   changes, or `0 label change(s)`.
3. If it fails with «HUDDLE_TOKEN is not set», go back to the token step.
