---
name: huddle-continue
description: Use when a developer picks an Issue up again after the AI Manager answered it: a review asked for changes, or a decision was given. Run it as `/huddle-continue <n>`.
---

# huddle-continue

Continues Issue `n`, which was already started, with the AI Manager's latest answer. You are a developer session: **never merge**, never
touch the default branch, production or secrets. The rules are in the Huddle block of `CLAUDE.md`; names are in `huddle.json`.
For an Issue that was not started yet, use `/huddle-start <n>`.

## Version notice (first, always)

Before anything else, run `node "${CLAUDE_PLUGIN_ROOT}/bin/huddle" notice`. It is read-only and needs no login. When it prints text, say that
text to the person, in their language, as the first thing in your answer, and then go on with the task: the notice never stops the work
and never asks anything. When it prints nothing, say nothing about versions (it shows at most once a day, so silence is normal).

## Continue an Issue (`/huddle-continue <n>`)

1. Read the Issue and find its branch (the «Branch» section). If neither a local branch nor `origin/<branch>` exists, the Issue was
   never started: change nothing and tell the developer to run `/huddle-start <n>`.
2. Enter the Issue's worktree, `.claude/worktrees/<branch>`, with your `EnterWorktree` tool. If the folder is gone but the branch
   exists, create it again with `git worktree add .claude/worktrees/<branch> <branch>` (without `-b`) and enter it.
3. Run `node "${CLAUDE_PLUGIN_ROOT}/bin/huddle" pending <n>`. If nothing is pending, say so, change nothing, and offer to wait with
   `node "${CLAUDE_PLUGIN_ROOT}/bin/huddle" wait <n>`.
4. If a request is pending, tell the developer which one it is (one line), then run
   `node "${CLAUDE_PLUGIN_ROOT}/bin/huddle" take <n>`. It marks the request 👀 and prints the AI Manager's prompt. Follow that
   prompt as if the developer had pasted it; same rules. Only comments by the `ai_manager` login count. The developer is not asked
   to paste anything.
5. Push, then comment «Ready for review again» with the real test counts (a Design Issue has none: say «no code, no tests»). Do not
   touch the `changes requested from AI Manager` label or any other: the labels job decides them.
6. End with «✅ Issue #N finished» (or «⛔ Issue #N stopped»), the link, the counts, what was not done and the next step. The next step is
   one the session takes, or numbered «🙋 Only you» steps when only the person can do it (see «Who does each step»).
7. Start the wait again in the background: `node "${CLAUDE_PLUGIN_ROOT}/bin/huddle" wait <n>`. When it ends, a new request is pending:
   the developer runs `/huddle-continue <n>` again.

## When you cannot go on

Commit and push what is done. Comment on the Issue starting with «❓ Decision for the AI Manager:» (what is blocked, the
options with trade-offs, your recommendation), add the `needs decision` label, end with «⛔ Issue #N stopped: waiting for a
decision». Never close the Issue.

## Who does each step

Before you hand a step to the person, check whether you can do it yourself with the tools and logins you have (`gh`, `glab`,
and the repo's own tools). If you can, do it and report what you did. Only a step that needs something you cannot have goes to them: a second
person's account, a payment, a secret, a phone or another device, a legal or business decision, a paid action they must
approve, or a permission that was denied. Write that step as numbered «🙋 Only you» steps for someone with no technical
background (docs/design.md §13): one action per step, a copy block for what is pasted, «You should see:» and «If you see
something else:». Your closing message says what you did yourself, and its next step is either a step you will take or those
🙋 steps. If a permission is denied or a credential is missing, stop and ask; never look for another way.
