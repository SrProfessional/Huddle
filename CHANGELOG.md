# Changelog

All notable changes to Huddle: Decision-led development for teams coding with AI. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Added

- The sessions keep the labels right themselves (Issue #120, H51, the first of two; `docs/design.md` §22 and §19). `huddle-play`, `huddle-review` and `huddle-decide` run
  `huddle labels --issue <n>` at each step an Issue changes state, and `huddle-watch` runs the full `huddle labels` before `huddle queue --json` in each tick and in the
  first check. Best effort: a failure is one line and never blocks. A developer's session never assigns. The `CLAUDE.md` block says who runs it and that nobody edits a
  Huddle label by hand; the cloud job is the safety net (its template is H52).

- The «tested in staging» marker and `/huddle-release` (Issue #115, the last of four, `docs/design.md` §21). With `staging_branch` set, nothing goes to the default branch until
  every Issue in staging was tested there. `huddle tested <issue>` (AI Manager only) posts the comment `✅ Tested in staging` and adds the label `tested in staging`; a login in the new
  optional `testers` list may write the same comment by hand. The evidence is the comment, valid only when newer than the Issue's last staging merge (a fix after the test invalidates it);
  the label is cosmetic, is not one of the status labels, is created only with staging set, is removed from open Issues by the labels job and by `huddle land`. `huddle release [--json]`
  lists what staging holds and has not released (merge commits not in the default branch), which Issues are tested, and two warnings (commits that belong to no listed Issue; the default
  branch ahead of staging). `huddle release open [--untested <n> --reason "<why>"]` (AI Manager only) opens the PR/MR from staging into the default branch and refuses an untested Issue or a
  default branch ahead of staging; its body names Issues as plain `#N`. New adapter operation `openReview`, and `mergedReviews` now carries `mergeSha`. New skill `/huddle-release`.
  With `staging_branch` unset nothing changes.

- `huddle labels --issue <n> [--dry-run]` (Issue #113, the first of two; the skills and the labels job template that use it are H51,
  `docs/design.md` §22). The labels of one Issue instead of the whole repo: for an open `n`, `n` alone; for a closed `n`, the open
  Issues that wait for it plus the cleanup of `n`. It assigns only when the caller is the AI Manager, never reads the comments of an
  Issue outside the scope and never creates labels. New adapter operation `issueLabels(n)`. Without `--issue` nothing changes.
- `staging_branch` in `huddle.json` (Issue #109, the first of four for the «first staging, then production» flow, `docs/design.md` §21).
  An optional branch name; absent or `""` means none. It must differ from `default_branch` and be a plain branch name. `/huddle-setup`
  asks for it (`--staging-branch`), and `/huddle-update` asks it once of repos that have no such key (question `staging-branch`,
  since 0.8.0). It is only stored and validated: nothing behaves differently yet.
- The adapters understand a staging branch (Issue #111, the second of four, `docs/design.md` §7 and §21). With `staging_branch` set,
  GitHub and GitLab no longer lose a PR/MR into staging, which the platforms never link to its Issue: Huddle reads the link from the
  PR/MR body (new pure `closesIn`, `lib/core/closes.mjs`: the closing keywords with `#N`, ignoring HTML comments and code), so the
  `in review` label, the watch queue, the review comments and `huddle wait` keep working. An Issue counts as merged when it is closed
  and today's rule holds **or** a merged PR/MR into staging closes it. New adapter operation `branchExists(name)`, and `huddle doctor`
  checks that the staging branch exists on the remote (only when it is set). With it unset, every call and result is unchanged.

- The staging flow and `huddle land` (Issue #114, the third of four, `docs/design.md` §21). With `staging_branch` set, an Issue's branch starts from
  staging, its PR/MR targets it, and the Issue is done when that PR/MR is merged there. New `huddle land <pr> [--check]` (AI Manager only) closes
  the Issues the merged PR names, since the platforms only close an Issue on a merge into the default branch; it is idempotent, never reopens and
  never touches an Issue the PR does not name. New adapter operations `reviewInfo(n)` and `mergedReviews(base, { limit })` on both platforms.
  `huddle labels` warns about an open Issue that a merged staging PR closes, and never closes it. `huddle clean` judges by `origin/<staging_branch>`.
  `/huddle-play`, `/huddle-issue`, `/huddle-review`, the CLAUDE.md block and the Issue/PR/MR templates say it. With it unset nothing changes.

### Changed

- `/huddle-watch` checks what waits as soon as it is turned on (Issue #107). After creating the job it runs `huddle queue --json` once in
  the same turn and handles the items as a tick does, instead of waiting for the first tick (which could come up to about 7 minutes later
  for a 5-minute watch). Unlike a tick, the first check says «Nothing is waiting for the AI Manager.» when nothing waits. The ticks, `off`,
  `status` and the interval do not change.

## [0.7.0] - 2026-11-12

### Changed

- `/huddle-update` updates everything with one command (Issue #104). It updates the plugin (`claude plugin marketplace update huddle` and
  `claude plugin update huddle@huddle --scope project`), refreshes the project's files in a worktree and branch of its own
  (`huddle-update-<version>`) with the **new** version's templates, asks only the pending questions, opens the PR, and ends by telling
  the person to type `/reload-plugins` (terminal and VS Code); «restart Claude Code» is the fallback. The person no longer switches branch
  or opens a terminal. `newPluginRoot` in `lib/core/update.mjs` finds the new version's folder. Every text that said «open a new session»
  after installing or updating the plugin now says `/reload-plugins`, with a restart as the fallback. The first update to a version that has
  this skill is done the old way, because the installed `/huddle-update` is the old one; from then on it is one command. The release that
  carries it is 0.7.0.

## [0.6.0] - 2026-11-12

### Changed

- **Breaking:** `/huddle-play <n>` replaces `/huddle-start` and `/huddle-continue` (Issue #100). One command to work on an Issue: with no
  branch the session starts it (dependencies, branch in its own worktree, TDD, PR/MR), with a branch it continues it (`huddle pending`,
  `huddle take`, «Ready for review again»). A Design Issue keeps its own flow. `/huddle-start` and `/huddle-continue` no longer exist: no
  alias, no deprecated copy. An Issue or a review comment written before this release that says `/huddle-start <n>` or `/huddle-continue <n>`
  will not work until it is edited to `/huddle-play <n>`. The `huddle` CLI, the labels and `/huddle-watch` are unchanged. The release that
  carries it is 0.6.0.

### Fixed

- `huddle labels` no longer fails for the whole repo because of one «Depends on» line (Issue #99). A line now means the Issues it starts
  with (`- #209 (migration 071, PR #407: …)` depends on #209 only); a `#N` in the note after them is ignored. A number that is not an
  Issue (a PR/MR, a typo, a deleted Issue) keeps the Issue `blocked` and prints one warning naming the Issue and the number; the other
  Issues still get their labels. A real failure (login, network, rate limit) still stops the run. **Behaviour change:** the run of
  numbers ends at the first word that is not «and», so `- #12 and also #13` loses #13: put one `- #N` per line.

## [0.5.3] - 2026-11-11

### Changed

- The Markdown guides, the `/huddle-setup` skill and the setup report, `huddle doctor` and `huddle update` messages now give both routes
  (Issue #96): the terminal commands for people who have `claude`, and `/plugins` (**Install for this project**) for people who use only the VS Code
  extension. They no longer say the extension «has no `/plugin`» and stop there.
- The PDF guides and the website now name the 0.5.x commands (Issue #94): `/huddle-update` and the per-project update steps
  (`--scope project`), `/huddle-continue`, `/huddle-watch` and `huddle queue`, the daily notice (`huddle notice`) and the stop labels. They also give the VS Code route (`/plugins`, «Install for this project»), which the extension needs because it has no `/plugin` command.

## [0.5.2] - 2026-11-11

### Added

- `huddle notice [--json]` (Issue #91): the «newer Huddle» notice from inside the skills, so it shows in VS Code too. `/huddle-start`,
  `/huddle-continue` and `/huddle-update` begin with it and say its text in the chat, in the person's language, then go on with the task.
  It is read-only, needs no login, always exits 0 and keeps its own daily stamp (`skillShownAt`) apart from the hook's `shownAt`.

### Changed

- The update steps (notice, `huddle doctor`, team guide) now say `claude plugin update huddle@huddle --scope project`: Huddle is
  installed per project and `claude plugin list` shows one entry per scope, so each project is updated on its own.

## [0.5.1] - 2026-11-11

### Added

- `huddle queue [--json]` and `/huddle-watch` (Issue #88): the AI Manager's session checks every few minutes (default 5, from 2 to 60)
  what waits for it and runs `/huddle-review` on each PR/MR that waits, which merges when all is good. `huddle queue` is read-only and
  lists three cases from the platform data, not from label text: a `review` (open non-draft PR/MR, no request), a `decision`
  (`needs decision`, nobody answered) and a `triage` (`needs triage`). The watch never answers decisions or triages bugs, never retries a
  stopped review on the same `head`, stops with `/huddle-watch off` or when Claude Code closes, and a recurring job expires after 7 days.
  Turning it on is the AI Manager's order to review and merge.

## [0.5.0] - 2026-11-11

### Added

- `/huddle-continue <n>` (Issue #83): continues an Issue that was already started after the AI Manager answered it (a review or a decision).
  It enters the Issue's worktree, takes the pending request and follows it, so the developer no longer copies the prompt by hand.
  `/huddle-start <n>` now only starts (on an Issue that is already started it says so and continues it anyway, so old prompts keep working),
  and the first line of the AI Manager's prompts says `First run /huddle-continue <n>`. No new CLI command.

- `huddle update` and `/huddle-update` (Issue #81): bring a repo that already has Huddle to the installed version in one step, and ask
  only the questions a new release added. `huddle.json` gets `setup_version`; new questions come from a registry
  (`lib/setup/questions.mjs`, empty in 0.4.x) and are never asked twice. `huddle update [--check] [--dry-run] [--json] [--answer key=value]`
  needs no login and no network, changes nothing and exits 3 while a question is unanswered. `huddle doctor` has a `setup` line, and the
  update notice for the AI Manager now says `/huddle-update`.

### Fixed

- `in progress` and `in review` no longer sit next to `needs decision` or `changes requested from AI Manager` (Issue #85). Those two are stop labels: while one is on, the labels job shows only it, and the usual status comes back by itself once the request is taken or the question is answered. A pending request now has no status label with or without an open PR.

- `/huddle-setup` no longer asks the initial questions again in a repo that already has a valid `huddle.json` (Issue #79). The skill
  now reads `huddle.json` first: a valid file means a refresh that asks nothing (the block and the templates are updated, and the report
  says what changed and which templates were kept because the project edited them); a missing or incomplete file is asked only for the
  fields that are missing; a first install still asks all five. The CLI already worked this way; only the skill's text was wrong.

## [0.4.2] - 2026-11-11

### Added

- Finished worktrees clean themselves (Issue #76). Every Issue's session works in a worktree in `.claude/worktrees/` and nothing
  removed them, so in a project with dependencies each one kept its own `node_modules` until the disk was full. New command
  `huddle clean [--dry-run] [--no-fetch] [--quiet]` removes a worktree only when all of this holds: it is under
  `<main worktree>/.claude/worktrees/`, it is not the current or a locked one, nothing in it is uncommitted, its commit is
  merged into `origin/<default_branch>`, and it has not been touched for 24 hours. It deletes `node_modules` first (with retries
  for Windows file locks), then `git worktree remove` without `--force`, then `git worktree prune`; the local branch stays.
  The SessionStart hook starts it as a detached background process, so a slow delete never delays a session; `"clean_worktrees": false`
  in `huddle.json` turns that off. Git only (no `gh`/`glab`); squash merges are not detected, so those worktrees stay. Works on Windows,
  macOS and Linux: paths are compared after `realpath`, case-insensitively on Windows and macOS. CI now runs on all three.
  Design: `docs/design.md` §16.

### Fixed

- The session no longer switches to English in a repo set up with Huddle (Issue #74). The block of `CLAUDE.md` now has a
  «Language» rule: chat in the developer's language (the `language` key of their `~/.claude/settings.json`, else the
  language of their own words, never that of a pasted Issue prompt or of Huddle's output) and write everything in the repo
  in English. The first-day guide tells each developer to set `language` once. Run `/huddle-setup` again in each repo to
  refresh the block.

## [0.4.1] - 2026-11-09

### Fixed

- The progress Issue is updated again (Issue #69). Since 0.4.0 the labels job printed «Progress not updated: now.getTime
  is not a function»: the real `ctx.now()` returned milliseconds for the update notice, while progress expected a Date.
  `ctx.now()` is now a Date everywhere, the update notice reads its milliseconds, and every test clock comes from one
  `fakeNow` with the real shape. A new test runs the real context from `lib/cli/main.mjs`.
- Setup no longer adds a second labels job (Issue #70). It finds the one a project already runs by what it does (a
  workflow, or `.gitlab-ci.yml` and the local files it includes, that runs `huddle labels`), keeps it, and says so in its
  notes. When that job pins an older Huddle in `HUDDLE_REF` (a tag, or a SHA with its tag in a comment), the notes say to
  update it in a PR; a SHA without a tag gets a note to check it.

## [0.4.0] - 2026-11-09

### Added

- A notice when a newer Huddle exists, and auto-update (Issue #65). The SessionStart hook compares the installed version
  (`.claude-plugin/plugin.json` in the plugin folder) with the latest GitHub release (`releases/latest`, unauthenticated,
  3 s timeout, cached 24 h in Claude Code's data folder). When the release is newer (a pre-release never counts) it prints
  one block, at most once a day, that tells the session to say it first in the person's language: the two commands, or
  «pull your clone» when running with `--plugin-dir`, and the link to the release. The AI Manager's block adds «run
  /huddle-setup on a branch in each repo». Any failure (no network, HTTP error, bad JSON, slow answer) is silent.
  `huddle doctor` has a `version` line (✔ latest, ⚠ behind with the commands, ⚠ could not check). A new test fails when
  the newest released section of `CHANGELOG.md` is not the version of `plugin.json`, `package.json` and `marketplace.json`.
  Docs: «Updating Huddle» in the team guide, and a «turn on auto-update» step (🙋 Only you) in the first-day guide.
  `/huddle-setup` does not write `autoUpdate` in the project settings: it could not be proven in a sandbox (see the PR).

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

### Fixed

- The four steps on the home page had no side margin on a phone, with `prefers-reduced-motion: reduce` or with JavaScript off
  (Issue #63): only the pinned wide-screen rule gave the list a margin. The plain `.steps` rule now uses `--gutter` like
  `.wrap`; the pinned sideways scene is unchanged. The site test checks that rule and that every block of a scene outside
  `.wrap` has a `--gutter` rule, so the next section cannot repeat the bug.

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
