---
name: huddle-setup
description: Use when a team wants to put Huddle in a repo for the first time, or to refresh its CLAUDE.md block and templates after updating the plugin.
---

# huddle-setup

Installs Huddle in the repo you are in. Run it from the repo root, on a branch that is not the default branch.

## Ask first (one message, in the developer's language)

1. **Platform:** `github` or `gitlab`.
2. **Host:** empty for github.com / gitlab.com; otherwise the server name (GitHub Enterprise, self-managed GitLab).
3. **Project:** `owner/repo` on GitHub, the project path (groups allowed) on GitLab. Offer the one from `git remote get-url origin`.
4. **AI Manager:** the login of the one person who hands out Issues, answers decisions, reviews and merges, for example `SrProfessional`. Offer the login of the developer running the setup: `gh api user --jq .login` on GitHub, `glab api user` (the `username` field) on GitLab. If that command fails, ask without an offer.
5. **Team:** the logins of the developers who get Issues, separated by commas, for example `SrProfessional, Santiago123`. Optional: max open Issues per person (empty = no limit), default branch.

Never ask for a token. If `gh`/`glab` is not logged in to that host, tell the developer to log in themselves and stop.

## Do

1. Run, in the repo root (leave out the flags for answers that were left empty):
   `node "${CLAUDE_PLUGIN_ROOT}/lib/setup/cli.mjs" --platform <p> --host <h> --project <x> --ai-manager <login> --assignees a,b`
2. It writes `huddle.json`, the Issue and PR/MR templates and the labels job of that platform, and inserts the Huddle block
   in `CLAUDE.md`. It also writes `.claude/settings.json` with the marketplace and the enabled plugin (`extraKnownMarketplaces.huddle` and
   `enabledPlugins["huddle@huddle"]`): it creates the file, or merges those two keys and keeps every other key. Run again later and it replaces only that block; the project's own text and edited templates stay.
3. Read the JSON report. Show the developer `written`, `skipped` and every line of `notes` (GitLab needs a pipeline
   schedule and the `HUDDLE_TOKEN` variable: only the AI Manager sets those up).
4. Run `node "${CLAUDE_PLUGIN_ROOT}/bin/huddle" doctor` and show the result. If it reports a missing label, run
   `node "${CLAUDE_PLUGIN_ROOT}/bin/huddle" labels` (the AI Manager's login only).
5. Tell the developer to review and commit the files in a branch and PR/MR. Do not commit to the default branch.
