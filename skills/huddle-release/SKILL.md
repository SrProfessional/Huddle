---
name: huddle-release
description: Use when the AI Manager wants to release the staging branch to production (the default branch): it checks that every Issue in staging was tested there, runs the project's clean check, opens the release PR/MR and merges it. Run it as `/huddle-release`.
---

# huddle-release

For the AI Manager only. Run `node "${CLAUDE_PLUGIN_ROOT}/bin/huddle" doctor`: if you are not the `ai_manager` login in `huddle.json`,
stop with one clear line («/huddle-release is for the AI Manager») and change nothing; you never merge when you are not that session.
A repo with no `staging_branch` has nothing to release this way: say so and stop. The rules are in docs/design.md §21.

Do these in this order. Every command is `node "${CLAUDE_PLUGIN_ROOT}/bin/huddle"` followed by the words shown.

1. **What is in staging.** Run `node "${CLAUDE_PLUGIN_ROOT}/bin/huddle" release --json` and show the staged Issues with and without the
   marker, and the two warnings. Nothing in staging: say so and stop.
   - If the default branch is ahead of staging (a hotfix went straight to production), say that the back-merge comes first: a PR/MR from the
     default branch into staging, merged before this release. Offer to open that PR/MR, and stop until it is merged.
   - If staging received commits that belong to no listed Issue after the newest test, show them and ask the AI Manager to confirm them.
2. **Each untested Issue.** Say it plainly («#N has no «tested in staging» mark») and ask: has it been tested in staging? Run
   `node "${CLAUDE_PLUGIN_ROOT}/bin/huddle" tested <n>` only on a yes from the AI Manager. On a no, stop for that Issue. You may release it
   anyway with `--untested <n> --reason "<why>"` in step 4, only if the AI Manager gives the reason: never make up a reason yourself.
3. **The project's clean check on staging.** Run the check the project documents in its `CLAUDE.md`: a fresh worktree of `origin/<staging>`,
   a clean install, the project's test command. If the project documents none, ask the AI Manager how it is run; never invent it. A failing
   suite stops the release: report it with the output, and change nothing else.
4. **The list for production.** Show the Issues that will go out (and any with a reason) and wait for the AI Manager's OK. Then run
   `node "${CLAUDE_PLUGIN_ROOT}/bin/huddle" release open` (add `--untested <n> --reason "<why>"` for each Issue let through). It refuses on its own
   an untested Issue and a default branch that is ahead; report the refusal as it is.
5. **Merge.** Merge the release PR/MR with a merge commit (never squash or rebase) only when the AI Manager says so in the same chat.
   Report the link and what went out. The release notes and the tag are made as in `/huddle-review`.

## Who does each step

Before you hand a step to the person, check whether you can do it yourself with the tools and logins you have (`gh`, `glab`,
and the repo's own tools). If you can, do it and report what you did. Only a step that needs something you cannot have goes to them: a second
person's account, a payment, a secret, a phone or another device, a legal or business decision, a paid action they must
approve, or a permission that was denied. Write that step as numbered «🙋 Only you» steps for someone with no technical
background (docs/design.md §13): one action per step, a copy block for what is pasted, «You should see:» and «If you see
something else:». Your closing message says what you did yourself, and its next step is either a step you will take or those
🙋 steps. If a permission is denied or a credential is missing, stop and ask; never look for another way.
