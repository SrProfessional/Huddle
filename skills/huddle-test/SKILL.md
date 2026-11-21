---
name: huddle-test
description: Use when the Coach wants to test what is in staging, guided Issue by Issue. It orders the untested Issues, gives the steps to test each one and marks it «tested in staging» when the Coach says it passed. Run it as `/huddle-test` (Claude Code) or `$huddle-test` (Codex).
---

# huddle-test

For the Coach only. Run `node "${CLAUDE_PLUGIN_ROOT}/bin/huddle" doctor`: if you are not the `coach` login in `huddle.json`,
stop with one clear line («/huddle-test is for the Coach») and change nothing. A repo with no `staging_branch` has nothing to test this
way: say so and stop. The rules are in docs/design.md §21 (the release and the «tested in staging» mark).

**In OpenAI Codex**: run the `huddle` command the session start named wherever this skill writes `node "${CLAUDE_PLUGIN_ROOT}/bin/huddle"`; make worktrees with `git worktree add` and work in that folder; run `gh`, `glab`, `git push` and `huddle` with network access (approve it when Codex asks).

Do these in this order.

1. **What is untested.** Run `node "${CLAUDE_PLUGIN_ROOT}/bin/huddle" release --json` and take the Issues in staging that are not tested
   (`tested: false`). None: say so and point to `/huddle-release`.
2. **The order.** Order them and show the order, with one line of reason each, before starting; the Coach may change it. The rule: first what
   other Issues depend on (read each «Depends on»), then what a person sees or touches (screens, commands, texts) before internal changes, then
   what needs another tool or device (for example Codex) last, so those are grouped. An Issue that only changes docs or tests goes last and may be
   offered as «tested by its own tests».
3. **For each Issue, one at a time, never several together.** Say its number and title and what it changes in plain words for someone with no technical
   background. Then give the numbered steps to test it in staging, each with «You should see:» and «If you see something else:»
   (docs/design.md §13). Build the steps from, in this order of preference: a «How to test in staging» section of the Issue; then the Issue's
   Goal and «Tests that must pass» and the merged PR's description. Never invent a behaviour the Issue does not state: when the Issue does not give
   enough to write a step, say so and ask the Coach what to check. A step the session can run itself (a CLI command in a clean worktree of
   `origin/<staging_branch>`, a page it can generate) is run by the session and its output is shown, not handed to the Coach. Only what needs a
   person's eyes, a second account or another device is handed to the Coach, as numbered «🙋 Only you» steps.
4. **Wait for the Coach's answer for that Issue:**
   - «passed» (run `node "${CLAUDE_PLUGIN_ROOT}/bin/huddle" tested <n>` and go on to the next Issue);
   - «failed» (ask what they saw, and offer a bug Issue with `/huddle-bug` or reopening the Issue as in `/huddle-release`; do not mark it);
   - «skip» (leave it unmarked and go on);
   - «stop» (go to step 5).
   Never mark an Issue tested without a yes from the Coach in this chat.
5. **The end.** Show what is marked, what failed and what was skipped. When nothing is left untested, say that `/huddle-release` is next.

## Who does each step

Before you hand a step to the person, check whether you can do it yourself with the tools and logins you have (`gh`, `glab`,
and the repo's own tools). If you can, do it and report what you did. Only a step that needs something you cannot have goes to them: a second
person's account, a payment, a secret, a phone or another device, a legal or business decision, a paid action they must
approve, or a permission that was denied. Write that step as numbered «🙋 Only you» steps for someone with no technical
background (docs/design.md §13): one action per step, a copy block for what is pasted, «You should see:» and «If you see
something else:». Your closing message says what you did yourself, and its next step is either a step you will take or those
🙋 steps. If a permission is denied or a credential is missing, stop and ask; never look for another way.
