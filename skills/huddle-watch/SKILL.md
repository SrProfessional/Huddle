---
name: huddle-watch
description: Use when the AI Manager wants its session to check by itself, every few minutes, what waits for it and review the PRs/MRs. Run it as `/huddle-watch`, `/huddle-watch 10m`, `/huddle-watch status` or `/huddle-watch off`.
---

# huddle-watch

For the AI Manager only. Run `node "${CLAUDE_PLUGIN_ROOT}/bin/huddle" doctor`: if you are not the `ai_manager` login in `huddle.json`,
stop with one clear line («/huddle-watch is for the AI Manager») and change nothing. The rules are in docs/design.md §19.

## On (`/huddle-watch` or `/huddle-watch <interval>`)

An interval is like `5m`: default 5 minutes, allowed 2 to 60.

1. Run `CronList`. If a job whose prompt starts with `[huddle-watch]` is there, the watch is already on: do **not** start a second one;
   say it is on, its interval and when it runs next, and stop.
2. Otherwise `CronCreate` a recurring job on a minute that is not :00 or :30 (for 5 minutes, `2-59/5 * * * *`) whose prompt starts with
   `[huddle-watch]` and says: first run `node "${CLAUDE_PLUGIN_ROOT}/bin/huddle" labels`, then run `node "${CLAUDE_PLUGIN_ROOT}/bin/huddle" queue --json`; if nothing waits, say nothing and stop;
   otherwise handle the items one at a time, oldest first, as «Each item» below.
3. Your first message says plainly: **turning the watch on is the AI Manager's order to review and merge, as if they asked for each
   review.** It stops with `/huddle-watch off`, or by closing Claude Code, because the job lives only in the session. A recurring job
   expires after 7 days: run `/huddle-watch` again then. Add that the first check runs now and the next ones at the interval.
4. **Check now:** in the same turn, first run `node "${CLAUDE_PLUGIN_ROOT}/bin/huddle" labels` once, then run `node "${CLAUDE_PLUGIN_ROOT}/bin/huddle" queue --json` once and handle what it lists exactly as a
   tick does («Each item» below). The same list is shared with the ticks (the stopped PR/MR + `head` pairs), so a PR stopped now is not
   tried again at the next tick. Unlike a tick, the first check is not silent when nothing waits: say one line,
   «Nothing is waiting for the AI Manager.», so the person sees that it ran.

## The labels pass (before the queue, in each tick and in the first check)

The full `node "${CLAUDE_PLUGIN_ROOT}/bin/huddle" labels` is local and free, unlike the cloud job, so the board is right every few minutes even for
what nobody's session handled (a merge from a phone). It is best effort: if it fails, say one line with the reason, at most once per tick, and
the queue is read anyway; it never stops or blocks the watch and never asks anything. Docs/design.md §19 and §22.

## Each item

- **`review`:** run `/huddle-review` on that PR/MR (the item's `pr`) with its usual rules. All good: approve and merge, as it does today.
  Changes needed: the usual «🔁 Changes requested» comment. Either way the item leaves the queue by itself. If the review **stops** (a test
  fails, a requirement is missing, the platform refuses the merge, a permission is missing), say it once, with the reason, and do **not**
  try that same PR/MR with that same `head` again. A new commit changes `head` and makes it a new item (a `head` of `null` means it could not be read: use the PR/MR number alone). Keep the list of
  stopped PR/MR + `head` pairs for the session.
- **`decision` and `triage`:** never answered by the watch: those are the person's decisions. Say one line per new item («#47 waits for your
  decision», «#53 waits for your triage») once per Issue, and leave it.

## Off (`/huddle-watch off`) and status (`/huddle-watch status`)

- **Off:** `CronList`, `CronDelete` the `[huddle-watch]` job, and say it is off. Nothing running: say so.
- **Status:** say whether it is on, the interval and the next run, as `CronList` gives it.

## Who does each step

Before you hand a step to the person, check whether you can do it yourself with the tools and logins you have (`gh`, `glab`,
and the repo's own tools). If you can, do it and report what you did. Only a step that needs something you cannot have goes to them: a second
person's account, a payment, a secret, a phone or another device, a legal or business decision, a paid action they must
approve, or a permission that was denied. Write that step as numbered «🙋 Only you» steps for someone with no technical
background (docs/design.md §13): one action per step, a copy block for what is pasted, «You should see:» and «If you see
something else:». Your closing message says what you did yourself, and its next step is either a step you will take or those
🙋 steps. If a permission is denied or a credential is missing, stop and ask; never look for another way.
