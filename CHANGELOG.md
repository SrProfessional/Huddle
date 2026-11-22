# Changelog

All notable changes to Huddle: Decision-led development for teams coding with AI. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Added

- Huddle tells the machines of one login apart (Issue #283): `huddle machine` shows this machine's id and name (`huddle machine <name>` sets it), a session that starts or takes an Issue leaves a «Working on this from <name>» claim on it, and `huddle next` counts only this machine's work against the capacity. Work claimed by another machine is listed apart in `next` and `status`, is never offered here, and its allowed files still keep a clashing Issue waiting. No new label.

### Fixed

- Closed Issues no longer leave abandoned wait warnings after `huddle land`, `huddle labels --issue`, or `huddle clean` (Issue #281). Running waits keep their heartbeats, and a closed Issue whose marker remains points to `huddle wait <n>` for cleanup.

## [1.0.0] - 2026-11-22

### Added

- A guided test of staging (Issue #269): the `/huddle-test` skill (`$huddle-test` in Codex) walks the Coach through the Issues in staging that are not tested, one at a time and in an order it explains, with plain steps for each, and marks an Issue «tested in staging» only after the Coach says it passed. The Task templates have an optional «How to test in staging» section, `/huddle-issue` asks for it, and `/huddle-release` points to `/huddle-test`.

### Fixed

- The dashboard's API cost is audited (Issue #276): hand-worked tests pin that input, output, cache-read and cache-write tokens are each priced at their own list price, for Claude Code and for Codex, and that a range's total equals the sum of its models, tools, people and Issues. No price arithmetic was wrong; the figures of 2026-11-21 differed because Claude 5.x models had no price before #265. §26 states how each kind is priced.
- The dashboard ignores zero-token rows (Issue #272): a row with no tokens at all, such as Claude Code's `<synthetic>` messages, is never named under «No price for» and never makes a cost «partial». A model with tokens and no price still does. `huddle usage` is unchanged.
- Tokens are attributed to their Issue (Issue #266): `huddle usage` showed `no Issue` for every row because the Issue was looked up only through an open PR/MR, and the transcripts of finished (removed) worktrees were not read at all. It now also finds the Issue through the merged PR/MR of the branch (by its own source branch, asking for the branch by name when it is older than the newest 200), and reads the Claude Code and Codex transcripts of removed worktrees, using the recorded branch or the folder name, and only those inside this checkout. The default branch stays `no Issue`.
- Claude Code model names find their API price (Issue #265): `claude-opus-5-5` (with an optional date suffix) matches `anthropic/claude-opus-5.5` by a general rule, so the dashboard stops saying «no price» for them. The old aliases still work, and an unknown family or version still has no price.

### Changed

- The Get started page shows step 1 in tabs (Issue #273): «Claude Code» and «OpenAI Codex», and inside Codex «Install» and «macOS», so a person sees only the path they chose. Built by `site/js/tabs.js` as accessible tabs (arrow keys, Home and End, visible focus, no animation under reduced motion); the page still shows all its text without JavaScript. `#codex` and `#mac-codex` open the right tab, a change of tab updates the hash without scrolling, and the last tab is remembered in the browser (the hash wins).
- The dashboard shows the API cost only (Issue #264): the «Paid in plans» column, the plan figures and the verdict about plans are gone from the page and its model. `huddle plan` and `huddle prices` work as before.
- An assigned Issue that waits for a file it shares with an active Issue shows `blocked` on the board (Issue #250), as a dependency wait does, with the Issue and the file in the output of `huddle labels` and `huddle next`; it goes back to `assigned` when the conflict clears. No new label; a wait for capacity alone stays `assigned`.
- Faster review rounds, never CI (Issue #244): the Coach runs the full suite only when it is about to approve, on the exact head it merges in a
  fresh worktree (never a merge without that run); a docs-only round is approved without a new run; the Player runs the tests of the area it
  touched while it fixes and the full suite once, right before pushing. No workflow is added.
- The Coach's watch checks every 2 minutes by default instead of 5 (Issue #243), so a ready PR waits less. No setting in `huddle.json`; `/huddle-watch 10m` still sets another interval.

### Fixed

- Dashboard readability (Issue #262): token tables fit within their cards, partial API costs are separated from plan costs, and the daily
  chart shows localized dates and accessible counts.
- Parallel play never goes over the Player's capacity (Issue #240): a request that came back with changes requested and waits for room still
  holds its points, so `huddle next` no longer starts an Issue that would put the used points above the capacity; over capacity it starts nothing
  and says «6 of 5 points in use: finish one first».

### Added

- The dashboard (Issue #232): `/huddle-dashboard` (`$huddle-dashboard` in Codex; the `dashboard [--no-open]` command of the CLI) writes a private dark page to
  `.huddle/dashboard/index.html` and opens it: summary (Issues closed, team tokens, would cost by API, paid in plans, the difference), progress by area,
  who does what now, tokens and cost per person, tool and model, cost per Issue and per effort point, pace (Issues closed per day, median time from start
  to merge, review rounds) and releases, with a 7 days / 30 days / all filter. Nothing is loaded from the network, and `prefers-reduced-motion` gets a
  still, complete page. Setup and update add `.huddle/` to `.gitignore`, and the progress Issue says how to open it. The adapters gain `issueBody`.
- The session start never offers a request another session already took (Issue #239): before asking «Do you want me to continue?» the session runs
  `huddle pending` again, and `huddle take` on a request already marked 👀 says so in one line and exits 1.
- The Player keeps working by itself (Issue #248): `/huddle-play` with no number resumes the Coach's requests nobody took, starts what fits,
  and keeps one Player watch (`huddle next --wait`, `--codex` in Codex) that wakes the session when there is something to do, with no tokens.

- The Coach merges when the PR/MR is correct and safe (Issue #252): a review asks for changes only for what blocks; a rarer edge case or
  extra hardening is merged and written right away as a new Issue, instead of another round.
- Each person's token summary is shared on the `huddle-usage` branch (Issue #230), numbers only, at most once an hour from the session
  start, written without touching the working tree or the current branch; `huddle usage --team` sums the team and keeps each person apart.
  Only in a private repo by default: a public one shares nothing unless `share_usage` is `true` in `huddle.json`.
- Five base skills adapted from MIT-licensed Superpowers (Issue #235): `huddle-tdd`, `huddle-debug`, `huddle-verify`,
  `huddle-answer-review`, and Coach-only `huddle-brainstorm`. They are concise, work in Claude Code and Codex, retain
  Huddle's Issue/worktree/review rules, and carry their upstream attribution in `skills/THIRD-PARTY.md`.
- The website now uses Huddle's dark dashboard palette, system typography, glowing controls and drifting colour.
- API and subscription prices (Issue #231): the new prices command reports the daily OpenRouter/LiteLLM API table and dated Claude and
  ChatGPT plans; the plan command stores each person's selections locally, and `huddle.json` can carry negotiated plan overrides.
- Local token accounting for the dashboard (Issue #229): the new usage command reads Claude Code and Codex transcripts
  from this machine, across the checkout and its worktrees, grouping numeric totals by day, tool, model and Issue. It never sends the
  transcript data to the platform; broken or half-written lines are skipped with a stderr warning.
- Updating Huddle works in Codex (Issue #225): in a Codex session the version notice, `huddle doctor` and `/huddle-update` give Codex's
  steps (`codex plugin marketplace upgrade huddle`, `codex plugin add huddle@huddle`, a new chat) instead of Claude Code's.
- The README, the team guide and the website cover OpenAI Codex (Issue #227): Huddle works in Claude Code and OpenAI Codex, the Coach
  and the Players may use either, the Codex install and update, one watch per repo, and what is adapted but not yet tried live in Codex.
- The README, team guide and get-started page give Mac setup steps for Huddle in Codex and explain how a Coach switches the watch
  between two computers (Issue #246).
- Take over a stuck watch, when the person asks (Issue #222): if the session that holds the watch took something to review and never came
  back (closed, or out of quota), `/huddle-watch` in another session says what it took and when, and asks «Take over?».
- The language holds in Codex (Issue #221): the session start names it in full («Spanish»), Huddle's own messages never change it, and the
  messages Huddle sends into a Codex chat end with «Answer the person in Spanish.».
- The docs say the Coach can work in Codex too (Issue #214), with one watch per repo whatever the tool; only design work needs Claude Code.
- A set-up repo comes nearly ready in Codex (Issue #215): setup and update write `.codex/config.toml`, which declares Huddle for Codex in
  that repo; a new machine needs one `codex plugin marketplace upgrade huddle` and the hook trust. `huddle doctor` and the session start say
  when this machine has Codex without Huddle.
- The Coach's skills work in Codex (Issue #213): review, issue, bug, decide, areas, team and release. Design Issues and design reviews
  still need Claude Code.
- The Coach's watch in Codex (Issue #212): `/huddle-watch` waits with no tokens in a process of its own and wakes the Codex chat when
  something waits; `/huddle-watch always` starts it in each Codex session too, unless another session already holds the watch.
- One watch per repo, whatever the tool (Issue #211): with Claude Code and Codex open at once on the Coach's login, the first session
  that turns the watch on keeps it (also while it reviews), and the other says where it runs and does not start a second one. The watch's
  marks now live in `~/.huddle`, read by both tools; the ones set before are kept. `huddle status` names the tool of the running watch.
- Each person's language, in Claude Code and Codex (Issue #209). The session start names it, so even a session opened with only a
  command answers in it: the person's own (`huddle language <lang>`), else the team's (`language` in `huddle.json`, asked by
  `/huddle-setup` and once by `/huddle-update`), else the machine's. The repo stays in English.
- Codex hook trust (Issue #207): the VS Code chat has no `/hooks`, so Players trust Huddle's SessionStart hook once in terminal Codex,
  which shares its configuration; the team guide gives the Windows `--no-daemon` steps and the same check after an update.
- A mixed team (Issue #202): the README and the team guide say how a Player works in OpenAI Codex while the Coach stays in Claude Code,
  one person on two plans if they like, with the Player's setup in plain steps. `huddle wait --codex` refuses with one clear line inside a
  Codex sandbox with no network, and `/huddle-play` runs the commands that reach the platform with network access.
- `/huddle-play` works in OpenAI Codex (Issue #201). `huddle wait <n> --codex` waits in a process of its own with no tokens and, when the
  Coach answers, sends the Codex session a message to go on (`codex queue`; an open Codex chat in VS Code answers it by itself). In Codex
  the Player never reviews or merges, even on the Coach's login; Design Issues and the Coach's skills stop there with one line.
- Huddle installs in OpenAI Codex (Issue #199): `codex plugin marketplace add SrProfessional/Huddle`, then `codex plugin add huddle@huddle`.
  The skills and the session-start hook run there; in Codex the hook always tells the session where the `huddle` command is. Proven on a
  real Codex (docs/design.md §25). For Players; the Coach stays in Claude Code.
- The Huddle rules in `AGENTS.md` too (Issue #200), the first step for OpenAI Codex: setup and update write the same managed block into
  `CLAUDE.md` and `AGENTS.md`, keeping the project's own text outside the markers. A repo set up before gets `AGENTS.md` on its next
  `/huddle-update`.

### Fixed

- Huddle skills send Issue, PR/MR and comment text from temporary files in Claude Code and Codex (Issue #241), preserving line breaks and backslashes on Windows.

## [0.9.5] - 2026-11-17

### Changed

- Reviews cost less (Issue #195). A PR/MR that no longer merges cleanly into its base is not reviewed: the watch sees it with no Claude
  tokens (`huddle queue` now carries each review's `merge` state) and asks the Player itself to bring in the base branch, once per head.
  The Player's session merges the base in before opening the PR/MR and before «Ready for review again». A later review round reads only
  the diff since the head it reviewed (`Reviewed head: <sha>`), and the review keeps only the summary lines of the test output.

## [0.9.4] - 2026-11-16

### Changed

- The Coach's session decides what has a clear best answer and keeps going (Issue #189). It no longer stops on technical or process
  questions (a budget, a file a test needs, the order of the work, the follow-up Issues it proposed, a Player's technical decision): it
  takes the best option and says in one line what and why. It still asks about the product, money, secrets, security, deleting and
  production. Old names: the block says «AI Manager» and «developer» in older text mean the Coach and the Player, and `/huddle-update`
  rewrites them in the project's own `CLAUDE.md` text.

### Fixed

- The watch comes on time, and a failing round shows (Issue #191). A round now starts every interval from the start of the previous one,
  and the full labels pass runs at most every 15 minutes, so a ready PR waits at most one interval (it could wait ~10 minutes on a big
  project). The heartbeat of the watch and of the Players' waits is written only after a good round; a failing round records its error,
  and `huddle status` shows it. The Coach's session reads `huddle queue` before saying what waits, never its memory.

## [0.9.3] - 2026-11-15

### Fixed

- One repo, one id on the machine, whatever the case of its path (Issue #185). On Windows the same folder can come as `d:\...` or `D:\...`
  (VS Code and a terminal differ), and Huddle saw two repos: `/huddle-watch always` set from one was not seen from the other, and
  `huddle status` could miss a live watch. The id now comes from the normalized path; what was set under the older id still counts.

## [0.9.2] - 2026-11-15

### Added

- `huddle status`: is the watch alive, and are the review waits? (Issue #181). The watch and each Player's wait leave a heartbeat every round
  on the machine; `huddle status` (no network, no login) and `huddle doctor` say each one's last check, and a stale one says how to start it
  again. `/huddle-watch status` uses it, so it answers right even when its session lost track.

### Fixed

- Huddle works on every branch of a set-up repo (Issue #179). On a branch with no `huddle.json` (made before Huddle was set up) it reads
  the default branch's copy from git, with no network, and says so in one line; `huddle doctor` says which copy it read. `huddle update`
  and setup change nothing there and say how to bring the file. The session start says when the branch has no Huddle block in
  `CLAUDE.md` and where the team's rules are. Huddle no longer looks for `huddle.json` outside the git repo, so a worktree under
  `.claude/worktrees/` never takes the main checkout's file.

## [0.9.1] - 2026-11-15

### Fixed

- The Coach's session merges a reviewed Issue PR/MR without stopping to ask (Issue #175, H72). The `CLAUDE.md` block has «Standing
  orders of the Coach»: merging into staging after `/huddle-review`, `huddle land`, the labels, and the PRs/MRs of `/huddle-update` and
  `/huddle-team` need no confirmation; only `/huddle-release` (staging to production) asks. A Coach who works on an Issue (a team of one)
  goes on from the PR/MR to the review and the merge by itself. Run `/huddle-update` in each repo to get the new block.

## [0.9.0] - 2026-11-15

### Added

- The website and the PDF guides say effort, capacity and the parallel work (Issue #171, H71): a new «Effort and capacity» section on
  «How it works», `/huddle-play` alone on «Get started» and in the first-day PDF, and one paragraph in the guide PDF.
- The Coach's watch reviews several PRs/MRs at once, by effort (Issue #165, H68; `docs/design.md` §19 and §24). Each review is a
  background subagent with a clean context, within `review_capacity` effort points (default 5); the subagents never merge. The watch
  merges one at a time, checking each PR/MR again against the updated base first, and asks for an update instead of merging when it no
  longer merges cleanly or its tests fail. Review items of `huddle queue --json` carry their `effort`.
- One Player session works on several Issues at once, by effort and capacity (Issue #164, H67; `docs/design.md` §24). `/huddle-play`
  with no number hands each assigned Issue that fits to a background subagent with a clean context, keeps the review waits in the main
  session, continues the same subagent when the Coach asks for changes, and starts the next one when room frees. The capacity is 5 points
  by default (`capacity`, `capacity_per_person` in `huddle.json`); a Player can only lower theirs, on their machine (`huddle capacity`).
  `huddle next` shows what starts and what waits. Work in review uses no room; two Issues that share a file never run at once.
- Each Issue has an effort of 1, 2 or 3 points (Issue #162, H66; `docs/design.md` §24). Every Issue template has an «Effort» section
  (2 when an Issue has none). `huddle effort --suggest <file>` proposes one from the Issue's allowed files, tests, migrations and folders,
  and says when an Issue is too big and should be split; `/huddle-issue` and `/huddle-bug` use it. `huddle effort <n>` shows an Issue's
  effort. It is the base of the parallel work of #164 and #165.

- `/huddle-watch always` keeps the watch on (Issue #160, H65). `huddle queue --always` leaves a mark for the repo on the AI Manager's machine
  (never in the repo), and each of their session starts there says «the watch starts now, as you asked» and has Claude start it before
  anything else. `/huddle-watch off` also forgets it. A developer's login never starts it.

### Changed

- **The roles are now Coach and Player** (Issue #166, H70). The person who writes the Issues, answers the decisions, reviews and merges
  was the «AI Manager» and is now the **Coach**; the people who work on the Issues with a Claude Code session, code or design, were
  «developers» and are now **Players**. Every guide, PDF, website page, skill, template, the `CLAUDE.md` block and the CLI messages use
  the new names; the skill names do not change. Nothing breaks: `huddle.json` takes `coach` (setup writes it on a new repo), and
  `ai_manager` keeps working (both set to different logins is an error). The label «changes requested from AI Manager» is now
  «changes requested from Coach»: the full `huddle labels` renames the old one once, and both names are read until then. GitLab's own
  member role «Developer» keeps its name. The website and the guide PDF also say `/huddle-watch always`.

- `/huddle-watch` waits in the background with no Claude tokens while nothing waits (Issue #157, H64). It was a recurring job that woke
  the AI Manager's session every few minutes for a Claude turn that mostly found nothing, and it expired after 7 days. Now the session
  runs `huddle queue --wait [seconds] [--seen <keys>]` as a background command, the way a developer's session runs `huddle wait`: a Node
  loop that reads the queue each round and wakes the session as soon as something new waits; only a round with nothing new runs the
  labels pass (it took minutes on a real project, the queue seconds). `huddle queue
  --wait-off` stops it at its next round. The review is still done by the session's own model, and turning the watch on is still the AI
  Manager's order to review and merge. The guides, the guide PDF and the website say so.

## [0.8.5] - 2026-11-15

### Fixed

- One command sets the session's label and recomputes the Issue (Issue #153, H63). `huddle labels --issue <n> --started` adds
  `in progress` and takes `assigned` off; `--needs-decision` adds `needs decision` and takes `in progress` off, in the same run.
  `/huddle-play` and the `CLAUDE.md` block use them instead of «add the label, then run labels», which a real session left half-done
  (`assigned` next to `in progress`, then `in progress` next to `needs decision`). The labels output says what goes on and what comes off
  instead of «(keeps its label)».

- A developer's session that stops for a decision keeps waiting for the answer (Issue #151, H62). After «⛔ Issue #N stopped: waiting
  for a decision», `/huddle-play` starts `huddle wait <n>` in the background, as it does after the PR/MR, so the AI Manager's answer
  from `/huddle-decide` is picked up by itself. Before, the developer had to notice it and type `/huddle-play <n>`.

## [0.8.4] - 2026-11-15

### Fixed

- Setup and update say only what the person must do (Issue #147, H61). `/huddle-setup` run by a developer on a project already set up
  stops and changes nothing: it names the AI Manager and points to `/huddle-play`; with an old clone that has no `huddle.json` yet, it
  finds the file on the remote's default branch and says to update the copy instead of offering the developer's own login as AI Manager.
  `/huddle-update` no longer repeats the first-install notes (run `huddle labels` once, send the install routes), and its last line says
  that the files apply to every branch once its PR/MR is merged, while the plugin is per machine. When the AI Manager runs it, the session
  merges the update PR/MR itself, without asking (a developer's session still never merges).

## [0.8.3] - 2026-11-15

### Fixed

- The update notice and `huddle doctor` name the scope Huddle is installed in (Issue #143, H60). They read Claude Code's
  `installed_plugins.json`: a user install gets `claude plugin update huddle@huddle --scope user`, a project install keeps
  `--scope project`, and the per-project command stays the fallback. Before, a user install was always told `--scope project`.

## [0.8.2] - 2026-11-15

### Added

- The AI Manager's session start says what waits for them (Issue #138, H59): one line with the PRs/MRs to review, the decisions and the
  bug reports to triage, from the same computation as `huddle queue`. It only informs: nothing is reviewed or merged until the AI
  Manager asks. The README, the guides, the PDFs and the website now say what waiting costs: the developer's waiting session uses no
  Claude tokens and no GitHub Actions or CI minutes, and each `/huddle-watch` check is a short Claude turn; the home and get-started
  pages name `/huddle-watch`.

### Fixed

- `/huddle-update` always gets the newest Huddle (Issue #136, H58). It updates the plugin every time instead of trusting the release
  lookup, which is cached for a day: a cache read before a release made a repo on 0.8.0 skip 0.8.1 and ask the removed `labels_job`
  question. It updates the install this project uses, read from `claude plugin list --json` (`--scope project` or `--scope user`). A
  cached release older than the installed plugin is looked up again, and `huddle doctor` always looks up fresh.

## [0.8.1] - 2026-11-14

### Changed

- The README, the guides, the PDFs and the website match 0.8.0 (Issue #132, H57). They no longer describe a cloud labels job, a GitLab
  schedule or `HUDDLE_TOKEN` as default steps: the sessions keep the labels right on both platforms. The first-day guide, both PDFs and the
  «How it works» page state that every change to an Issue goes through a session and that the next one repairs the board; the website and
  the guide PDF describe the staging flow (`staging_branch`, `huddle land`, `huddle tested`, `/huddle-release`), with a new «Staging»
  section on «How it works». The GitLab job template no longer calls `hourly` the default, and `/huddle-setup` no longer says nothing uses
  the staging branch. A new test keeps the old sentences out.

- `/huddle-setup` and `/huddle-update` no longer ask how the cloud labels job runs (Issue #130, H56; `docs/design.md` §23). Every repo gets
  `sessions` with no question (no cloud job, no CI minutes), and setup and update do not write the key: the session-start repair (§22) is the
  safety net, local and free. `hourly` and `events` keep working when written by hand in `huddle.json`, and a value already there is kept; no
  skill or guide offers them. The note for a leftover labels job file now says to set `"labels_job": "hourly"` in `huddle.json` instead of
  answering a question. The GitLab quickstart no longer lists a schedule or a token as default steps.

## [0.8.0] - 2026-11-14

### Added

- Issues change only through a session, and the board repairs itself when a session opens (Issue #125, H54; `docs/design.md` §22 and §23). The rule: every change to an Issue
  (create, edit, close, reopen, merge) goes through a Huddle session, which then runs `huddle labels`; still fine by hand: reading and commenting, the bug report form, and a tester's
  «✅ Tested in staging» comment. It is a rule, not a lock. New: `huddle labels --no-assign` (recomputes every label, never assigns); the session-start hook starts it in the background
  (at most once every 10 minutes per repo and machine, `--no-assign` unless the login is the AI Manager) and the next hook output or `huddle notice` says «Huddle corrected N label(s)»
  once; `"labels_on_start": false` turns it off. `/huddle-issue` and `/huddle-bug` run the full `huddle labels` right after creating the Issue; `/huddle-review` and `/huddle-release`
  describe how the AI Manager reopens an Issue. **The default of `labels_job` is now `sessions`** (see the next entry).

- `labels_job` in `huddle.json`: the cloud labels job is a safety net and each project chooses how much of it runs (Issue #121, H52, the second of two; `docs/design.md` §23).
  `sessions` (**the default** when the key is absent: no cloud job, no CI minutes), `hourly` (once an hour and on a manual run, a safety net) or `events` (every event, as before).
  One template per platform, rendered for the mode by `/huddle-setup` and `huddle update` (GitHub: the `on:` block; GitLab: the `rules`; `sessions` writes no file). On GitLab the
  interval is a project setting (cron `17 * * * *` for `hourly`, `*/10 * * * *` for `events`), told in the file's comment, the report and the skills. New question `labels-job`
  (`since: 0.8.0`), flag `--labels-job`, and a `labels job: <mode>` line in `huddle doctor`. An unedited labels file of any mode is refreshed to the mode asked; an edited one is kept and reported.
  **Behaviour change:** a repo with no `labels_job` key now gets `sessions` the next time its labels file is refreshed, instead of the every-event job it had; the report names the file that can be deleted in a PR.

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

### Fixed

- `huddle labels` updates the «Huddle progress» Issue again with a `staging_branch` set (Issue #119). The milestone query, with the references to each Issue that H47 added, asked for up to 510,050 nodes against
  GitHub's limit of 500,000, so the progress Issue never updated. With a staging branch it now reads 10 milestones per page (about 100,000 nodes in the worst case); the paging reaches the rest. Without one nothing changes.
  On GitLab, `huddle land`, `huddle tested` and `huddle release` now say «MR !N» where they said «PR #N» (GitHub keeps «PR #N»).

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
