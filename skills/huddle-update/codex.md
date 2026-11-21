# huddle-update in OpenAI Codex

Read by `/huddle-update` (`$huddle-update`) when the session runs in OpenAI Codex (Issue #225). Sections 1, 4 and 5 of the skill stay as
they are; these replace sections 2, 3 and 6. Wherever the skill writes `node "${CLAUDE_PLUGIN_ROOT}/bin/huddle"`, run the command the session
start named instead.

## 2. The plugin, in Codex

- skip `claude plugin list --json` and the scope lookup: Codex installs a plugin for the person, with no project scope.
- Find `codex`: the one on the PATH, else the VS Code extension's own `codex` (not on the PATH): on Windows, in PowerShell,
  `$codex = (Get-ChildItem "$HOME\.vscode\extensions\openai.chatgpt-*\bin\*\codex.exe" | Sort-Object FullName | Select-Object -Last 1).FullName`
  and then `& $codex …` (the team guide, «A mixed team», has the other systems).
- Run `codex plugin marketplace upgrade huddle`, then `codex plugin add huddle@huddle`. Read the output: «Installed plugin root: <folder>»
  names the new version's folder.
- If `codex` cannot be run from this session (not found, or it fails), do not stop: do sections 3 to 5 with the Huddle that is installed,
  and give the person those two commands to run in a terminal in the repo, then `$huddle-update` again in a new Codex chat.

## 3. The files, in Codex

In Codex, the new version's folder is a sibling of the running plugin's folder: the folder of the command the session start named, two levels up from
its `bin/huddle`, is `…/plugins/cache/huddle/huddle/<version>`; the new one is `…/plugins/cache/huddle/huddle/<new version>` (or the folder
the add printed). With none, use the running one. Make the worktree with `git worktree add` (no `EnterWorktree`), work in that folder, and
run `node "<new folder>/bin/huddle" update --json` there; then go on with sections 4 and 5 of the skill.

## 6. The last line, in Codex

There is no `/reload-plugins` in Codex. Use this text, in the person's language:

> To use Huddle <version>: if Codex asks, trust the hook again in terminal Codex (`codex --no-daemon`, then `/hooks`, the SessionStart row;
> the team guide's «A mixed team» steps), then open a new Codex chat in this repo.
