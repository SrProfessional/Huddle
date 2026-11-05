# Your first day

For a developer joining a team that already runs Huddle. About thirty minutes before your first Issue.

## 1. Set up your machine

1. Install Claude Code, Node 22 or newer and `git`.
2. Install `gh` (GitHub) or `glab` (GitLab) and log in yourself, with `gh auth login` or `glab auth login`. For a
   self-managed GitLab add `--hostname <your server>`. Never paste a token into a chat, a file or an Issue.
3. Clone the team's repo and open Claude Code in it. If the repo commits the Huddle marketplace in its
   `.claude/settings.json`, Claude Code offers the plugin once you trust the folder. If not, install it yourself:

   ```text
   /plugin marketplace add SrProfessional/Huddle
   /plugin install huddle@huddle
   ```

   You do not need to clone Huddle. Cloning it is only for people who work on Huddle itself, with
   `claude --plugin-dir ./Huddle` (see the [README](../README.md#install)).

## 2. Check it works

Run `huddle doctor`. You want ✔ on `huddle.json`, `login`, `ai_manager` and `labels`. If `login` fails, log in again. If
`labels` fails, tell the AI Manager: only they run `huddle labels`.

Read `CLAUDE.md` (the Huddle block holds the rules) and [the team guide](team-guide.md). They take ten minutes and answer
most questions you will have.

## 3. Take your first Issue

1. The AI Manager assigns you an Issue, or the labels job does: it carries `assigned` and your name.
2. Open Claude Code in the repo and run `/huddle-start <n>`. You can also paste the «Prompt for Claude Code» block of the
   Issue.
3. The session reads the Issue, checks that what it depends on is merged, creates its own branch in a worktree and adds
   the `in progress` label. If a dependency is not merged, it stops: that is correct, wait for it.
4. Answer its questions. This is the job. If you do not know, say so and let it ask the AI Manager.
5. Review what it did before you accept the pull request. You are responsible for it.

## 4. The end of a session

A session ends with a message that starts with «✅ Issue #N finished» or «⛔ Issue #N stopped». It has the PR link, the
test counts, what was not done and your next step. If you do not see it, the session is not over.

After the PR is open the session waits in the background. When the AI Manager asks for changes, it continues on its own.
If you closed Claude Code meanwhile, the next time you open it a hook says there is a pending request and asks if it
should continue. `huddle pending` lists them.

## Do not

- Push to the default branch, or merge your own PR.
- Touch files the Issue does not allow. Ask first.
- Open ten sessions at once. One or two is the number.
- Drop a requirement silently. List it under «What was NOT done» with the reason.
- Look for another way when a permission or a key is missing. Stop and tell the AI Manager.
