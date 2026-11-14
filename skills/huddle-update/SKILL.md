---
name: huddle-update
description: Use when a repo that already has Huddle set up must be brought to the installed Huddle version: after updating the plugin, when the update notice or the doctor's `setup` line says so, or when a release asks a new question.
---

# huddle-update

One command brings Huddle up to date in the project you are in: the plugin, the project's files, and a PR. The person does not switch
branch, does not open a terminal and does not run a second command. A repo with no `huddle.json` has not been set up: say so and point
to `/huddle-setup`.

## 1. The version notice

Before anything else, run `node "${CLAUDE_PLUGIN_ROOT}/bin/huddle" notice`. It is read-only and needs no login. When it prints text, say that
text to the person, in their language, as the first thing in your answer, and then go on with the task: the notice never stops the work
and never asks anything. When it prints nothing, say nothing about versions (it shows at most once a day, so silence is normal).

## 2. The plugin

If a newer Huddle exists (the notice said so, or `node "${CLAUDE_PLUGIN_ROOT}/bin/huddle" doctor` shows a newer latest), run in the
project folder:

1. `claude plugin marketplace update huddle`
2. `claude plugin update huddle@huddle --scope project`

Read the output: «updated from X to Y», or already the latest. If the `claude` command cannot be run from this session (not found, or it
fails), do not stop: do steps 3 to 5 with the Huddle that is installed, and tell the person to update the plugin with `/plugins`
(VS Code) or the two terminal commands above, and then run `/huddle-update` again.

## 3. The files, in a worktree of its own

This session still has the old skills loaded, so the refresh must use the **new** version's templates. The new version's folder is a
sibling of `${CLAUDE_PLUGIN_ROOT}`: `<parent of CLAUDE_PLUGIN_ROOT>/<new version>` (`newPluginRoot` in `lib/core/update.mjs` gives it, and
null when it does not exist; then use `${CLAUDE_PLUGIN_ROOT}`).

Create the worktree and branch from the up-to-date default branch, enter it with `EnterWorktree`, and run the new folder's command there:

```text
git fetch origin
git worktree add .claude/worktrees/huddle-update-<version> -b huddle-update-<version> origin/<default>
node "<new folder>/bin/huddle" update --json
```

(if the branch or folder already exists, reuse it: without `-b`). The person never changes branch, and the folder they were in is not
touched. That command reads and writes only files (no login, no network). Read the JSON it prints:

- **`status` is `updated`** and `pendingQuestions` is empty: it already did the work. Go to step 5.
- **`status` is `questions`** (exit code 3): it changed **nothing**. Go to step 4.
- **`status` is `up-to-date`**: nothing changed. Say so, ask for nothing, make no branch or PR, and leave the worktree.

If it fails, show its message (for example «there is no huddle.json here») and stop.

## 4. Questions

Ask **only the pending questions** (`pendingQuestions`), never the five questions of `/huddle-setup` and never one the repo has already
answered. One message, in the developer's language, one line per question: its `ask`, its `options` when it has them, and its
`default` offered as the answer. Never ask for a token.

Then run `node "<new folder>/bin/huddle" update --json --answer <key>=<value>` with one `--answer` for each question (a value is read as
JSON when it is JSON: `true`, `3`, else text). It writes the answers and refreshes the repo. If it refuses a key, show why.

The `labels-job` question (`labels_job`: `sessions`, `hourly` or `events`, default `sessions`) is asked once of a repo that has no such key; the
answer rewrites the triggers of the labels job file unless the project edited it (then it is in `skipped`). On GitLab the interval is a
project setting, not in the file: after the PR, set the schedule in CI/CD > Schedules to the cron `17 * * * *` for `hourly` or `*/10 * * * *`
for `events` (the AI Manager's session can do it with `glab api`; if it cannot, give the «🙋 Only you» steps), and delete it for `sessions`.

## 5. The PR

Commit on that branch, push, and open the PR/MR with what changed, from the JSON: the block of `CLAUDE.md` (`claudeMd`), the files in
`changed`, the templates kept because the project edited them (`skipped`, with the way to get the current one that the `notes` give), and
every line of `notes` (for example a labels job that pins an older `HUDDLE_REF`: updating that pin is a PR the AI Manager's session
opens). A developer's session never merges. The AI Manager's session does not merge it either, unless the AI Manager says so in the same chat.

## 6. The last line

Say what was done, the PR link, and how to use Huddle `<version>` now. Use this text, in the person's language:

> To use Huddle <version> in this session, type `/reload-plugins`. This works in the terminal and in VS Code. If the new skills do not
> show up, restart Claude Code: close `claude` and open it again; in VS Code, run «Developer: Reload Window» from the Command Palette, or
> close VS Code and open it again.

If nothing changed because the project is up to date, say so and ask for nothing. Do not send the person to a fresh session: `/reload-plugins` comes first.

## Look before you change anything

`node "${CLAUDE_PLUGIN_ROOT}/bin/huddle" update --check` writes nothing and says `up to date` (exit 0) or what would change and which
questions are pending (exit 3). `--dry-run` prints the whole change and writes nothing. The `setup` line of `node "${CLAUDE_PLUGIN_ROOT}/bin/huddle" doctor` gives the same answer.

## Who does each step

Before you hand a step to the person, check whether you can do it yourself with the tools and logins you have (`gh`, `glab`,
and the repo's own tools). If you can, do it and report what you did. Only a step that needs something you cannot have goes to them: a second
person's account, a payment, a secret, a phone or another device, a legal or business decision, a paid action they must
approve, or a permission that was denied. Write that step as numbered «🙋 Only you» steps for someone with no technical
background (docs/design.md §13): one action per step, a copy block for what is pasted, «You should see:» and «If you see
something else:». Your closing message says what you did yourself, and its next step is either a step you will take or those
🙋 steps. If a permission is denied or a credential is missing, stop and ask; never look for another way.
