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

GitLab CI does not react to Issue events, so the labels job runs on a schedule and on every merge request pipeline.

1. Add to your `.gitlab-ci.yml`: `include: local: huddle-labels.gitlab-ci.yml`.
2. Go to **CI/CD > Schedules > New schedule**.
3. Cron: `*/10 * * * *`. Target branch: the default branch. Leave it active.

A comment does not start a pipeline, so after one the label can take up to 10 minutes to change. A push to a merge
request starts a pipeline and updates it at once.

## The HUDDLE_TOKEN step

The job token (`CI_JOB_TOKEN`) cannot edit Issues, so the job needs a token of its own. Only the AI Manager does this,
once per project:

1. **Settings > Access tokens > Add new token.** Role: Maintainer. Scope: `api`. Give it an expiry date you will
   remember to renew.
2. Copy the token once. Do not paste it in a chat, a file, an Issue or a commit.
3. **Settings > CI/CD > Variables > Add variable.** Key `HUDDLE_TOKEN`, the token as value. The variable must be
   masked and protected: turn on **Mask variable** and **Protect variable**.
4. Because the variable is protected, the schedule must run on a protected branch. The default branch normally is.
   Merge request pipelines from unprotected branches do not get the variable: there the job stops with a message saying
   `HUDDLE_TOKEN` is not set, which is expected.

Huddle only reads the variable. It never reads a token from a file, never prints it and never turns on shell tracing.

## What works differently

| On GitLab | What Huddle does |
|---|---|
| A close has no reason and no closing event, only `closed_by`. | A dependency counts as merged only when a merged MR closed it. An Issue closed by hand unblocks nothing (GitHub gives the same result by reading the event that closed the Issue). |
| Notes include system notes («added label ...»). | The adapter drops them before anything reads comments. |
| Self-approval may be disabled. | The AI Manager approves with a comment, then merges. |
| `Closes #N` works only for MRs into the default branch. | The MR template uses `Closes #N`. Open the MR into the default branch. |
| Merging can remove the source branch. | Huddle merges without removing it. |

## Check it

1. `huddle doctor`: all ✔.
2. In **CI/CD > Schedules**, run the schedule once with **Play**. The `huddle-labels` job should pass and log the label
   changes, or `0 label change(s)`.
3. If it fails with «HUDDLE_TOKEN is not set», go back to the token step.
