# Changelog

All notable changes to Huddle: Decision-led development for teams coding with AI. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Added

- The website home as a parallax scrolling landing page (Issue #61). `site/index.html` tells the story in eight scenes: a hero with
  depth layers, five sessions that drift apart and snap into order, the pinned label flow (one Issue card travels ready,
  assigned, in progress, in review and merged and takes both side roads), the four steps scrolling sideways, the two
  roles, GitHub and GitLab, a terminal that types the install commands with a Copy button, and the FAQ with a final call.
  Motion comes from GSAP 3.15.0, ScrollTrigger 3.15.0 and Lenis 1.3.27, vendored in `site/vendor/` with their licences
  (no CDN, no npm dependency) and one deferred script, `site/js/landing.js`. All text stays in the HTML: with no JavaScript
  or with `prefers-reduced-motion: reduce` the page is a normal readable document, and on a phone the effects are lighter.
  Only transform and opacity are animated. Lighthouse on the home page, mobile: Accessibility, Best Practices and SEO 100,
  Performance 95. The site test checks the vendored files, local deferred scripts, the eight scenes and the reduced-motion rule.
- Design Issues, worked in a Claude Code session with Claude Design (Issue #58). A new **Design** Issue template for GitHub
  (`.github/ISSUE_TEMPLATE/design.md`) and GitLab (`.gitlab/issue_templates/Design.md`), installed by the setup skill, with the
  `design` label (created by `huddle labels` when missing). It keeps every section the labels job reads, so a Design Issue
  goes `ready` / `assigned` / `in progress` / `in review` like a task, and adds Screens, For whom, Visual guide, Content and
  Deliverable; its allowed files are always `design/<issue number>-<slug>/`. `/huddle-issue` writes it; `/huddle-start`
  creates the design with Claude Design, polishes it only through the chat, and on «ready» saves `README.md`, `design.html`
  and `screens/` in `design/<n>-<slug>/`, opens the PR and closes, with each round a new commit; `/huddle-review` checks a
  design PR (screens, content, visual guide, contrast, phone width, never tests) and offers the follow-up «Build <screen>
  from design #N» Issue. Docs: «If you are a designer» in the first-day guide and «Design tasks» in the team guide.
- The Huddle website on GitHub Pages (Issue #56), at `https://srprofessional.github.io/Huddle/`. A static site in `site/`
  with no build step and no dependencies: home (the problem, the four steps, the label-flow diagram as inline SVG, GitHub
  and GitLab, the install and a FAQ), «Get started», «How it works» and a 404. Each page has its own title and
  description, a canonical link, Open Graph and Twitter tags; the home page has JSON-LD `SoftwareApplication`. The site
  also has `sitemap.xml`, `robots.txt`, a favicon and the 1200 × 630 share image `og.png` with its source in `site/og/`.
  Light and dark, readable on a phone, keyboard focus visible, no trackers. `.github/workflows/pages.yml` deploys it from
  `main` when `site/**` changes, and on a manual run, with pinned actions. `test/site/site.test.mjs` checks every page. The
  README opens with the words people search for and links the website with a badge.
- Bugs are their own Issue type, and the skill `/huddle-bug` writes them (Issue #55). `/huddle-setup` installs a Bug template
  (`bug.md` on GitHub, `Bug.md` on GitLab: a bug block, then every Task section) and, on GitHub, a Bug report form
  (`bug-report.yml`) for people who are not the AI Manager. `huddle labels` creates the labels `bug` and `needs triage`.
  An Issue with `needs triage` never gets `ready` or an assignee, and a `blocking` Bug is assigned before every other ready
  Issue. `/huddle-bug` (AI Manager only) takes a plain description or `#N` of a raw report, investigates without changing
  anything, checks duplicates, sets the severity and waits for the AI Manager's OK. The team guide has a «Reporting a bug»
  section.

## [0.3.0] - 2026-11-09

### Added

- The session does every step it can, and the steps only a person can do are for-dummies steps (Issue #50;
  `docs/design.md` §13). Before a session hands a step to the AI Manager or a developer, it checks whether it can do it
  itself with `gh`, `glab`, git and the sandboxes, and if so does it and reports it. Only a step that needs a second
  person's account, a payment, a secret, a phone or another device, a legal or business decision, a paid action or a
  denied permission goes to the person, written as numbered «🙋 Only you» steps («🙋 Solo tú» in Spanish): one action per
  step, a copy block for what is pasted, «You should see:» and «If you see something else:». `/huddle-review` now merges,
  tags and creates the release itself once its session approved, and asks only for 🙋 steps; `/huddle-issue` marks the
  steps only a person can do; every skill has a «Who does each step» section and its closing message follows it. The smoke
  test marks each step «Session» or «🙋 Only you» and the session runs its own steps on the sandboxes; the GitLab
  `HUDDLE_TOKEN` step is now a 🙋 block, and the team guide and the roles page explain it. Docs and skills tests check it.

- `/huddle-areas`, Claude helps define the project's areas (Issue #42). The skill (AI Manager only) reads the README,
  `CLAUDE.md`, the specs, plans and Issues and always proposes and explains before changing anything: which areas (any
  number, never a fixed one), an area for each Issue without one, a «remaining» estimate per area with its reasoning, and a
  check-up on a project that already has areas. The mechanics are the new `huddle areas list | set | assign | check`:
  `set` creates or updates one milestone keeping the rest of its description, `assign` puts an Issue in an area or takes
  it out with `none`, `check` reports Issues with no area, areas with no estimate and areas whose remaining is 0, as data
  with `--json`. Every write prints what it will change first and has `--dry-run`. The adapters gain `findMilestone`,
  `createMilestone`, `updateMilestone` and `setIssueMilestone`, and closed Issues carry their `title` and `milestone`.

### Changed

- The smoke test (`docs/smoke-test.md`, Issue #40) has two new numbered sections, «Progress» (9) and «Team members» (10),
  with checkboxes and expected results for GitHub and GitLab, and a «Results 0.2.0» table. Step 5.5 is now run with a second
  account: that person comments a «Prompt for Claude Code» block, and `huddle pending` and the labels ignore it. «Not
  testable» stays only for a run with no second account. «Clean up» is now section 11.
- `huddle doctor` tells «not installed or not on the PATH» apart from «not logged in» (Issue #41). When `gh` or `glab` cannot
  be started (`ENOENT`), the `login` line says so and gives the install command for the system (`winget install --id
  GitHub.cli` / `GLab.GLab` on Windows, `brew install gh` / `glab` on Mac, the official page on Linux) and, on Windows, to
  open a new terminal or reload the PATH. An auth failure says «is not logged in» with `gh auth login` / `glab auth login`
  (`--hostname <host>` when `huddle.json` has a host). Any other failure keeps the «is not usable» line. The real runners
  carry the spawn error's `code` on the error they reject with.

### Fixed

Findings of the 0.3.0 smoke test (Issue #52).

- **One «Huddle progress» Issue, even when two runs start seconds apart.** `huddle labels` looks for it with the new adapter
  operation `findIssuesByTitle`, which reads the database (GitHub: the REST Issues list; GitLab: the list by title), not
  `gh issue list`, which uses search and indexes a new Issue late. Every run also heals duplicates: the oldest stays, the
  others get the comment «Duplicate of #N» and are closed (as not planned on GitHub). New adapter operation `closeIssue`.
- **The progress Issue is only an Issue whose body starts with the marker line and whose title is «Huddle progress».** An
  Issue that quotes the marker in its text, or a human's Issue with that title, is never rewritten or closed.
- **Retries on a rate limit and on a server error.** The `gh` and `glab` runners retry a 429 (and «rate limit» answers) and
  a 5xx, at most 3 tries and 60 s of waiting in all, after the `Retry-After` the CLI prints or 1 s, then 2 s. A POST is
  never retried on a 5xx (it may have been done). A limit that stays ends with «rate limited, try again in N s» on one
  line, not a stack. On GitLab one labels run reads `closed_by` once per Issue, not once for the labels and once more for
  the progress.
- **GitLab: `huddle areas assign` to a closed milestone sticks.** gitlab.com answers 200 and ignores a closed milestone on an
  Issue, so `setIssueMilestone` reads the Issue back; if it did not stick, it reopens the milestone, assigns and closes it
  again (also when the assign fails), says so, and throws a clear error if it still does not stick.
- `huddle areas check` lists an area with no estimate line once (as «No «Huddle remaining» line»), no longer also as «No
  Issue and remaining 0».

## [0.2.0] - 2026-11-07

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

### Fixed

- `/huddle-setup` compares a template with the project's copy ignoring line endings. On Windows with `core.autocrlf=true`
  the copy has CRLF, and a refresh used to skip it as «edited by the project». A copy that differs only in line endings is
  now refreshed and keeps the line ending it already has (CRLF stays CRLF); a copy with a real edit is still kept.
- GitLab `huddle take` and `huddle labels` were slow (over 2 minutes on a real project): one `glab` call per note for its
  👀 award. The adapter now reads the award only for the notes that could be a request (by the AI Manager, with a «Prompt for
  Claude Code» heading, newer than the last commit or «Ready for review again»), and runs those calls 8 at a time, with the
  same `mapLimit` cap as the milestone reads. For an Issue with 30 notes, 2 of them requests, `comments` goes from 31 `glab`
  calls to 3. The adapter reads `ai_manager` from `huddle.json`; without it every note is read, as before.

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
