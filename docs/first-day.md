# Your first day

For a developer joining a team that already runs Huddle. About thirty minutes before your first Issue.

## 1. Set up your machine

1. Install Claude Code, Node 22 or newer and `git`. Then set your language once, in your personal
   `~/.claude/settings.json` (not in the repo): add `"language": "spanish"` (or your own language). Claude then chats with
   you in it, even after reading English Issue prompts or Huddle's output; everything written to the repo stays in English.
2. Install `gh` (GitHub) or `glab` (GitLab) and log in yourself, with `gh auth login` or `glab auth login`. For a
   self-managed GitLab add `--hostname <your server>`. Never paste a token into a chat, a file or an Issue.
3. Install Huddle once on your machine, whatever the repo commits. If you have the `claude` command (the CLI), run this in a terminal, then open a new session:

   ```text
   claude plugin marketplace add SrProfessional/Huddle
   claude plugin install huddle@huddle
   ```

   In the CLI the same works as `/plugin marketplace add SrProfessional/Huddle` and `/plugin install huddle@huddle`.
   If you use only the VS Code extension, it puts no `claude` command in the terminal: type `/plugins`, add the marketplace
   `SrProfessional/Huddle` in the **Marketplaces** tab, and install `huddle` from the **Plugins** tab with **Install for this
   project** (not «Install for you»). Each person does this once per clone. Then open a new session. The same dialog
   updates it later.

   The team's repo may commit a `.claude/settings.json` snippet. It is only a helper: it enables the plugin for the
   project and, in the CLI, registers the marketplace silently, only after the trust dialog of that folder itself. If a
   parent folder is already trusted there is no dialog and it is not used, and it is not documented for the VS Code
   extension. Do not wait for it: install Huddle yourself.

   **On GitLab, two more things:** `glab` must be on the PATH of the terminal that starts Claude (if not, the hook stays
   silent and `huddle doctor` shows ✖ on `login` saying `glab` is not installed or not on the PATH, with the install command; after
   installing `glab` on Windows, open a new terminal, or reload the PATH as that line says), and Git must
   use `glab` for gitlab.com, or a session cannot push (the credential manager cannot open a browser from a session).
   In a terminal where `glab` is on the PATH run
   `git config --global --add credential.https://gitlab.com.helper "!glab auth git-credential"`, and check it with
   `git ls-remote origin`. Labels change by the schedule, so they can take up to 10 minutes: see
   [Huddle on GitLab](gitlab.md#on-the-developers-machine).

   **Turn on auto-update, once.** Claude Code does not update a plugin from a third-party marketplace on its own.

   🙋 Only you

   1. In Claude Code in the CLI, type `/plugin` and press Enter.
   2. Go to the **Marketplaces** tab and select `huddle`.
   3. Select **Enable auto-update**.
   4. Check it: the `huddle` line now says auto-update is enabled. (In the VS Code extension type
      `/plugins` instead of `/plugin`, or skip this step: Huddle tells you at the start of a session when a newer version exists.)

   After that Claude Code updates Huddle by itself at startup. Even then, a session that starts on a new day with an
   older Huddle says so, with the two commands to run.

4. Clone the team's repo and open Claude Code in it.

   You do not need to clone Huddle. Cloning it is only for people who work on Huddle itself, with
   `claude --plugin-dir ./Huddle` (see the [README](../README.md#install)).

## 2. Check it works

Run `huddle doctor`. You want ✔ on `plugin`, `huddle.json`, `login`, `ai_manager` and `labels`. If `login` fails, read the line: «`gh`/`glab` is not installed or not on the PATH of this terminal» comes with the install command for your system (on Windows, then open a new terminal, or reload the PATH in PowerShell as the line shows); «is not logged in» comes with the step, `gh auth login` or `glab auth login` (with `--hostname <host>` on a self-managed server). If
`labels` fails, tell the AI Manager: only they run `huddle labels`.

Read `CLAUDE.md` (the Huddle block holds the rules) and [the team guide](team-guide.md). They take ten minutes and answer
most questions you will have.

## 3. Take your first Issue

1. The AI Manager assigns you an Issue, or the labels job does: it carries `assigned` and your name.
2. Open Claude Code in the repo and run `/huddle-play <n>`. You can also paste the «Prompt for Claude Code» block of the
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
should continue. You can also run `/huddle-play <n>` yourself: it picks up the AI Manager's answer on Issue `n`, so you
never copy the prompt by hand. `huddle pending` lists the requests.

## If you are a designer

A design task is an Issue like any other, and you work it the same way: from a Claude Code session, with no code. Everything
happens in the chat.

What to install, once:

1. Claude Code in VS Code (the editor with a chat panel), and a Claude plan that includes Claude Code.
2. A GitHub account (a GitLab one if your team uses GitLab) that the AI Manager has added to the team.
3. Huddle, with the two commands of step 1.3 above. Ask the session to run them with you if you are unsure.

How a design task goes:

1. Open the team's repo in VS Code, open Claude Code and run `/huddle-play <n>` with the number of your Issue.
2. The session builds the design with Claude Design and gives you a link to watch it.
3. **Ask for every change in the chat, in your own words** («make the button bigger», «use the phone layout for the menu»).
   Do not change things by hand on the canvas: the session cannot tell what you did there, and it will ask you whether to keep it.
4. When you are happy, write «ready» (or «listo»). The session asks for a one-line confirmation, then saves the design in
   the repo (`design/<issue number>-<slug>/`), opens the pull request with the screenshots and tells you what comes next.
   You do not run any other step.
5. If the AI Manager asks for changes, keep talking in the same session. Each round is saved as a new commit, so nothing is lost.

## Do not

- Push to the default branch, or merge your own PR.
- Touch files the Issue does not allow. Ask first.
- Open ten sessions at once. One or two is the number.
- Drop a requirement silently. List it under «What was NOT done» with the reason.
- Look for another way when a permission or a key is missing. Stop and tell the AI Manager.
