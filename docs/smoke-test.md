# Smoke test (before each release)

Huddle's tests never touch a real GitHub or GitLab. This checklist is the one place where they are touched. The AI
Manager runs it by hand, once on a sandbox repo on **github.com** and once on a sandbox project on **gitlab.com**, before
every release. Tick a box only when you saw the result with your own eyes; write what you saw in [Results](#results).

Use a throwaway sandbox. Never run this on a team repo. Never paste a token into a chat, a file, an Issue or a commit.

Two sessions are needed: the **AI Manager** session (you) and a **developer** session (a second clone, or a second
person). `huddle` below means `node <plugin folder>/bin/huddle`, where the plugin folder is where Claude Code installed
the plugin (see `/plugin`), not a clone of the Huddle repo.

## 1. Setup

| | GitHub | GitLab |
|---|---|---|
| Sandbox | empty repo `<you>/huddle-sandbox` on github.com | empty project `<you>/huddle-sandbox` on gitlab.com |
| Login | `gh auth login` | `glab auth login` |

1. [ ] **Install the plugin from the marketplace**, in the AI Manager session. In the CLI: `/plugin marketplace add SrProfessional/Huddle`,
   then `/plugin install huddle@huddle`. The VS Code extension has no `/plugin`: in a terminal run
   `claude plugin marketplace add SrProfessional/Huddle` and `claude plugin install huddle@huddle`, then open a new session.
   `claude plugin list` (or `/plugin`) shows `huddle` enabled at the version under test (0.1.0, 0.2.0 for sections 9 and 10, or 0.3.0 for section 11), and `/huddle-setup` is available.
2. [ ] Create the sandbox and push a first commit to its default branch (a README is enough).
3. [ ] Run `/huddle-setup` in the sandbox. It writes `huddle.json` (`platform`, `project`, `ai_manager` = your login,
   `assignees` = the developer login), the CLAUDE.md block, the Issue and PR/MR templates, the labels job, and
   `.claude/settings.json` with `extraKnownMarketplaces.huddle` and `enabledPlugins["huddle@huddle"]`. Open
   `.claude/settings.json` and check both keys are there: setup wrote it, not you by hand.
4. [ ] Merge the setup to the default branch. **Each developer installs Huddle once on their machine** (see
   [first-day.md](first-day.md)): the settings snippet is only a helper and does not offer the plugin to a session that
   has not installed it. In the developer session run `claude plugin marketplace add SrProfessional/Huddle` and
   `claude plugin install huddle@huddle`, open a new session in a fresh clone of the sandbox, and run `huddle doctor`: it
   shows ✔ on `plugin`, and `/huddle-start` is available. Note in Results what you saw.
5. [ ] **GitLab only:** do the schedule and `HUDDLE_TOKEN` steps of [gitlab.md](gitlab.md) (Maintainer token, scope `api`,
   masked and protected variable; schedule `*/10 * * * *` on the default branch). Do the token step yourself.
   Then check the two machine requirements of [gitlab.md](gitlab.md#on-the-developers-machine): `glab` is on the PATH of
   the terminal that starts Claude (on Windows, open a new terminal after installing it; without it the hook stays
   silent and `huddle doctor` shows ✖ on `login`), and Git uses `glab` for gitlab.com
   (`git config --global --add credential.https://gitlab.com.helper "!glab auth git-credential"`, then `git ls-remote origin`
   works without a prompt). Labels change by the schedule, so they can take up to 10 minutes.
6. [ ] `huddle doctor`: ✔ on `huddle.json`, `login` and `ai_manager`. `labels` fails on a new repo, as the labels do not
   exist yet.
7. [ ] Run `huddle labels` once on the new repo: it prints «7 labels created.».
8. [ ] `huddle doctor` again: all ✔. The labels exist on the platform: `ready`, `assigned`, `in progress`, `in review`,
   `blocked`, `needs decision`, `changes requested from AI Manager`.
9. [ ] Run `huddle labels --dry-run`: it exits 0, prints no error and creates nothing.

## 2. An Issue with a dependency

1. [ ] Create Issue **A** from the template, with `## Depends on` set to `—` (none).
2. [ ] Create Issue **B** from the template, with `## Depends on` listing `#<A>`.
3. [ ] Run `huddle labels` (GitLab: **Play** the schedule, or wait up to 10 minutes).
4. [ ] A is `ready`, or `assigned` with the developer's login. B is `blocked`.

## 3. Start

1. [ ] In the developer session, run `/huddle-start <B>`: it must end with «⛔ Issue #B stopped: waiting for #A» and change
   nothing.
2. [ ] Run `/huddle-start <A>`. It creates a branch in its own worktree and adds `in progress` to A.
3. [ ] The session opens the PR/MR (see section 4) and starts `huddle wait <A>` in the background.

## 4. Pull request / merge request

1. [ ] The PR/MR is into the default branch, uses the template, and its description contains `Closes #<A>` (GitLab: the
   MR must target the default branch).
2. [ ] After `huddle labels`, A is `in review` and no longer `in progress`.
3. [ ] `huddle pending` prints nothing yet (no request).

## 5. A review request taken by a waiting session

1. [ ] As the AI Manager, comment on the PR/MR with a `## Prompt for Claude Code` heading and a text block asking for a
   small change (for example, one more line in the README).
2. [ ] The waiting `huddle wait <A>` ends and says a request is pending.
3. [ ] `huddle take <A>` marks the comment 👀 (reaction `eyes` on GitHub, award emoji `eyes` on GitLab) and prints the prompt.
4. [ ] The developer session pushes the change and comments «Ready for review again» with the counts.
5. [ ] **A comment by someone else is not a request.** Run this with a **second account** (**S**: a person or a test
   account that can comment on the PR/MR and is not the AI Manager), while no request of the AI Manager is pending
   (after step 4):
   1. S comments on the PR/MR with a `## Prompt for Claude Code` heading and a text block (for example «add a line to
      the README»).
   2. `huddle pending` prints nothing, `huddle take <A>` finds no request and does not mark S's comment 👀, and a
      waiting `huddle wait <A>` does not end.
   3. The `changes requested from AI Manager` label does **not** appear (GitLab: wait up to 10 minutes for the schedule,
      then check again).
   4. Then the AI Manager posts a real request: only that one is pending, and `huddle pending` shows the AI Manager's text,
      never S's. Take it and clear it as in steps 2 to 4.

   Write «not testable» in Results **only** if there is no second account.
6. [ ] The `changes requested from AI Manager` label shows while the request is pending, and goes away after the push.
   GitLab: it can lag up to 10 minutes after a comment; a push updates it at once.

## 6. The hook on reopen

1. [ ] As the AI Manager, post a second `## Prompt for Claude Code` request on the PR/MR. Close the developer session
   without taking it.
2. [ ] Open a new developer session in the sandbox with the installed plugin (no `--plugin-dir`): `claude`, in the sandbox clone.
3. [ ] **In the CLI** (`claude` in a terminal), when the session opens and **before typing anything**, the developer sees
   the visible line «Huddle: the AI Manager left 1 request…» (within the 45 s timeout), and `huddle pending` lists it.
   After the first message, Claude asks whether to continue. **In the VS Code panel** nothing shows until the first
   message; then Claude asks. That is expected behavior, not a failure: note it in Results.
4. [ ] Offline (network off), a new session still opens quickly and the hook stays silent.
5. [ ] The developer takes the request (`huddle take <A>`), pushes, and comments «Ready for review again».

## 7. Merge

1. [ ] Approve (GitLab: with a comment, as self-approval may be off), then merge as the AI Manager. The developer session
   never merges.
2. [ ] The merge is a merge commit, and on GitLab the source branch is **not** removed.
3. [ ] Issue A closes. On GitHub it shows `CLOSED` with `COMPLETED`.

## 8. The dependency unblocks

1. [ ] Run `huddle labels` (GitLab: Play the schedule).
2. [ ] B is no longer `blocked`: it is `ready`, or `assigned` to the developer.
3. [ ] Control: create Issue **C** depending on a third Issue **D**, then close D **by hand** with the platform's normal
   «Close issue» (on GitHub, closed as completed), with no PR/MR. After `huddle labels`, C is still `blocked`, and
   `/huddle-start <C>` refuses.
4. [ ] `/huddle-start <B>` now starts.

## 9. Progress

Needs Huddle 0.2.0 or later. Do GitHub and GitLab each in their own sandbox, and tick a box only for the platform you saw
it on (write the platform in Results). Leave `progress_issue` out of `huddle.json`, or set it to `true`.

1. [ ] **Two milestones.** Create milestone **Alpha** with the description line `Huddle remaining: 2` and milestone **Beta**
   with `Huddle remaining: 1`, each on a line of its own. Huddle never creates milestones, so this is done by hand
   (GitHub: Issues → Milestones; GitLab: Plan → Milestones).
2. [ ] **Issues in them.** Put these Issues in **Alpha**: **M**, closed by a merged PR/MR (`Closes #M`, merged as in section 7);
   **O**, left open; **H**, closed by hand with the normal «Close issue» (GitHub: as completed); and **N**, closed as «not
   planned» (GitHub: «Close as not planned»; GitLab has no such reason, so close it by hand and write that in Results).
   Put one more open Issue **P** in **Beta**, and leave one open Issue **X** with no milestone.
3. [ ] Run `huddle labels` (GitLab: Play the schedule, or wait up to 10 minutes). It ends without an error.
4. [ ] **The numbers follow the formula.** `huddle progress` shows **Alpha** with merged 1, total 2 (M and O; H and N count in
   neither), remaining 2, so **25%** (1 ÷ 4); **Beta** with merged 0, total 1, remaining 1, so **0%**; the project **Total 16%** (1 ÷ 6: merged 1 over total 3 plus remaining 3); and «no area» with X plus any Issue still open
   from the earlier sections (open Issues with no milestone from sections 1 to 8 count too, so close them first if you
   want exactly 1). The progress Issue itself is not counted.
5. [ ] `huddle progress --json` agrees with the table: the same areas, `merged`, `total`, `remaining`, `percent` and total.
6. [ ] **The «Huddle progress» Issue is created once.** One new Issue called «Huddle progress» exists, with the marker
   `<!-- huddle:progress -->` in its body and the same numbers as step 4. On **GitHub it is pinned**; on GitLab it is only
   created (no pinned Issues). It has no `ready`, `assigned` or `blocked` label.
7. [ ] **It is not rewritten when nothing changed.** Note the Issue's «edited» time (GitHub: the «edited» tag of the body;
   GitLab: the «edited» time of the description). Run `huddle labels` again: no second «Huddle progress» Issue appears and
   the edited time does not move.
8. [ ] **The session-start line shows the areas.** Open a new developer session in the sandbox clone (CLI, as in section 6).
   Before typing, the visible lines include `Progress: Alpha 25% · Beta 0% · Total 16%` (the order of the areas may
   differ), next to the pending-request line when there is one. VS Code panel: nothing shows until the first message, as
   in section 6. Offline, the line stays silent.
9. [ ] **Edit a remaining line and see it change.** Change Beta's description to `Huddle remaining: 3`, then run
   `huddle labels`. `huddle progress` shows **Beta** still 0% and the project **Total 12%** (1 ÷ 8: merged 1 over total 3 plus remaining 5), and the progress
   Issue is rewritten once with the new numbers (its edited time moves). Run `huddle labels` once more: it does not move
   again.
10. [ ] **A line that is not a number counts as 0.** Change Beta's line to `Huddle remaining: four`: `huddle progress` says
    the estimate is missing for **Beta**, and shows Beta with remaining 0, so the project **Total 20%** (1 ÷ 5: merged 1 over total 3 plus remaining 2).
11. [ ] **A milestone closed more than 90 days ago stays out.** Use a sandbox milestone that was closed more than 90 days
    ago (for example **Old**, with `Huddle remaining: 5` and one merged Issue). It does **not** appear in `huddle progress`
    or in the total, while a milestone closed this week **does**. A fresh sandbox cannot wait 90 days: if there is no such
    milestone, write «not testable» in Results for this step (the unit tests cover the cut-off with a fixed date).
12. [ ] **Switch it off.** Set `"progress_issue": false` in `huddle.json`, merge it, and run `huddle labels`: the existing
    Issue is not rewritten and no new one appears. `huddle progress` still works. Set it back afterwards.

## 10. Team members

Needs Huddle 0.2.0 or later. The **second account** of step 5.5 (call it **S**) is the person to add. If there is no
second account, use any login that exists on the platform and is not a collaborator, and write that in Results.

1. [ ] **The team is listed.** `huddle team` prints the AI Manager and each assignee of `huddle.json`, each with ✔ or ✖
   for «exists on the platform» and «can be assigned» (collaborator on GitHub, Developer or higher on GitLab). The AI
   Manager and the developer from section 1 show ✔ ✔.
2. [ ] **A login that is not a collaborator is warned about.** Run `/huddle-team add <S>` while S is **not** a collaborator
   (GitLab: not a member, or below Developer). It warns that S cannot be assigned, prints the step for the AI Manager
   (GitHub: Settings → Collaborators → Add people, or `gh api -X PUT repos/<project>/collaborators/<S>`; GitLab: Manage →
   Members → Invite members, role Developer), and **writes nothing**: no branch, no PR/MR, `huddle.json` unchanged.
3. [ ] **`huddle doctor` has the «team» check.** It shows ✔ on `team` while every assignee can be assigned.
4. [ ] **The AI Manager invites S.** Do the step of box 2 by hand. S accepts the invitation (GitHub: S accepts it by e-mail
   or at `github.com/<project>/invitations`; GitLab: an invited member is added at once).
5. [ ] **Add works through a PR/MR.** Run `/huddle-team add <S>` again. It runs `huddle team add <S>`, commits `huddle.json` on
   a new branch, and opens a PR/MR called «Team: add `<S>`» into the default branch. Only `assignees` changed in the diff
   (the other keys, the order and the line endings stay). The skill **did not merge it** and did not commit to the default
   branch, and it printed the message for the new person with the install commands.
6. [ ] The AI Manager merges the PR/MR. `huddle team` now lists S with ✔ ✔ and `huddle doctor` shows ✔ on `team`.
7. [ ] **Adding twice changes nothing.** `huddle team add <S>` says S is already there and changes no file.
8. [ ] **The «team» check warns.** On a scratch branch, `huddle team add <another login that is not a collaborator> --anyway`
   writes the file. `huddle doctor` then shows a ⚠ on `team` with the step for that login. Discard the branch afterwards:
   do not merge it.
9. [ ] **Remove works the same way.** Run `/huddle-team remove <S>`: a PR/MR «Team: remove `<S>`» with only `assignees`
   changed, not merged by the skill. The AI Manager merges it, and `huddle team` no longer lists S. Open Issues that S had
   keep their assignee.

## 11. Areas

Needs Huddle 0.3.0 or later. Do GitHub and GitLab each in their own sandbox, and tick a box only for the platform you saw
it on (write the platform in Results). Use a sandbox with **no milestones** for steps 1 and 2: delete or close the Alpha
and Beta milestones of section 9 first (a milestone closed more than 90 days ago stays out of the lists). Run `huddle`
as the AI Manager; the skill `/huddle-areas` refuses anyone else.

1. [ ] **No areas yet.** `huddle areas list` prints «No areas yet. Define them with the skill /huddle-areas, or create one:
   huddle areas set <title> --remaining N», plus a line «No area: N open, M closed» if Issues exist. `huddle areas check`
   says «Check-up: nothing to fix.» or lists only Issues with no area.
2. [ ] **The skill proposes and waits.** Run `/huddle-areas`. It reads the README, `CLAUDE.md` and the Issues, and proposes
   areas (any number) with a reason for each, and then **waits for the OK**: until you answer, `huddle areas list` still
   shows no areas and no milestone exists on the platform. Answer «only **Core** and **Docs**», and it runs
   `huddle areas set ... --dry-run` first and shows it before the real call.
3. [ ] **Set creates an area.** `huddle areas set "Core" --remaining 3 --description "The engine"` prints
   «Will create milestone «Core»» with the description lines `The engine` and `Huddle remaining: 3`, then «Done.». The
   milestone exists on the platform with that description.
4. [ ] **Set reuses it.** Run `huddle areas set "core" --remaining 4` (another case of the title): it prints «Will update
   milestone «Core»» and `remaining: 3 → 4`, and the platform still has **no second milestone**. Then edit the milestone
   description by hand to add a line `Notes: keep me` and run `huddle areas set "Core" --remaining 5`: the rest of its
   description (`The engine`, `Notes: keep me`) is kept, and only the `Huddle remaining` line changes. Run it once more
   with the same number: «Nothing to change.»
5. [ ] **Dry run changes nothing.** `huddle areas set "Docs" --remaining 2 --dry-run` prints «Would create milestone «Docs»»
   and «Dry run: nothing was changed.»; no milestone «Docs» exists afterwards. The same for
   `huddle areas assign <issue> "Core" --dry-run`: the Issue keeps its area. Then create Docs for real
   (`huddle areas set "Docs" --remaining 2`).
6. [ ] **Assign an open and a closed Issue.** Take an **open** Issue **O2** and a **closed** Issue **C2** (the merged one of
   section 7 will do), both with no area. `huddle areas assign <O2> "Core"` prints «Will put Issue #<O2> in area «Core»
   (now: no area).» and «Done.»; the same for `<C2>` with «Docs». On the platform each Issue shows its milestone. Repeating
   the command says «already in area … Nothing to change.»
7. [ ] **A closed area.** Close the milestone **Docs** on the platform (GitHub: Milestones → Close; GitLab: Close milestone).
   `huddle areas list` shows it as «Docs (closed)». Then `huddle areas assign <O2> "Docs"` works on the **closed** area
   too: the Issue is in Docs, and the milestone **stays closed**. `huddle areas set "Docs" --remaining 2` also keeps
   it closed and says so («the milestone is closed and stays closed»). Reopen it afterwards if you need it.
8. [ ] **None takes an Issue out.** `huddle areas assign <O2> none` prints «Will take Issue #<O2> out of area «Docs»» and
   «Done.»; the Issue has no milestone on the platform.
9. [ ] **Check finds the gaps.** Create an open Issue **Z** with no area, and a milestone **Bare** by hand with a description
   that has **no «Huddle remaining» line**. `huddle areas check` lists **Z** under the Issues with no area, and **Bare** as
   «No «Huddle remaining» line». `huddle areas check --json` has `noArea` with Z and `missingEstimate` with Bare. Fix it
   with `huddle areas set "Bare" --remaining 1` and `huddle areas assign <Z> "Bare"`: `check` is then clean for them.
10. [ ] **Progress reflects the changes.** `huddle progress` shows the areas Core, Docs and Bare with the Issues and the
    `remaining` you set, and the percentages follow the formula of section 9. Run `huddle labels` (GitLab: Play the
    schedule): the «Huddle progress» Issue is rewritten once with the same numbers.
11. [ ] **The doctor line for a missing CLI.** Make `gh` (GitHub) or `glab` (GitLab) invisible to the terminal: rename the
    executable, or start a terminal whose PATH does not include its folder (on Windows, `where gh` finds nothing). Run
    `huddle doctor`: the `login` line says «gh is not installed or not on the PATH of this terminal» («glab …» on GitLab)
    and gives the install command (`winget install --id GitHub.cli` / `GLab.GLab` on Windows, `brew install gh` / `glab` on
    Mac, the official page on Linux), and on Windows says to open a new terminal. It does **not** say «not logged in».
    Put the CLI back, log out (`gh auth logout` / `glab auth logout`) and run `huddle doctor` again: now it says «is not
    logged in» with `gh auth login` / `glab auth login`. Log in again afterwards.

## 12. Clean up

1. [ ] Close the extra Issues and milestones, and remove the worktrees and branches the test created.
2. [ ] Remove the second account from the sandbox (GitHub: Settings → Collaborators; GitLab: Manage → Members).
3. [ ] **GitLab only:** revoke the sandbox access token if you will not run the test again soon.

## Results

Results of the run of 2026-11-06 (Huddle `main` with H12, H14 and H15; AI Manager SrProfessional; GitHub sandbox
`SrProfessional/huddle-sandbox-2`, GitLab sandbox `SrProfessional/huddle-sandbox` on gitlab.com). For the next release,
run the checklist again and replace the table, with the date, the Huddle commit and anything unexpected. Copy the table
into the PR description.

| Section | GitHub | GitLab | Notes |
|---|---|---|---|
| 1. Setup | ✔ | ✔ | Install by terminal (`claude plugin …`). Setup writes `.claude/settings.json`. GitHub: «7 labels created.». GitLab: the MR pipeline skips green without the protected token, and the schedule on `main` runs labels. The snippet does not offer the plugin (documented in H14): each developer installs once. |
| 2. Issue with a dependency | ✔ | ✔ | A assigned, B blocked |
| 3. Start | ✔ | ✔ | B refused, A started in its own worktree |
| 4. PR / MR | ✔ | ✔ | `Closes #A`, in progress → in review |
| 5. Review request taken | ✔ (5.5 not testable) | ✔ | GitLab: the request is left **only on the MR** and is pending, taken 👀, then cleared. 5.5 needs a second account. |
| 6. Hook on reopen | ✔ CLI / VS Code panel: no visible line | ✔ CLI | The visible line shows in the CLI before typing; the VS Code panel shows nothing until the first message, then Claude asks. Offline: silent in 0.5 s. GitLab: silent when `glab` is not on PATH. |
| 7. Merge | ✔ | ✔ | Merge commit, branch kept, Issue closed |
| 8. Dependency unblocks | ✔ | ✔ | Control D closed with the normal «Close issue»: C stays blocked |
| 12. Clean up | after the release | after the release | |

Found and fixed during the test: H12 (#25), H14 (#29), H15 (#32).

### Results 0.2.0

Run of: (date, Huddle commit, AI Manager, sandboxes, second account). Fill it in for the parts added in 0.2.0, and copy it
into the PR description next to the table above.

| Section | GitHub | GitLab | Notes |
|---|---|---|---|
| 5.5 Comment by another account | | | |
| 9. Progress | | | |
| 10. Team members | | | |
| 12. Clean up | | | |

### Results 0.3.0

Run of: (date, Huddle commit, AI Manager, sandboxes). Fill it in for the parts added in 0.3.0, and copy it into the PR
description next to the tables above.

| Section | GitHub | GitLab | Notes |
|---|---|---|---|
| 11. Areas: list, skill, set, reuse, dry run | | | |
| 11. Areas: assign (open, closed, closed area, none), check, progress | | | |
| 11. Areas: `huddle doctor` with `gh` / `glab` off the PATH | | | |
| 12. Clean up | | | |

Write ✔ or ✘ in each cell. Any ✘ blocks the release: open an Issue for it, fix it, and run the whole checklist again on
the platform that failed.

## Releasing v0.1.0

Only when every cell is ✔:

1. [ ] The AI Manager merges the release PR (versions and `CHANGELOG.md` already at 0.1.0).
2. [ ] On an up-to-date default branch: `git tag -a v0.1.0 -m "Huddle v0.1.0"` and `git push origin v0.1.0`.
3. [ ] Create the GitHub release from the tag, with the 0.1.0 section of `CHANGELOG.md` as notes.
