---
name: huddle-team
description: Use when the AI Manager wants to add a developer to the team or remove one, and to get the message to send the new person.
---

# huddle-team

For the AI Manager only. Run `node "${CLAUDE_PLUGIN_ROOT}/bin/huddle" doctor`: if you are not the `ai_manager` login in `huddle.json`, stop; only the
AI Manager changes the team. Read `platform`, `host`, `project` and `default_branch` from `huddle.json`.

## Do

1. Ask two things: **add or remove**, and the **login** (the platform login, not the name).
2. `git status` must be clean, or stop and say what is in the way: this change must not carry other work. Then
   `git fetch origin` and `git switch -c team-<add|remove>-<login> origin/<default_branch>`. Never commit to the default branch.
3. Run `node "${CLAUDE_PLUGIN_ROOT}/bin/huddle" team add <login>` (or `team remove <login>`). It edits only `assignees` in `huddle.json`.
   - If it stops because the login **cannot be assigned**, show the AI Manager its step as it printed it (GitHub: Settings → Collaborators, or
     `gh api -X PUT repos/<project>/collaborators/<login>`; GitLab: Manage → Members, role Developer). Do **not** do the step yourself and never
     invite anyone: it changes platform settings, which is the AI Manager's own act. When they have done it, run the command again. If they
     want the file written first, run it with `--anyway`: until the step is done, that person's Issues stay `ready`.
   - If it says the login is already there (add) or not there (remove), nothing changed: tell them and stop.
4. Check `git diff huddle.json`: only the `assignees` line may differ. Then commit it as `Team: add <login>` (or `Team: remove <login>`) and push
   with `git push -u origin <branch>`.
5. Open the PR (GitHub: `gh pr create --base <default_branch> --title "Team: add <login>" --body ...`) or the MR (GitLab:
   `glab mr create --target-branch <default_branch> --title "Team: add <login>" --description ... --yes`), with a one-line reason in the body.
   **Never merge it.** The AI Manager merges it after looking, like any change. Give them the link.
6. On **add**, print the message to send the new person, in the AI Manager's language, with the commands as they are:

````text
Hi <name>! You are on the <project> team. To start, once, on your machine:

1. In a terminal, install the plugin:
   claude plugin marketplace add SrProfessional/Huddle
   claude plugin install huddle@huddle
2. Log in to the platform: gh auth login   (GitLab: glab auth login, adding --hostname <host> on a self-managed server)
3. GitLab only, so that git can push from a session (use your host instead of gitlab.com if it is self-managed):
   git config --global --add credential.https://gitlab.com.helper "!glab auth git-credential"
4. Open a new Claude Code session in the repo and ask it to run the Huddle doctor check: every line should show ✔.
````

   Drop step 3 on GitHub, and write `gh` or `glab` only for the platform in use. Say that Issues start arriving after the PR/MR is merged.
7. On **remove**, say that open Issues already assigned to that person keep them: the AI Manager reassigns them by hand if needed.
