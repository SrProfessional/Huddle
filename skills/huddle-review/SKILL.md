---
name: huddle-review
description: Use when the Coach reviews a Player's PR/MR and must either request changes or approve and merge it.
---

# huddle-review

For the Coach only. Run `node "${CLAUDE_PLUGIN_ROOT}/bin/huddle" doctor`: if you are not the `coach` login in `huddle.json`, you do not merge, deploy or change settings; give the review as text and stop. **In OpenAI Codex** (Issue #213): run the `huddle` command the session start named wherever this skill writes `node "${CLAUDE_PLUGIN_ROOT}/bin/huddle"`; make worktrees with `git worktree add` and work in that folder; run `gh`, `glab`, `git push` and `huddle` with network access (approve it when Codex asks). In Codex, a design PR stops there: «A design PR is reviewed in Claude Code (it needs Claude Design to look at).»

## Review

1. Read the PR/MR, the Issue it closes (goal, allowed files, tests that must pass) and the diff. On a later round, when your last review ended with `Reviewed head: <sha>`, read the Player's answer to each requested item and only `git diff <old>..<new>` (Issue #195): not the whole PR again. End every review comment with `Reviewed head: <sha>` (the head you reviewed).
2. Check: only the allowed files changed; every requirement is done or listed under «What was NOT done»; TDD evidence; no secret, no runtime dependency the rules forbid. Ask for changes only for what blocks: a contract item not done, a failing test, a bug a user would hit, a security or privacy hole, data loss, a broken rule of the repo. Anything else (a rarer edge case, extra hardening, a nicer structure, more tests of the same thing) never holds the merge: approve and merge, and write each one now as a new Issue with `/huddle-issue`, named in the approval comment (Issue #252).
3. Do not run the tests while you read (Issue #244): when you already have something to ask for, then asking for changes, do not run them, since another round follows anyway. Run the full suite only when you are about to approve: **before any approval and merge**, check out the exact head you merge in a fresh worktree and run the full suite there, keeping only the summary lines of its output (the counts and the failures); compare the counts with the PR/MR text. Never merge without that run. **When that run fails, compare with the base (Issue #290).** Compare with the base: run the same suite (or the failing tests only) on the base branch (`staging`, or the default branch when there is none), in a fresh worktree, and compare the failing test names. The PR adds no new failure when every failing test also fails on the base; say the two counts and the names in the review. **No new failure counts as passing:** go on to «All good» (the standing orders cover the merge), and write the failures the base already has once, as one follow-up Issue with `/huddle-issue` (an existing open Issue for them is reused, never a second one). A red base does not block the merge and never asks for changes. A failing test the base does not fail is a new failure: that blocks as usual. **A baseline that cannot be compared** (the base run itself cannot start, the failures differ between runs, or a test is flaky) is never a silent stop: comment «❓ Decision for the Coach:» on the PR's Issue with the options and your recommendation, run `node "${CLAUDE_PLUGIN_ROOT}/bin/huddle" labels --issue <n> --needs-decision`, and end the review as «stopped» with that reason (the watch reports it once). **A docs-only round** (the delta since `Reviewed head:` touches no code and no test) needs no new run: the last full run of this PR, by you, in an earlier round with only docs changed since, stands; say so in the review.

## A design PR (its Issue has the `design` label, and the PR only touches `design/<n>-<slug>/`)

There is no code, so this review never checks tests: do not run them and do not ask for counts. Instead:

1. Show the screenshots of the PR (the files in `screens/`) and open `design.html` in the browser.
2. Check the design against the Issue: every screen and state under «Screens» is there; the texts are the ones of «Content»
   (no lorem ipsum); it follows the «Visual guide» (the design system or the guide named there).
3. Check contrast (text against its background, at least 4.5:1 for normal text) and phone width (nothing cut or scrolling sideways at 375 px).
4. Check that `README.md` has the artifact link, the screens, the decisions and the round number, and that only `design/<n>-<slug>/` changed.
5. If something is wrong, ask for changes with the usual «🔁 Changes requested» comment and its `## Prompt for Claude Code` block, as below. Each
   round is a new commit of the same PR.
6. If it is good, approve and merge it as in «All good». Then **offer the build Issue**: «Build <screen> from design #N», written with `/huddle-issue`,
   with `- #N` under «Depends on» and the `design/` folder of the merged PR as its «Contract or spec». Create it only after the Coach's OK.

## Changes needed

Post **the same comment** on the PR/MR and on its Issue (the labels job and the Player's wait read both), starting with the heading and a text block:

````text
## Prompt for Claude Code

```text
First run /huddle-play <n>: it marks this request as taken (👀), so the Issue shows «in progress».
<what to fix, one item per line, with file and why; end with: push, then comment «Ready for review again» with the counts>
```
````

In Claude Code and Codex, write every Issue/PR/MR body or comment to a temporary UTF-8 file first. Pass `--body-file <file>` to `gh`, use `glab api … -F 'body=@file'` for GitLab notes or `--description-file <file>` for GitLab descriptions, and never pass the text inline. Post a reopening reason as a separate comment after reopening. Right after posting a changes request, run `node "${CLAUDE_PLUGIN_ROOT}/bin/huddle" labels --issue <n>` (`n` the Issue): it puts `changes requested from Coach` on from the comment, and the take step in the prompt takes it off. Do not edit labels by hand.

## Reviewing for the watch

When the prompt says you review for `/huddle-watch` (a subagent, Issue #165): do the whole «Review» above, and «Changes needed» when something must change. When all is good, do **not** approve or merge: the watch merges one PR at a time. End with a short verdict: «ready to merge», «needs changes» (and what), or «stopped» (and why).

## All good

0. With `staging_branch` set in `huddle.json`, for an Issue PR/MR: run `node "${CLAUDE_PLUGIN_ROOT}/bin/huddle" land <pr> --check` first (it changes nothing). If the base is not staging, do not merge: ask for it to be retargeted to staging. Meta PRs (setup, update, team) keep targeting the default branch.
1. Approve with a comment (self-approval may be disabled). Your approval in this session is the Coach's approval, so
   merge it yourself, now, without asking: the standing order of the `CLAUDE.md` block is the Coach's authorization (only `/huddle-release` asks). Use the platform's merge commit and keep the branch (`gh pr merge --merge`; on GitLab merge without
   removing the source branch). Do not hand the merge command to the person: never hand over a step you can do.
2. Confirm the Issue closed (a merged PR/MR; `CLOSED` with `COMPLETED` on GitHub). With a staging branch it is `huddle land` that closes it: right after the merge run `node "${CLAUDE_PLUGIN_ROOT}/bin/huddle" land <pr>`, then run `node "${CLAUDE_PLUGIN_ROOT}/bin/huddle" labels --issue <n>` once. Without a staging branch run it right after the merge. The Issue is closed by then, so for it the command recomputes the Issues that wait for it and **assigns** the ones that come out ready: only the Coach assigns, and you are the Coach here.
3. **A release PR** (versions and `CHANGELOG.md` at a new version): after the merge, check that every cell of the smoke test is ✔
   in the PR text. Then, on an up-to-date default branch, tag and publish it yourself: `git tag -a vX.Y.Z -m "Huddle vX.Y.Z"`,
   `git push origin vX.Y.Z`, and `gh release create vX.Y.Z --notes-file <the version's section of CHANGELOG.md>` (GitLab:
   `glab release create vX.Y.Z`). If a cell is not ✔, do not tag: say which one.
4. Ask the Coach only for what needs them, as «🙋 Only you» steps: for example a second account, a token, or a
   permission the platform denied. If a merge or a push is refused (branch protection, a missing permission), stop and
   ask; never look for another way.
5. Tell the Player's next step in one line. Follow-up work the review found: write it as Issues right away with `/huddle-issue`.

## Keeping the labels right

`labels --issue <n>` (docs/design.md §22) is best effort: if it fails (no permission to edit labels, the platform is unreachable), say one line with the reason and go on; it never stops or blocks the review or the merge and never asks the person anything. The cloud job, or the next session, catches up.

## Asking the Coach

**Asking the person (Issue #321).** A decision for the person is asked with the `AskUserQuestion` tool, never as prose: up to 4 related questions in one call, each with 2 to 4 concrete options (a label plus its trade-off in one line), the recommended one first and marked «(Recommended)», never a yes/no wrapped in prose; the automatic «Other» stays. When it must ask the Coach (a product choice, a choice that changes what users see or do, an order or a priority, money, accounts or secrets, deleting work or data), use this form. In OpenAI Codex use Codex's own structured-question tool (`request_user_input`, with options and an «Other» answer) when the session has it (check the tool list at run time, it may exist only in Plan mode); with no such tool, write the same question as a numbered list, the recommended option first, then a last line «Other: tell me what you prefer», and wait. A pending decision stays visible in `node "${CLAUDE_PLUGIN_ROOT}/bin/huddle" queue` and in the «Stalled» block of `node "${CLAUDE_PLUGIN_ROOT}/bin/huddle" next` until answered: a Coach session that starts or wakes with decisions waiting asks them again, once per session, before anything else, and a message that asked and got no answer ends with one line «Pending decisions: #n, #m» (in a numbered list, the list ends with the Issue numbers so the person can answer by number). A technical or process choice with a clear best answer is still taken and said in one line.

## Reopening an Issue

Only the Coach's session reopens an Issue (for example one that failed its test in staging); nobody reopens one by hand on the website.
Run `gh issue reopen <n>` (or `glab issue reopen <n>`) with a comment that says why. Then run
`node "${CLAUDE_PLUGIN_ROOT}/bin/huddle" labels --issue <n>` and, once, the full `node "${CLAUDE_PLUGIN_ROOT}/bin/huddle" labels`, so the «tested in
staging» label goes and the Issues that depend on it are blocked again. Both are best effort, as above. The fix is a new PR/MR on the same Issue,
landed as usual.

## Who does each step

Before you hand a step to the person, check whether you can do it yourself with the tools and logins you have (`gh`, `glab`,
and the repo's own tools). If you can, do it and report what you did. Only a step that needs something you cannot have goes to them: a second
person's account, a payment, a secret, a phone or another device, a legal or business decision, a paid action they must
approve, or a permission that was denied. Write that step as numbered «🙋 Only you» steps for someone with no technical
background (docs/design.md §13): one action per step, a copy block for what is pasted, «You should see:» and «If you see
something else:». Your closing message says what you did yourself, and its next step is either a step you will take or those
🙋 steps. If a permission is denied or a credential is missing, stop and ask; never look for another way.
