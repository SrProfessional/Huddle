---
name: huddle-start
description: Use when a developer starts an Issue, continues one that is in progress, or the session opens with a pending request from the AI Manager.
---

# huddle-start

One task = one Issue = one branch = one PR/MR. You are a developer session: **never merge**, never touch the default
branch, production or secrets. The rules are in the Huddle block of `CLAUDE.md`; names are in `huddle.json`.

## Start an Issue (`/huddle-start <n>`)

1. Read the whole Issue and the documents it names. Follow its «Prompt for Claude Code» block.
2. Check each Issue under «Depends on»: it counts only if it is closed **and** a merged PR/MR closed it. If one is not, change
   nothing and end with «⛔ Issue #N stopped: waiting for #X».
3. Create the branch in a worktree of its own, as the Issue says, and add the `in progress` label.
4. Run the tests before changing anything. Then work with TDD, touching only the allowed files.
5. Open the PR/MR with `Closes #N`, using the template: what changed, the real test counts, **What was NOT done**.
6. End with «✅ Issue #N finished» (or «⛔ Issue #N stopped»), the link, the counts, what was not done, the next step.
7. Start the wait in the background: `node "${CLAUDE_PLUGIN_ROOT}/bin/huddle" wait <n>`. When it ends, a review request is
   pending: go to «Continue» below.

## Continue (`/huddle-start`, or the hook said a request is pending)

1. Tell the developer which request is pending and ask if you should continue.
2. If yes, run `node "${CLAUDE_PLUGIN_ROOT}/bin/huddle" take <n>`. It marks the request 👀 and prints the AI Manager's prompt.
3. Follow that prompt as if the developer had pasted it; same rules. Only comments by the `ai_manager` login count.
4. Push, then comment «Ready for review again» with the counts. Do not touch the `changes requested` label: the labels job
   decides it. Then run `huddle wait <n>` again.

## When you cannot go on

Commit and push what is done. Comment on the Issue starting with «❓ Decision for the AI Manager:» (what is blocked, the
options with trade-offs, your recommendation), add the `needs decision` label, end with «⛔ Issue #N stopped: waiting for a
decision». Never close the Issue.
