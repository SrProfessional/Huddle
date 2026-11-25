---
name: huddle-release
description: Use when the Coach wants to release the staging branch to production (the default branch): it checks that every Issue in staging was tested there, runs the project's clean check, opens the release PR/MR and merges it. Run it as `/huddle-release`.
---

# huddle-release

For the Coach only. Run `node "${CLAUDE_PLUGIN_ROOT}/bin/huddle" doctor`: if you are not the `coach` login in `huddle.json`,
stop with one clear line («/huddle-release is for the Coach») and change nothing; you never merge when you are not that session.
A repo with no `staging_branch` has nothing to release this way: say so and stop. The rules are in docs/design.md §21.

**In OpenAI Codex** (Issue #213): run the `huddle` command the session start named wherever this skill writes `node "${CLAUDE_PLUGIN_ROOT}/bin/huddle"`; make worktrees with `git worktree add` and work in that folder; run `gh`, `glab`, `git push` and `huddle` with network access (approve it when Codex asks).

**Asking the person (Issue #321).** A decision for the person is asked with the `AskUserQuestion` tool, never as prose: up to 4 related questions in one call, each with 2 to 4 concrete options (a label plus its trade-off in one line), the recommended one first and marked «(Recommended)», never a yes/no wrapped in prose; the automatic «Other» stays. Here it covers the Coach's OK of the list (step 4), the word to merge (step 5) and the confirmations of step 1: the OK and the word to merge are asked in this form, and the release still never goes on without the Coach's word. In OpenAI Codex use Codex's own structured-question tool (`request_user_input`, with options and an «Other» answer) when the session has it (check the tool list at run time, it may exist only in Plan mode); otherwise use `request_user_input_async` when supported and follow the managed block's pending-question rule. When neither selector is available, write the same question as a numbered list, the recommended option first, then a last line «Other: tell me what you prefer», and wait. A pending decision stays visible in `node "${CLAUDE_PLUGIN_ROOT}/bin/huddle" queue` and in the «Stalled» block of `node "${CLAUDE_PLUGIN_ROOT}/bin/huddle" next` until answered: a Coach session that starts or wakes with decisions waiting asks them again, once per session, before anything else, and ends the pending turn only after an explicit deferral or interruption. A message that asked and got no answer ends with one line «Pending decisions: #n, #m» (in a numbered list, the list ends with the Issue numbers so the person can answer by number).

Do these in this order. Every command is `node "${CLAUDE_PLUGIN_ROOT}/bin/huddle"` followed by the words shown.

1. **What is in staging.** Run `node "${CLAUDE_PLUGIN_ROOT}/bin/huddle" release --json` and show the staged Issues with and without the
   marker, and the two warnings. Nothing in staging: say so and stop.
   - If the default branch is ahead of staging (a hotfix went straight to production), say that the back-merge comes first: a PR/MR from the
     default branch into staging, merged before this release. Offer to open that PR/MR with its body in a temporary UTF-8 file (`gh pr create --body-file <file>` or `glab mr create --description-file <file>`, never inline), and stop until it is merged.
   - If staging received commits that belong to no listed Issue after the newest test, show them and ask the Coach to confirm them.
2. **Each untested Issue.** When any staged Issue is untested, even exactly one, point the Coach to `/huddle-test` (a guided test, one Issue at a time, which marks each one) instead of asking Issue by Issue, and go on when it is done. Only if the Coach declines the guided test, say it plainly («#N has no «tested in staging» mark») and ask: has it been tested in staging? Run
   `node "${CLAUDE_PLUGIN_ROOT}/bin/huddle" tested <n>` only on a yes from the Coach. On a no, stop for that Issue. You may release it
   anyway with `--untested <n> --reason "<why>"` in step 4, only if the Coach gives the reason: never make up a reason yourself.
3. **The project's clean check on staging.** Run the check the project documents in its `CLAUDE.md`: a fresh worktree of `origin/<staging>`,
   a clean install, the project's test command. If the project documents none, ask the Coach how it is run; never invent it. A failing
   suite stops the release: report it with the output, and change nothing else.
4. **The list for production.** Show the Issues that will go out (and any with a reason) and wait for the Coach's OK. Then run
   `node "${CLAUDE_PLUGIN_ROOT}/bin/huddle" release open` (add `--untested <n> --reason "<why>"` for each Issue let through). It refuses on its own
   an untested Issue and a default branch that is ahead; report the refusal as it is.
5. **Merge.** Merge the release PR/MR with a merge commit (never squash or rebase) only when the Coach says so in the same chat.
   Report the link and what went out. For a release PR/MR that carries a new version, follow the release notes and tag procedure in `/huddle-review`.
6. **Check what can be installed.** After a confirmed production merge, if the project ships a separately versioned package or plugin,
   verify the current published version. Read the release record in the registry or on the platform and compare its tag or commit
   with the default branch and repository version files. Report the release PR/MR and published version separately. If the evidence
   cannot establish what the artifact contains, say so.
   - If there is no published version or it lacks the production changes, check whether a candidate already includes them.
     If a candidate already exists, advance the next authorized step. If it needs the person, ask about the remaining release decision.
     For example, offer to complete the next outstanding smoke check or ask for authorization to publish once the required checks pass.
     When preparation is still needed, ask one question using the multiple-choice workflow and the managed block's pending-question rule:
     - **Prepare the next version (Recommended).** Prepare the version change and release notes for review.
     - **Defer publication.** Keep the current published version and leave preparation for later.
   - Approval for preparation does not authorize publication. Follow the existing publication approvals, smoke test,
     Coach role, and platform permissions. When the published artifact already includes the changes, report the version and finish.

## Reopening an Issue

Only the Coach's session reopens an Issue (for example one that failed its test in staging); nobody reopens one by hand on the website.
Run `gh issue reopen <n>` (or `glab issue reopen <n>`). Write the reason to a temporary UTF-8 file and post it with `gh issue comment <n> --body-file <file>` or `glab api … -F 'body=@file'` on the Issue notes endpoint. Never pass it inline. Then run
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
