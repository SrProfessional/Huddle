---
name: huddle-setup
description: Use when a team wants to put Huddle in a repo for the first time, or to refresh its CLAUDE.md block and templates after updating the plugin.
---

# huddle-setup

Installs Huddle in the repo you are in. Run it from the repo root, on a branch that is not the default branch.

## Look at `huddle.json` first

Before asking anything, look for `huddle.json` in the repo root and read it. A repo that already has a valid one is set up: to bring it to a newer Huddle, use `/huddle-update` (it also asks any question a new release added).

- **It exists and is valid** (a refresh, for example after updating the plugin): **ask nothing**. Everything the questions would ask is already in the file. Go straight to «Do» and run `node "${CLAUDE_PLUGIN_ROOT}/lib/setup/cli.mjs"` with no flags: it reuses the file's answers, replaces the block of `CLAUDE.md` and refreshes the templates. In your report say what changed: the block (updated or not), the templates written, and the templates **kept** because the project edited them (the report's `skipped`), with the one-line way to get the current one.
- **It does not exist, or it is invalid or incomplete**: ask **only** for what is missing. Run the CLI once with no flags: for a missing file it fails naming each missing field (`"platform" is required`), and for an invalid one it names the field. Ask only the questions below that match those fields, and keep what the file already says.
- **No file at all** is a first install: ask all five.

## Ask (one message, in the developer's language; only on a first install, or for the fields that are missing)

1. **Platform:** `github` or `gitlab`.
2. **Host:** empty for github.com / gitlab.com; otherwise the server name (GitHub Enterprise, self-managed GitLab).
3. **Project:** `owner/repo` on GitHub, the project path (groups allowed) on GitLab. Offer the one from `git remote get-url origin`.
4. **AI Manager:** the login of the one person who hands out Issues, answers decisions, reviews and merges, for example `SrProfessional`. Offer the login of the developer running the setup: `gh api user --jq .login` on GitHub, `glab api user` (the `username` field) on GitLab. If that command fails, ask without an offer.
5. **Team:** the logins of the developers who get Issues, separated by commas, for example `SrProfessional, Santiago123`. Optional: max open Issues per person (empty = no limit), default branch.

Never ask for a token. If `gh`/`glab` is not logged in to that host, tell the developer to log in themselves and stop.

## Do

1. Run, in the repo root (leave out the flags for answers that were left empty; with a valid `huddle.json` give no flags at all):
   `node "${CLAUDE_PLUGIN_ROOT}/lib/setup/cli.mjs" --platform <p> --host <h> --project <x> --ai-manager <login> --assignees a,b`
2. It writes `huddle.json`, the Issue and PR/MR templates and the labels job of that platform, and inserts the Huddle block
   in `CLAUDE.md`. It also writes `.claude/settings.json` with the marketplace and the enabled plugin (`extraKnownMarketplaces.huddle` and
   `enabledPlugins["huddle@huddle"]`): it creates the file, or merges those two keys and keeps every other key. Run again later and it replaces only that block; the project's own text and edited templates stay.
   If the project already runs the labels job under another file name (any workflow, or `.gitlab-ci.yml` and the files it includes, that runs the labels command), setup keeps it and adds no second one; its notes name that file and say when it pins an older Huddle (`HUDDLE_REF`). Updating that pin is a PR the AI Manager's session opens.
   That file is only a helper: it enables the plugin for the project and, in the CLI, registers the marketplace silently after the folder's own trust dialog. It does not install Huddle for anyone.
3. Read the JSON report. Show the developer `written`, `skipped` and every line of `notes` (GitLab needs a pipeline
   schedule, which the AI Manager's session can create with `glab api`, and the `HUDDLE_TOKEN` variable, a secret that only the
   person can create: give them the «🙋 Only you» steps of docs/gitlab.md, «The HUDDLE_TOKEN step»).
4. Run `node "${CLAUDE_PLUGIN_ROOT}/bin/huddle" doctor` and show the result. If it reports a missing label, run
   `node "${CLAUDE_PLUGIN_ROOT}/bin/huddle" labels` (the AI Manager's login only).
5. Tell the AI Manager to send every developer the two install commands, to run once on their machine in a terminal, then open a new session: `claude plugin marketplace add SrProfessional/Huddle` and `claude plugin install huddle@huddle`.
6. Tell the developer, in one line: the areas of the project are its milestones, and each area's percentage counts the
   Issues still to write, which the AI Manager states on a line of the milestone description, for example `Huddle remaining: 4`
   (see `huddle progress`).
7. Tell the developer to review and commit the files in a branch and PR/MR. Do not commit to the default branch.

## Who does each step

Before you hand a step to the person, check whether you can do it yourself with the tools and logins you have (`gh`, `glab`,
and the repo's own tools). If you can, do it and report what you did. Only a step that needs something you cannot have goes to them: a second
person's account, a payment, a secret, a phone or another device, a legal or business decision, a paid action they must
approve, or a permission that was denied. Write that step as numbered «🙋 Only you» steps for someone with no technical
background (docs/design.md §13): one action per step, a copy block for what is pasted, «You should see:» and «If you see
something else:». Your closing message says what you did yourself, and its next step is either a step you will take or those
🙋 steps. If a permission is denied or a credential is missing, stop and ask; never look for another way.
