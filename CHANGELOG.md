# Changelog

All notable changes to Huddle: Decision-led development for teams coding with AI. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Added

- Add or remove a team member (Issue #36). `huddle team` lists the AI Manager and the assignees with ✔/✖ for «exists on the
  platform» and «can be assigned» (collaborator on GitHub, Developer or higher on GitLab). `huddle team add <login>` and
  `huddle team remove <login>` edit only `assignees` in `huddle.json`, keeping every other key, the order and the line
  endings; they never invite anyone or change platform settings, and print the step for the AI Manager instead (`--anyway`
  writes the file regardless). The skill `/huddle-team` does it through a PR/MR and prints the message for the new person.
  `huddle doctor` gets a «team» check with a ⚠ for each assignee who cannot be assigned. The adapters gain `canAssign`.
  `docs/team-guide.md` has «Add or remove someone».
- Progress by area, as a percentage (Issue #28). Areas are milestones; each area's percentage is merged Issues over all the
  work it will need, using a `Huddle remaining: N` line of the milestone description for the Issues not written yet.
  Shown by `huddle progress` (and `--json`), by a «Huddle progress» Issue that the labels job keeps up to date (pinned on
  GitHub; GitLab has no pinned Issues), and by one line in the SessionStart hook. `"progress_issue": false` in `huddle.json`
  turns the Issue off. `/huddle-issue` asks for the milestone and `/huddle-setup` explains the areas. The adapters gain
  `listMilestones`, `createIssue`, `updateIssue` and `pinIssue`, and open Issues carry their `milestone`.

## [0.1.0]

The first release. It is tagged only after the smoke test in [docs/smoke-test.md](docs/smoke-test.md) passes on a sandbox
GitHub repo and a sandbox GitLab project.

### Added

- The smoke test checklist, `docs/smoke-test.md`, run by hand before each release.
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

- GitLab: a request left on a merge request is now seen. Issues and MRs are numbered separately on GitLab, so the adapter
  read the notes of MR !2 as the notes of Issue #2 (`huddle pending` said «Nothing pending» and no label moved). Notes,
  the 👀 award, note edits and new notes of an MR now use `merge_requests/:iid` (`comments`, `postComment`, `editComment`
  and `markTaken` take `{ review: true }`; GitHub ignores it). On GitLab every message says «MR !N» instead of «PR #N»
  (pending, hook, wait, take).
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
