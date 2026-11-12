# Smoke test (before each release)

Huddle's tests never touch a real GitHub or GitLab. This checklist is the one place where they are touched. The AI
Manager's session runs it, once on a sandbox repo on **github.com** and once on a sandbox project on **gitlab.com**,
before every release, and fills in [Results](#results). The session ticks a box only when it saw the result itself, in a
command's output; for a 🙋 step, the person says what they saw.

Use a throwaway sandbox. Never run this on a team repo. Never paste a token into a chat, a file, an Issue or a commit.

## Who does each step

The session does every step it can (see [the design](design.md#13-the-session-does-every-step-it-can)). Each step starts with
its label:

- **Session:** the AI Manager's session does it itself, with `gh`, `glab` and git, and writes what it saw in Results.
- **🙋 Only you:** it needs a person: a second account, a secret, or watching a new Claude Code window. It is written as
  numbered steps for someone with no technical background. The session fills in anything in `<angle brackets>` before it
  shows you the step. If something looks different from «You should see», stop and tell the session; do not try to fix it.

If a permission is denied or a credential is missing, the session stops and asks; it does not look for another way.

Two sessions are needed: the **AI Manager** session (this one) and a **developer** window (a second clone, or a second
person). `huddle` below means `node <plugin folder>/bin/huddle`, where the plugin folder is where Claude Code installed
the plugin (see `/plugin`), not a clone of the Huddle repo.

## 1. Setup

| | GitHub | GitLab |
|---|---|---|
| Sandbox | empty repo `<you>/huddle-sandbox` on github.com | empty project `<you>/huddle-sandbox` on gitlab.com |
| Login | `gh auth login` | `glab auth login` |

1. [ ] **Session:** **Install the plugin from the marketplace**, in the AI Manager session. In a terminal run
   `claude plugin marketplace add SrProfessional/Huddle` and `claude plugin install huddle@huddle` (the CLI also has
   `/plugin marketplace add SrProfessional/Huddle` and `/plugin install huddle@huddle`; in the VS Code extension, type
   `/plugins` and install `huddle` with **Install for this project**). `claude plugin list` (or `/plugin`) shows `huddle` enabled at the version under test (0.1.0, 0.2.0 for
   sections 9 and 10, or 0.3.0 for section 11), and `/huddle-setup` is available. A plugin installed during a session shows up in the next one: if
   `/huddle-setup` is missing, the session says so and writes a 🙋 step asking the person to open a new Claude Code window.
   Before anything else it checks `gh auth status` (or `glab auth status`): if not logged in, it asks the person to log in
   and stops.
2. [ ] **Session:** Create the sandbox and push a first commit to its default branch (a README is enough).
3. [ ] **Session:** Run `/huddle-setup` in the sandbox. It writes `huddle.json` (`platform`, `project`, `ai_manager` = your
   login, `assignees` = the developer login), the CLAUDE.md block, the Issue and PR/MR templates, the labels job, and
   `.claude/settings.json` with `extraKnownMarketplaces.huddle` and `enabledPlugins["huddle@huddle"]`. Open
   `.claude/settings.json` and check both keys are there: setup wrote it, not by hand.
4. [ ] **Session:** Merge the setup to the default branch (the session approved it, so it merges it itself). **Each
   developer installs Huddle once on their machine** (see [first-day.md](first-day.md)): the settings snippet is only a
   helper and does not offer the plugin to a session that has not installed it. On the developer's machine the session
   runs `claude plugin marketplace add SrProfessional/Huddle` and `claude plugin install huddle@huddle`, and makes a fresh
   clone of the sandbox for the developer window of step 5. If the developer is another person on another machine, the
   session writes those commands as a 🙋 step for them.
5. [ ] **🙋 Only you:** Open a new Claude Code window as the developer and check that Huddle is there.
   1. Open a terminal (the window where you type commands; on Windows search for «PowerShell» in the Start menu) and go to
      the clone (a copy of the project on your computer) that the session made. Paste the line the session gives you:
      ```text
      cd <the folder of the clone>
      ```
   2. Start Claude Code by pasting this and pressing Enter:
      ```text
      claude
      ```
   3. When Claude's window is open, paste this and press Enter:
      ```text
      Run the Huddle doctor check and show me the result.
      ```
   4. Tell the AI Manager's session what you saw.

   You should see: a list of checks, and the `plugin` line starts with ✔. Typing `/huddle` shows `/huddle-start` in the
   suggestions.
   If you see something else: copy the whole list, paste it to the AI Manager's session, and do nothing else.
6. [ ] **🙋 Only you:** **GitLab only:** create the project token and save it as a variable. A token (a long password that
   lets a program act for you) is a secret, so the session cannot create it and never sees it. This is the same step as
   [The HUDDLE_TOKEN step](gitlab.md#the-huddle_token-step).
   1. Open the sandbox project on gitlab.com in your browser. In the left menu click **Settings**, then **Access tokens**.
   2. Click **Add new token**. In **Token name** paste:
      ```text
      huddle
      ```
   3. Set an expiry date, choose the role **Maintainer** and tick only the scope **api**. Click **Create project access
      token**, then click the copy button next to the token. Do not paste it anywhere except step 5 below.
   4. In the left menu click **Settings**, then **CI/CD**. Next to **Variables** click **Expand**, then **Add variable**.
   5. In **Key** paste:
      ```text
      HUDDLE_TOKEN
      ```
      Click in **Value**, paste the token, tick **Mask variable** and **Protect variable**, and click **Add variable**.

   You should see: `HUDDLE_TOKEN` in the list with «Protected» and «Masked» next to it, and no token text.
   If you see something else: if GitLab says the value cannot be masked, paste the token again with no spaces or line
   breaks. If you are not allowed to open **Access tokens**, you are not a Maintainer: tell the session and stop.
7. [ ] **Session:** **GitLab only:** create the pipeline schedule (`*/10 * * * *`, on the default branch, active) with
   `glab api`, as in [gitlab.md](gitlab.md). Then check the two machine requirements of
   [gitlab.md](gitlab.md#on-the-developers-machine): `glab` is on the PATH of the terminal that starts Claude (without it
   the hook stays silent and `huddle doctor` shows ✖ on `login`), and Git uses `glab` for gitlab.com
   (`git config --global --add credential.https://gitlab.com.helper "!glab auth git-credential"`, then `git ls-remote origin`
   works without a prompt). Labels change by the schedule, so they can take up to 10 minutes.
8. [ ] **Session:** `huddle doctor`: ✔ on `huddle.json`, `login` and `ai_manager`. `labels` fails on a new repo, as the
   labels do not exist yet.
9. [ ] **Session:** Run `huddle labels` once on the new repo: it prints «7 labels created.».
10. [ ] **Session:** `huddle doctor` again: all ✔. The labels exist on the platform: `ready`, `assigned`, `in progress`,
    `in review`, `blocked`, `needs decision`, `changes requested from AI Manager`.
11. [ ] **Session:** Run `huddle labels --dry-run`: it exits 0, prints no error and creates nothing.

## 2. An Issue with a dependency

1. [ ] **Session:** Create Issue **A** from the template, with `## Depends on` set to `- None`.
2. [ ] **Session:** Create Issue **B** from the template, with `## Depends on` listing `#<A>`.
3. [ ] **Session:** Run `huddle labels` (GitLab: run the schedule with `glab api`, or wait up to 10 minutes).
4. [ ] **Session:** A is `ready`, or `assigned` with the developer's login. B is `blocked`.

## 3. Start

These steps happen in the developer window of section 1, step 5. If you closed it, open it again with its sub-steps 1 and 2.

1. [ ] **🙋 Only you:** Ask the developer window to start Issue B, which must be refused.
   1. Click the developer's Claude Code window to bring it to the front.
   2. Paste the line below and press Enter (the session replaces `<B>` with the number of Issue B):
      ```text
      /huddle-start <B>
      ```
   3. Tell the AI Manager's session what the window said.

   You should see: the window ends with «⛔ Issue #B stopped: waiting for #A», and says it changed nothing.
   If you see something else: copy the window's last message, paste it to the session, and do not start anything else.
2. [ ] **🙋 Only you:** Ask the developer window to start Issue A.
   1. In the same window, paste the line below and press Enter (the session replaces `<A>` with the number of Issue A):
      ```text
      /huddle-start <A>
      ```
   2. If the window asks you something with yes or no, read it and answer in your own words, or tell the session what it
      asked.

   You should see: the window says it creates a branch in its own folder and starts working. This can take several minutes.
   If you see something else: copy the window's last message, paste it to the session, and wait for its answer.
3. [ ] **🙋 Only you:** Wait until the developer window has finished, then tell the session.
   1. Watch the window until it writes a message that starts with «✅ Issue #A finished».
   2. Go to the AI Manager's session, paste this and press Enter:
      ```text
      done
      ```

   You should see: the message «✅ Issue #A finished» with a link to the PR/MR, and the window says it is waiting in the
   background (`huddle wait <A>`).
   If you see something else: if the message starts with «⛔», copy it and paste it to the session.

## 4. Pull request / merge request

1. [ ] **Session:** The PR/MR is into the default branch, uses the template, and its description contains `Closes #<A>`
   (GitLab: the MR must target the default branch).
2. [ ] **Session:** After `huddle labels`, A is `in review` and no longer `in progress`.
3. [ ] **Session:** `huddle pending` prints nothing yet (no request).

## 5. A review request taken by a waiting session

1. [ ] **Session:** As the AI Manager, comment on the PR/MR with a `## Prompt for Claude Code` heading and a text block
   asking for a small change (for example, one more line in the README).
2. [ ] **🙋 Only you:** Watch the developer window pick up the request.
   1. Click the developer's Claude Code window to bring it to the front, and wait up to two minutes.
   2. When it says the AI Manager left a request and asks if it should continue, paste this and press Enter:
      ```text
      yes
      ```

   You should see: a message that a request is pending, and after your answer the window works on it and ends by
   saying it pushed and commented «Ready for review again».
   If you see something else: if nothing appears after two minutes, tell the session and do not type anything else.
3. [ ] **Session:** `huddle take <A>` was run by the window: the comment has the 👀 mark (reaction `eyes` on GitHub, award
   emoji `eyes` on GitLab), checked with `gh api` or `glab api`.
4. [ ] **Session:** The change is pushed and the PR/MR has the comment «Ready for review again» with the counts.
5. [ ] **🙋 Only you:** **A comment by someone else is not a request.** This step is for the **second account** (**S**: a
   person or a test account that can comment on the PR/MR and is not the AI Manager). It runs while no request of the AI
   Manager is pending (after step 4).
   1. S opens the PR/MR link the session gives you in a browser, logged in as S.
   2. Scroll to the bottom of the page, to the box where you write a comment.
   3. Paste this text in the box:
      ````text
      ## Prompt for Claude Code

      ```text
      add a line to the README
      ```
      ````
   4. Click **Comment** (GitLab: **Comment** or **Reply**).
   5. Tell the AI Manager's session «S commented».

   You should see: S's comment on the page, and nothing else happens.
   If you see something else: if the box does not let S comment, tell the session: S may not have access.
6. [ ] **Session:** Check that S's comment is ignored: `huddle pending` prints nothing, `huddle take <A>` finds no request
   and does not mark S's comment 👀, a waiting `huddle wait <A>` does not end, and the `changes requested from AI Manager`
   label does **not** appear (GitLab: wait up to 10 minutes for the schedule, then check again). Then post a real request
   as the AI Manager: only that one is pending, and `huddle pending` shows the AI Manager's text, never S's. Take it and
   clear it as in steps 2 to 4. Write «not testable» in Results **only** if there is no second account.
7. [ ] **Session:** The `changes requested from AI Manager` label shows while the request is pending, and goes away after
   the push. GitLab: it can lag up to 10 minutes after a comment; a push updates it at once.

## 6. The hook on reopen

1. [ ] **Session:** As the AI Manager, post a second `## Prompt for Claude Code` request on the PR/MR.
2. [ ] **🙋 Only you:** Close the developer window without answering it, then open a new Claude Code window.
   1. Close the developer's Claude Code window (the **X** of the window; in a terminal you can also type `/exit` and press
      Enter). Do not answer its questions.
   2. Open a terminal (the window where you type commands) in the sandbox clone and start Claude by pasting this:
      ```text
      claude
      ```
   3. Do **not** type anything else yet. Look at the window for up to 45 seconds.

   You should see: the old window gone and a new Claude Code window open, waiting for you to type.
   If you see something else: if the old window does not close or the new one shows an error, tell the session what you see.
3. [ ] **🙋 Only you:** Look at what the new window shows **before you do anything**.
   1. Read the first lines of the new Claude Code window.
   2. Tell the AI Manager's session what they say, word for word.

   You should see: in the CLI (`claude` in a terminal), a line like «Huddle: the AI Manager left 1 request…» before you do
   anything. After the first message, Claude asks whether to continue. In the VS Code panel nothing shows until the first
   message; then Claude asks. That is expected behavior, not a failure: the session notes it in Results.
   If you see something else: tell the session exactly what you see, and do nothing else.
4. [ ] **🙋 Only you:** Offline (network off), a new window still opens quickly and the hook stays silent.
   1. Turn off the internet on your computer (the Wi-Fi switch, or unplug the cable).
   2. Open a new terminal (the window where you type commands) in the sandbox clone and start Claude by pasting this:
      ```text
      claude
      ```
   3. Turn the internet back on when you have looked.

   You should see: the window opens within a few seconds and shows no Huddle line.
   If you see something else: if it takes more than 10 seconds or shows an error, tell the session what you saw.
5. [ ] **🙋 Only you:** The developer takes the request.
   1. In the new window of step 2, answer Claude's question «Do you want to continue?» by pasting this and pressing Enter:
      ```text
      yes
      ```
   2. Wait until the window says it pushed and commented «Ready for review again», then tell the AI Manager's session.

   You should see: the window works on the request and ends by saying it pushed and commented «Ready for review again»
   with the counts.
   If you see something else: copy the last message, paste it to the session, and wait for its answer.

## 7. Merge

1. [ ] **Session:** Approve (GitLab: with a comment, as self-approval may be off), then merge it itself as the AI Manager.
   The developer window never merges.
2. [ ] **Session:** The merge is a merge commit, and on GitLab the source branch is **not** removed.
3. [ ] **Session:** Issue A closes. On GitHub it shows `CLOSED` with `COMPLETED`.

## 8. The dependency unblocks

1. [ ] **Session:** Run `huddle labels` (GitLab: run the schedule).
2. [ ] **Session:** B is no longer `blocked`: it is `ready`, or `assigned` to the developer.
3. [ ] **Session:** Control: create Issue **C** depending on a third Issue **D**, then close D **by hand** with the
   platform's normal «Close issue» (on GitHub, closed as completed), with no PR/MR. After `huddle labels`, C is still
   `blocked`, so `/huddle-start <C>` would refuse it.
4. [ ] **🙋 Only you:** Ask the developer window to start Issue B, which now works.
   1. Click the developer's Claude Code window to bring it to the front.
   2. Paste the line below and press Enter (the session replaces `<B>` with the number of Issue B):
      ```text
      /huddle-start <B>
      ```

   You should see: the window starts working on B, with no «stopped» message.
   If you see something else: if it says «⛔ Issue #B stopped», copy that line and paste it to the session.

## 9. Progress

Needs Huddle 0.2.0 or later. Do GitHub and GitLab each in their own sandbox, and tick a box only for the platform you saw
it on (write the platform in Results). Leave `progress_issue` out of `huddle.json`, or set it to `true`.

1. [ ] **Session:** **Two milestones.** Create milestone **Alpha** with the description line `Huddle remaining: 2` and
   milestone **Beta** with `Huddle remaining: 1`, each on a line of its own. Huddle's progress code never creates
   milestones, so the session creates them with `gh api` or `glab api` (or `huddle areas set` when the version under test has it).
2. [ ] **Session:** **Issues in them.** Put these Issues in **Alpha**: **M**, closed by a merged PR/MR (`Closes #M`, merged as in
   section 7); **O**, left open; **H**, closed by hand with the normal «Close issue» (GitHub: as completed); and **N**,
   closed as «not planned» (GitHub: «Close as not planned»; GitLab has no such reason, so close it by hand and write that
   in Results). Put one more open Issue **P** in **Beta**, and leave one open Issue **X** with no milestone.
3. [ ] **Session:** Run `huddle labels` (GitLab: run the schedule, or wait up to 10 minutes). It ends without an error.
4. [ ] **Session:** **The numbers follow the formula.** `huddle progress` shows **Alpha** with merged 1, total 2 (M and O; H and N count in
   neither), remaining 2, so **25%** (1 ÷ 4); **Beta** with merged 0, total 1, remaining 1, so **0%**; the project **Total 16%** (1 ÷ 6: merged 1 over total 3 plus remaining 3); and «no area» with X plus any Issue still open
   from the earlier sections (open Issues with no milestone from sections 1 to 8 count too, so close them first if you
   want exactly 1). The progress Issue itself is not counted.
5. [ ] **Session:** `huddle progress --json` agrees with the table: the same areas, `merged`, `total`, `remaining`, `percent` and total.
6. [ ] **Session:** **The «Huddle progress» Issue is created once.** One new Issue called «Huddle progress» exists, with the marker
   `<!-- huddle:progress -->` in its body and the same numbers as step 4. On **GitHub it is pinned**; on GitLab it is only
   created (no pinned Issues). It has no `ready`, `assigned` or `blocked` label.
7. [ ] **Session:** **It is not rewritten when nothing changed.** Note the Issue's «edited» time (GitHub: the «edited» tag of the body;
   GitLab: the «edited» time of the description). Run `huddle labels` again: no second «Huddle progress» Issue appears and
   the edited time does not move. Then run `huddle labels` twice within a few seconds (or let the job and a local run
   overlap): still one «Huddle progress» Issue, and if you copy it by hand, the next run closes the newer copy with «Duplicate of #N».
8. [ ] **🙋 Only you:** **The session-start line shows the areas.** Open a new Claude Code window in the sandbox clone and read
   its first lines.
   1. Open a terminal (the window where you type commands) in the sandbox clone and start Claude by pasting this:
      ```text
      claude
      ```
   2. Do not type anything else. Read the first lines of the window and tell the AI Manager's session what they say.

   You should see: before you type, the visible lines include `Progress: Alpha 25% · Beta 0% · Total 16%` (the order of the
   areas may differ), next to the pending-request line when there is one. VS Code panel: nothing shows until the first
   message, as in section 6. Offline, the line stays silent.
   If you see something else: tell the session exactly what you see (or that nothing shows), and do not type anything else.
9. [ ] **Session:** **Edit a remaining line and see it change.** Change Beta's description to `Huddle remaining: 3`, then run
   `huddle labels`. `huddle progress` shows **Beta** still 0% and the project **Total 12%** (1 ÷ 8: merged 1 over total 3 plus remaining 5), and the progress
   Issue is rewritten once with the new numbers (its edited time moves). Run `huddle labels` once more: it does not move
   again.
10. [ ] **Session:** **A line that is not a number counts as 0.** Change Beta's line to `Huddle remaining: four`: `huddle progress` says
    the estimate is missing for **Beta**, and shows Beta with remaining 0, so the project **Total 20%** (1 ÷ 5: merged 1 over total 3 plus remaining 2).
11. [ ] **Session:** **A milestone closed more than 90 days ago stays out.** Use a sandbox milestone that was closed more than 90 days
    ago (for example **Old**, with `Huddle remaining: 5` and one merged Issue). It does **not** appear in `huddle progress`
    or in the total, while a milestone closed this week **does**. A fresh sandbox cannot wait 90 days: if there is no such
    milestone, write «not testable» in Results for this step (the unit tests cover the cut-off with a fixed date).
12. [ ] **Session:** **Switch it off.** Set `"progress_issue": false` in `huddle.json`, merge it, and run `huddle labels`: the existing
    Issue is not rewritten and no new one appears. `huddle progress` still works. Set it back afterwards.

## 10. Team members

Needs Huddle 0.2.0 or later. The **second account** of step 5.5 (call it **S**) is the person to add. If there is no
second account, use any login that exists on the platform and is not a collaborator, and write that in Results.

1. [ ] **Session:** **The team is listed.** `huddle team` prints the AI Manager and each assignee of `huddle.json`, each with ✔ or ✖
   for «exists on the platform» and «can be assigned» (collaborator on GitHub, Developer or higher on GitLab). The AI
   Manager and the developer from section 1 show ✔ ✔.
2. [ ] **Session:** **A login that is not a collaborator is warned about.** Run `/huddle-team add <S>` while S is **not** a collaborator
   (GitLab: not a member, or below Developer). It warns that S cannot be assigned, prints the 🙋 step for the AI Manager
   (see step 4) and **writes nothing**: no branch, no PR/MR, `huddle.json` unchanged.
3. [ ] **Session:** **`huddle doctor` has the «team» check.** It shows ✔ on `team` while every assignee can be assigned.
4. [ ] **🙋 Only you:** **The AI Manager invites S, and S accepts.** The session never invites anyone: it sends an invitation to another person.
   1. Open the sandbox on the platform in your browser (GitHub: github.com, the sandbox repo; GitLab: gitlab.com, the sandbox project).
   2. GitHub: click **Settings**, then **Collaborators** (or **Access**), then **Add people**. GitLab: click **Manage** in the
      left menu, then **Members**, then **Invite members**.
   3. In the box, paste S's login (the platform user name, not the real name):
      ```text
      <S>
      ```
   4. Choose S in the list. GitLab: choose the role **Developer**. Click **Add** (GitHub) or **Invite** (GitLab).
   5. GitHub only: S opens the e-mail from GitHub and clicks **Accept invitation**, or opens `github.com/<project>/invitations` and clicks **Accept**. GitLab adds S at once.
   6. Tell the AI Manager's session «S is in».

   You should see: S listed as a collaborator (GitHub) or a member with the role Developer (GitLab).
   If you see something else: if S is not in the list, or the platform says you cannot invite, tell the session what the
   page says.
5. [ ] **Session:** **Add works through a PR/MR.** Run `/huddle-team add <S>` again. It runs `huddle team add <S>`, commits `huddle.json` on
   a new branch, and opens a PR/MR called «Team: add `<S>`» into the default branch. Only `assignees` changed in the diff
   (the other keys, the order and the line endings stay). The skill **did not merge it** and did not commit to the default
   branch, and it printed the message for the new person with the install commands.
6. [ ] **Session:** Merge the PR/MR (the session approved it). `huddle team` now lists S with ✔ ✔ and `huddle doctor` shows ✔ on `team`.
7. [ ] **Session:** **Adding twice changes nothing.** `huddle team add <S>` says S is already there and changes no file.
8. [ ] **Session:** **The «team» check warns.** On a scratch branch, `huddle team add <another login that is not a collaborator> --anyway`
   writes the file. `huddle doctor` then shows a ⚠ on `team` with the step for that login. Discard the branch afterwards:
   do not merge it.
9. [ ] **Session:** **Remove works the same way.** Run `/huddle-team remove <S>`: a PR/MR «Team: remove `<S>`» with only `assignees`
   changed, not merged by the skill. The session merges it, and `huddle team` no longer lists S. Open Issues that S had
   keep their assignee.

## 11. Areas

Needs Huddle 0.3.0 or later. Do GitHub and GitLab each in their own sandbox, and tick a box only for the platform you saw
it on (write the platform in Results). Use a sandbox with **no milestones** for steps 1 and 2: **delete** the Alpha and Beta
milestones of section 9 first (GitHub: Milestones → Delete; GitLab: Delete milestone). Closing them is not enough: a
milestone closed less than 90 days ago is still listed, so `huddle areas list` would show «Alpha (closed)» and never print
«No areas yet». Run `huddle` as the AI Manager; the skill `/huddle-areas` refuses anyone else.

1. [ ] **Session:** **No areas yet** (no milestone left, not even a closed one). `huddle areas list` prints «No areas yet. Define them with the skill /huddle-areas, or create one:
   huddle areas set <title> --remaining N», plus a line «No area: N open, M closed» if Issues exist. `huddle areas check`
   says «Check-up: nothing to fix.» or lists only Issues with no area.
2. [ ] **Session:** **The skill proposes and waits.** Run `/huddle-areas`. It reads the README, `CLAUDE.md` and the Issues, and proposes
   areas (any number) with a reason for each, and then **waits for the OK**: until you answer, `huddle areas list` still
   shows no areas and no milestone exists on the platform. Answer «only **Core** and **Docs**», and it runs
   `huddle areas set ... --dry-run` first and shows it before the real call.
3. [ ] **Session:** **Set creates an area.** `huddle areas set "Core" --remaining 3 --description "The engine"` prints
   «Will create milestone «Core»» with the description lines `The engine` and `Huddle remaining: 3`, then «Done.». The
   milestone exists on the platform with that description.
4. [ ] **Session:** **Set reuses it.** Run `huddle areas set "core" --remaining 4` (another case of the title): it prints «Will update
   milestone «Core»» and `remaining: 3 → 4`, and the platform still has **no second milestone**. Then edit the milestone
   description by hand to add a line `Notes: keep me` and run `huddle areas set "Core" --remaining 5`: the rest of its
   description (`The engine`, `Notes: keep me`) is kept, and only the `Huddle remaining` line changes. Run it once more
   with the same number: «Nothing to change.»
5. [ ] **Session:** **Dry run changes nothing.** `huddle areas set "Docs" --remaining 2 --dry-run` prints «Would create milestone «Docs»»
   and «Dry run: nothing was changed.»; no milestone «Docs» exists afterwards. The same for
   `huddle areas assign <issue> "Core" --dry-run`: the Issue keeps its area. Then create Docs for real
   (`huddle areas set "Docs" --remaining 2`).
6. [ ] **Session:** **Assign an open and a closed Issue.** Take an **open** Issue **O2** and a **closed** Issue **C2** (the merged one of
   section 7 will do), both with no area. `huddle areas assign <O2> "Core"` prints «Will put Issue #<O2> in area «Core»
   (now: no area).» and «Done.»; the same for `<C2>` with «Docs». On the platform each Issue shows its milestone. Repeating
   the command says «already in area … Nothing to change.»
7. [ ] **Session:** **A closed area.** Close the milestone **Docs** on the platform (GitHub: Milestones → Close; GitLab: Close milestone).
   `huddle areas list` shows it as «Docs (closed)». Then `huddle areas assign <O2> "Docs"` works on the **closed** area
   too: the Issue is in Docs, and the milestone **stays closed**. `huddle areas set "Docs" --remaining 3` (not 2, which
   Docs already says since step 5, and which would only print «Nothing to change») also keeps it closed and says so
   («the milestone is closed and stays closed»). Reopen it afterwards if you need it.
8. [ ] **Session:** **None takes an Issue out.** `huddle areas assign <O2> none` prints «Will take Issue #<O2> out of area «Docs»» and
   «Done.»; the Issue has no milestone on the platform.
9. [ ] **Session:** **Check finds the gaps.** Create an open Issue **Z** with no area, and a milestone **Bare** by hand with a description
   that has **no «Huddle remaining» line**. `huddle areas check` lists **Z** under the Issues with no area, and **Bare** as
   «No «Huddle remaining» line». `huddle areas check --json` has `noArea` with Z and `missingEstimate` with Bare. Fix it
   with `huddle areas set "Bare" --remaining 1` and `huddle areas assign <Z> "Bare"`: `check` is then clean for them.
10. [ ] **Session:** **Progress reflects the changes.** `huddle progress` shows the areas Core, Docs and Bare with the Issues and the
    `remaining` you set, and the percentages follow the formula of section 9. Run `huddle labels` (GitLab: Play the
    schedule): the «Huddle progress» Issue is rewritten once with the same numbers.
11. [ ] **Session:** **The doctor line for a missing CLI.** Make `gh` (GitHub) or `glab` (GitLab) invisible to the terminal: rename the
    executable, or start a terminal whose PATH does not include its folder (on Windows, `where gh` finds nothing). Run
    `huddle doctor`: the `login` line says «gh is not installed or not on the PATH of this terminal» («glab …» on GitLab)
    and gives the install command (`winget install --id GitHub.cli` / `GLab.GLab` on Windows, `brew install gh` / `glab` on
    Mac, the official page on Linux), and on Windows says to open a new terminal. It does **not** say «not logged in».
    Put the CLI back, log out (`gh auth logout` / `glab auth logout`) and run `huddle doctor` again: now it says «is not
    logged in» with `gh auth login` / `glab auth login`. Log in again afterwards.

## 12. Clean up

1. [ ] **Session:** Close the extra Issues and milestones, and remove the worktrees and branches the test created.
2. [ ] **Session:** Remove the second account from the sandbox (GitHub: `gh api -X DELETE repos/<project>/collaborators/<S>`;
   GitLab: the Members API of the sandbox project).
3. [ ] **🙋 Only you:** **GitLab only:** revoke the sandbox access token if you will not run the test again soon.
   1. Open the sandbox project on gitlab.com in your browser. In the left menu click **Settings**, then **Access tokens**.
   2. Find the token called:
      ```text
      huddle
      ```
   3. Click **Revoke** next to it and confirm.

   You should see: the token gone from the list of active tokens.
   If you see something else: if there is no **Revoke** button, you are not a Maintainer: tell the session.

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

Run of: 2026-11-08, Huddle commit f55c1f2 (branch h21-release-030), AI Manager SrProfessional through the AI Manager's Claude Code session, sandboxes github.com/SrProfessional/huddle-sandbox and huddle-sandbox-2, gitlab.com/SrProfessional/huddle-sandbox and huddle-sandbox-2 (created for section 11); no second account. Fill it in for the parts added in 0.2.0, and copy it
into the PR description next to the table above.

| Section | GitHub | GitLab | Notes |
|---|---|---|---|
| 5.5 and 5.6 Comment by another account | not run | not run | needs a second account (🙋 the AI Manager) |
| 9. Progress | ✔ | ✔ | Re-run 2026-11-09 with Issue #52 merged: a second «Huddle progress» Issue made by hand (#19) was closed by the next `huddle labels` as «Duplicate of #15». First run, GitHub ✘ step 6: two «Huddle progress» Issues (#15 by the Actions job, #16 by a local `huddle labels` 12 s later: the open-Issue list comes from GitHub search, which lags). Steps 3–5, 7, 9, 10, 12 ✔ on both (16 %, 12 %, 20 %, «Estimate missing for: Beta»). GitLab: the third `huddle labels` in a few minutes failed with HTTP 429 (no retry). Step 8 not run (needs a new session window, 🙋). Step 11 not testable. |
| 10. Team members | ✔ (partial) | ✔ (partial) | Steps 1, 2, 3, 7, 8 ✔ with a login that is not a collaborator (`octocat`, `gitlab-bot`). Steps 4–6 and 9 not run: they need the second account to accept an invitation (🙋). |
| 12. Clean up | not run | not run | the sandboxes are kept for the next run |

### Results 0.3.0

Run of: 2026-11-08, Huddle commit f55c1f2 (branch h21-release-030), AI Manager SrProfessional through the AI Manager's Claude Code session, sandboxes github.com/SrProfessional/huddle-sandbox and huddle-sandbox-2, gitlab.com/SrProfessional/huddle-sandbox and huddle-sandbox-2 (created for section 11); no second account. Fill it in for the parts added in 0.3.0, and copy it into the PR
description next to the tables above.

| Section | GitHub | GitLab | Notes |
|---|---|---|---|
| 11. Areas: list, skill, set, reuse, dry run | ✔ | ✔ | Steps 1, 3, 4, 5 ✔. Step 2 (the skill) not run: needs a session with the plugin at 0.3.0 installed (🙋). |
| 11. Areas: assign (open, closed, closed area, none), check, progress | ✔ | ✔ | Re-run 2026-11-09 with Issue #52 merged: on GitLab the closed Docs was reopened, the Issue assigned and Docs closed again, and the Issue is in Docs. First run, GitLab ✘ step 7: `huddle areas assign <issue> "Docs"` on a **closed** milestone prints «Done.» but the Issue keeps its old milestone (checked twice). Steps 6, 8, 9, 10 ✔ on both. Note: `check` lists a milestone with no estimate line both as «No «Huddle remaining» line» and «No Issue and remaining 0». |
| 11. Areas: `huddle doctor` with `gh` / `glab` off the PATH | ✔ | ✔ | Off the PATH → «not installed or not on the PATH» with the winget command and the PATH reload; an invalid token for one command → «is not logged in» (the real login was not logged out). |
| 12. Clean up | not run | not run | the sandboxes are kept for the next run |

### Results 0.5.3

Run of: 2026-11-11, Huddle `main` with Issues #94 and #96 merged (commit 04e7020), by the AI Manager's Claude Code session and a developer on a Mac. A patch-sized release (text only: the
guides, the website, the PDFs and the install and update messages): only the new parts were checked; the 0.5.2 and older tables below still hold for the rest.

| Section | GitHub | GitLab | Notes |
|---|---|---|---|
| Install from the VS Code extension with `/plugins` (#96) | ✔ | covered by tests | A developer on a Mac with only the VS Code extension (no `claude` command in the terminal) typed `/plugin` and got «isn't available in this environment»; with `/plugins` they added the marketplace, installed `huddle` with «Install for this project», and Huddle worked in a new session. The platform plays no part. |
| The guides, the setup skill and the `huddle setup`, `huddle doctor` and `huddle update` messages give both routes (#96) | covered by tests | covered by tests | Tested as text (`test/docs/vscode-plugins.test.mjs`). The CLI commands and `--scope project` are unchanged. |
| The PDF guides and the website name the 0.5.x commands and the VS Code route (#94) | covered by tests | covered by tests | Tested as text. The PDFs were rebuilt (guide 15 pages, first day 7); nobody looked at every page for cuts. |
| Updating from VS Code with `/plugins` (#96) | covered by tests | covered by tests | Not run: only the install was tried in a real VS Code. |

### Results 0.5.2

Run of: 2026-11-11, Huddle `main` with Issue #91 merged (commit fdc18ef), by the AI Manager's Claude Code session. A patch-sized release (one new command and a
change in the update steps): only the new parts were checked; the 0.5.1 and older tables below still hold for the rest.

| Section | GitHub | GitLab | Notes |
|---|---|---|---|
| `huddle notice` and `huddle notice --json` (#91) | ✔ | covered by tests | Run live on a clone of the PR branch with the installed version equal to the latest release: `--json` printed `show: false` and nothing in text mode, exit 0; `--bogus` exited 2 with the usage line. The platform plays no part: the command needs no login. |
| `huddle notice` shows a newer release once a day (#91) | covered by tests | covered by tests | Tested with a fake release lookup and clock: it shows, it does not show again within 24 hours, it shows even when the hook's `shownAt` is today, and it writes only `skillShownAt`. Not run against a real newer release. |
| `/huddle-start`, `/huddle-continue`, `/huddle-update` say the notice first (#91) | covered by tests | covered by tests | The skills are tested as text. Whether the notice shows in VS Code was not run: it needs a session in VS Code with the plugin at 0.5.2 and an older one to compare. |
| Update steps say `--scope project` (#91) | covered by tests | covered by tests | `claude plugin update --help` lists the scopes (user, project, local, managed); the steps were not run against a project-scoped install in this run. |

### Results 0.5.1

Run of: 2026-11-11, Huddle `main` with Issue #88 merged (commit 757a441), by the AI Manager's Claude Code session. A minor-sized release (one new command and
one new skill): only the new parts were checked; the 0.5.0 and older tables below still hold for the rest.

| Section | GitHub | GitLab | Notes |
|---|---|---|---|
| `huddle queue` and `huddle queue --json` (#88) | ✔ | covered by tests | Run live on the Huddle repo with PR #89 open: it listed Issue #88 as `review` with PR #89 and the real head sha (2e0235c), in text and in JSON; it wrote nothing. GitLab: the `reviewHead` contract test with the fake `glab`. |
| `reviewHead(n)` in the adapters (#88) | ✔ | covered by tests | GitHub through the live `queue` run above; both platforms through the shared contract tests. |
| `/huddle-watch` on, off and status (#88) | covered by tests | covered by tests | The skill is tested as text (`CronList` before `CronCreate`, no second job, `CronDelete` for off, the 7-day expiry, decisions and triage never answered). It was not run in a live session: the first live use should check that `status` shows the job and `off` removes it. |

### Results 0.5.0

Run of: 2026-11-11, Huddle `main` with Issues #79, #81, #83 and #85 merged (commit 9b76545), by the AI Manager's Claude Code session. A minor
release (a new command and two new skills): only the new parts were checked; the 0.4.2 and older tables below still hold for the rest.

| Section | GitHub | GitLab | Notes |
|---|---|---|---|
| First install writes `setup_version` (#81) | ✔ | covered by tests | `lib/setup/cli.mjs` in an empty folder wrote `huddle.json` with `setup_version` 0.5.0. |
| `huddle update --check` (#81) | ✔ | covered by tests | Current repo: exit 0 «up to date». Set up for 0.4.2 with nothing to refresh: exit 0. With a stale `CLAUDE.md` block: exit 3 and `Nothing was changed`. |
| `huddle update` (#81) | ✔ | covered by tests | Refreshed the stale block and wrote `setup_version` 0.5.0: exit 0; a second `--check` says up to date. |
| `huddle update` refusals (#81) | ✔ | covered by tests | `--answer token=x` → exit 1, «not a pending question» and the value is never echoed; `--bogus` → exit 2 with the usage line. |
| `huddle update` with a pending question (#81) | covered by tests | covered by tests | The real registry is empty in 0.5.0, so a fake one is used in `test/setup/update.test.mjs` and `test/cli/update-command.test.mjs`: nothing is written and the exit is 3. |
| `huddle doctor` `setup` line (#81) | covered by tests | covered by tests | The three states (up to date, needs update, only the version differs) are tested with canned status; not run against a live login in this run. |
| `/huddle-continue` (#83) | covered by tests | covered by tests | The skill is tested as text; how a model follows it in a live session was not run. |
| Stop labels (#85) | covered by tests | covered by tests | `plan()` and the fake `gh` world: `needs decision` and `changes requested from AI Manager` stand alone, and `in progress` / `in review` come back after the answer. Not run against a live GitHub project in this run. |
| `/huddle-setup` in a configured repo (#79) | covered by tests | covered by tests | The skill's text and the CLI contract are tested; a live session was not run. |

### Results 0.4.2

Run of: 2026-11-11, Huddle `main` with Issues #74 and #76 merged (commit bb15c8b), by the AI Manager's Claude Code session. A minor-sized patch
release: only the two changes were checked; the 0.4.1 and 0.4.0 tables below still hold for the rest.

| Section | GitHub | GitLab | Notes |
|---|---|---|---|
| Setup writes the «Language» rule (#74) | ✔ | covered by tests | `lib/setup/cli.mjs` in an empty git repo wrote `CLAUDE.md` with the `### Language` section between the markers. The block is the same for both platforms. |
| `huddle clean --dry-run` on the Huddle repo (#76) | ✔ | covered by tests | 43 linked worktrees: 39 would be removed; kept: one with uncommitted changes, two touched less than 24 hours ago and the current one. Nothing was removed. |
| `huddle clean` removes a finished worktree (#76) | ✔ | covered by tests | A test with real `git` in a temporary folder (merged, unmerged, dirty and fresh worktrees): only the merged one went, with its `node_modules`. CI runs it on Ubuntu, macOS and Windows, Node 22 and 24: all seven checks of PR #77 passed. |
| Session-start hook starts `huddle clean` (#76) | ✔ | covered by tests | `huddle hook` in a throwaway repo with a merged, clean, 3-day-old worktree (with a `node_modules`): the hook exited 0 in 0.8 s with no output, and the background process it started removed the worktree. Tests: it starts once, not when `clean_worktrees` is `false`. Not run inside a live Claude Code session. |

### Results 0.4.1

Run of: 2026-11-09, Huddle `main` with Issues #69 and #70 merged, by the AI Manager's Claude Code session. A patch release: only
the two fixes were checked; the 0.4.0 table above still holds for the rest.

| Section | GitHub | GitLab | Notes |
|---|---|---|---|
| Progress after the `ctx.now` fix (#69) | ✔ | not run | `huddle labels --dry-run` in the Huddle repo: `v0.4.0` ends with «Progress not updated: now.getTime is not a function», `main` does not. A test runs the real context of `lib/cli/main.mjs`. |
| Setup with an existing labels job (#70) | ✔ | covered by tests | Setup on a copy of SocialCortex's `.github/workflows` wrote no `huddle-labels.yml`, kept `issue-labels.yml` and said it pins v0.2.0. |

### Results 0.4.0

Run of: 2026-11-09, Huddle `main` with Issues #55, #58, #61, #63 and #65 merged, AI Manager SrProfessional through the AI Manager's Claude Code session, sandboxes github.com/SrProfessional/huddle-sandbox and gitlab.com/SrProfessional/huddle-sandbox; no second account. Fill it in for the parts added in 0.4.0, and copy it into the PR description next to the tables above.

| Section | GitHub | GitLab | Notes |
|---|---|---|---|
| Bugs: templates and labels | ✔ | ✔ | Setup installed `bug.md`, `bug-report.yml` and `design.md` (sandbox PR #20). `huddle labels` created `bug`, `needs triage` and `design`. The first run found a ✘: the `needs triage` description was 105 characters and GitHub answered HTTP 422; fixed in PR #57 before the merge. |
| Bugs: a report with `needs triage` | ✔ | ✔ | A report with `bug` and `needs triage` got no `ready` and no assignee (GitHub #21, GitLab #12). |
| Bugs: a `blocking` Bug | ✔ | not run | Assigned at once (GitHub #22). That it goes before an older ready task is covered by the tests, not run here. |
| Bugs: `/huddle-bug` | ✔ | not run | Used by the AI Manager's session to write Issue #63 from a phone capture. |
| Design Issues: `/huddle-start` with Claude Design, «ready», PR | not run | not run | Needs a session with the plugin at 0.4.0 installed. Run it right after the release (🙋 nothing: the AI Manager's session does it). |
| Website | ✔ | n/a | Deployed by `pages.yml`; checked live on a phone by the AI Manager; the missing side margin found there was fixed in #63. |
| Update notice and `doctor` version line | not run | not run | Needs 0.4.0 released: a machine on 0.3.0 or older must see the notice once and `doctor` must show ⚠. Checked right after the release. |
| 12. Clean up | not run | not run | the sandboxes are kept for the next run |

Write ✔ or ✘ in each cell. Any ✘ blocks the release: open an Issue for it, fix it, and run the whole checklist again on
the platform that failed.

## Releasing v0.1.0

Only when every cell is ✔. The AI Manager's session does these steps itself once it approved the release PR; it asks the
person only if a permission is denied (then it stops and asks, and does not look for another way).

1. [ ] **Session:** Merge the release PR (versions and `CHANGELOG.md` already at 0.1.0).
2. [ ] **Session:** On an up-to-date default branch: `git tag -a v0.1.0 -m "Huddle v0.1.0"` and `git push origin v0.1.0`.
3. [ ] **Session:** Create the GitHub release from the tag (`gh release create v0.1.0`), with the 0.1.0 section of `CHANGELOG.md` as notes.
