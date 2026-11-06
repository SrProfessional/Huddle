# Changelog

All notable changes to Huddle: Decision-led development for teams coding with AI. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

Version 0.1.0 is not tagged yet: it waits for the smoke test on a sandbox GitHub repo and a sandbox GitLab project.

### Added

- The core: issue status from «Depends on», review requests, assignment by load.
- The platform adapters for GitHub (`gh`) and GitLab (`glab api`, including self-managed hosts), with a shared contract
  test run against canned responses.
- The `huddle` CLI: `labels`, `wait`, `take`, `pending`, `hook` and `doctor`, and `huddle.json` with its schema.
- The templates: the Huddle block for `CLAUDE.md`, the Issue and PR templates, the GitHub labels workflow and the GitLab
  CI job.
- The skills `/huddle-setup`, `/huddle-start`, `/huddle-issue`, `/huddle-review` and `/huddle-decide`, and the
  SessionStart hook.
- A plugin marketplace: `.claude-plugin/marketplace.json` makes this repo the marketplace `huddle`, so teams install with
  `/plugin marketplace add SrProfessional/Huddle` and `/plugin install huddle@huddle`, or commit it in `.claude/settings.json`.
- The public docs: README with a quickstart for GitHub and for GitLab, roles, first day, team guide and GitLab notes.

### Changed

- Install docs (README, first-day guide, team guide): every developer installs Huddle once on their machine, with
  `claude plugin marketplace add SrProfessional/Huddle` and `claude plugin install huddle@huddle`, then opens a new
  session. The `.claude/settings.json` snippet is described as a helper: it enables the plugin for the project and, in the
  CLI, registers the marketplace silently only after the folder's own trust dialog. The docs no longer say it «offers» the plugin.
- `/huddle-setup` reports a note to send every developer the two install commands.
- `huddle doctor` has a «plugin» check: ✔ when it runs from an installed plugin, otherwise a hint with the two commands (no network).

### Fixed

- GitLab labels job (first smoke test on gitlab.com): it runs in the `test` stage instead of `.post` (a pipeline with only
  `.pre`/`.post` jobs is empty and never runs); with the protected `HUDDLE_TOKEN` empty on an unprotected ref that is not a
  schedule (MR pipelines) it ends green with one line and changes nothing, while a schedule or a protected ref without the
  token still fails; it clones `https://github.com/SrProfessional/Huddle.git`. The docs say that on GitLab a label can take
  up to 10 minutes to change, also after a push.
- GitHub: an Issue closed by hand with «Close issue» (which also closes as «completed») no longer unblocks the Issues that
  depend on it. A dependency is merged only when the last close was done by a merged PR (read from the Issue's closing event).
- The SessionStart hook now also prints a visible line (`systemMessage`) for the developer when a request from the AI
  Manager is pending, besides the context for Claude. With nothing pending, or offline, it stays silent.
- `huddle labels` says how many labels it created («7 labels created.»), and `--dry-run` how many it would create.
- `/huddle-setup` gives examples for the AI Manager (it offers the login from `gh api user` or `glab api user`) and for the team.
- `/huddle-setup` writes `.claude/settings.json` with the marketplace and the enabled plugin: it creates the file, or merges
  only `extraKnownMarketplaces.huddle` and `enabledPlugins["huddle@huddle"]` and keeps every other key. A file it cannot
  merge (invalid JSON) is left alone and listed under `skipped`, with the snippet in `notes`.
- The docs (README Install, first day, team guide «Updating Huddle») give the terminal form for the VS Code extension, which has
  no `/plugin`: `claude plugin marketplace add`, `claude plugin install` and `claude plugin marketplace update`, then a new session.
- The GitHub labels workflow template clones `https://github.com/SrProfessional/Huddle.git` (the repo's own case).
