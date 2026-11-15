---
name: huddle-watch
description: Use when the Coach wants its session to check by itself what waits for it and review the PRs/MRs, waiting in the background with no Claude tokens while nothing waits. Run it as `/huddle-watch`, `/huddle-watch 10m`, `/huddle-watch always`, `/huddle-watch status` or `/huddle-watch off`.
---

# huddle-watch

For the Coach only. Run `node "${CLAUDE_PLUGIN_ROOT}/bin/huddle" doctor`: if you are not the `coach` login in `huddle.json`,
stop with one clear line («/huddle-watch is for the Coach») and change nothing. The rules are in docs/design.md §19.

The watch waits in the background with a small Node process (`queue --wait`), as a Player's session waits for its review: it uses
**no Claude tokens while nothing waits**, and wakes this session only when something new waits. Nothing turns it on by itself, unless
the Coach chose `/huddle-watch always`: then each of their sessions of this repo, on this machine, starts it (the session start says so).

## Always (`/huddle-watch always`)

Run `node "${CLAUDE_PLUGIN_ROOT}/bin/huddle" queue --always` (a mark on this machine only, never in the repo: no PR, nobody else affected), then turn the
watch on as in «On». Say that it will start again in each of your sessions of this repo on this machine until `/huddle-watch off`. When the
session start says «the watch starts now, as you asked», do the same «On» steps before anything else.

## On (`/huddle-watch` or `/huddle-watch <interval>`)

An interval is like `5m`: default 5 minutes, allowed 2 to 60 (the wait takes it in seconds: `5m` is `300`).

1. If this session already runs the watch's background wait, the watch is already on: do **not** start a second one; say it is on and its
   interval, and stop.
2. Your first message says plainly: **turning the watch on is the Coach's order to review and merge, as if they asked for each
   review.** It uses no Claude tokens while nothing waits. It stops with `/huddle-watch off`, or by closing Claude Code, because the wait
   lives only in the session; it needs the session open and the computer on.
3. **Check now:** first run `node "${CLAUDE_PLUGIN_ROOT}/bin/huddle" labels` once, then run `node "${CLAUDE_PLUGIN_ROOT}/bin/huddle" queue --json` once and handle what it
   lists («Each item» below). When nothing waits, say one line, «Nothing is waiting for the Coach.», so the person sees that it ran.
4. **Then wait:** start `node "${CLAUDE_PLUGIN_ROOT}/bin/huddle" queue --wait <seconds> --seen <keys>` in the background (run it as a background command
   and keep its ID). `<keys>` are the items already told or stopped, separated by commas: `<pr>@<head>` for a review that stopped, `#<issue>`
   for a decision or a triage already said. With no keys, leave `--seen` out.
5. **When the wait ends:** it prints `{ "waiting": [...] }` with only the new items: handle them («Each item»), then start the wait again
   (step 4) with the keys updated. It prints `{ "stopped": true }` after `/huddle-watch off`: say the watch is off and start nothing.
   A wait that fails (the login, the network) ends with one line; say it once and start it again.

## The labels pass

Each round of the wait runs the full labels pass by itself after reading the queue, only when nothing new waits (it can take minutes on a
big project, and the queue seconds). It is local and free, unlike the cloud job, so the board is right every few minutes
even for what nobody's session handled (a merge from a phone). The check now runs `node "${CLAUDE_PLUGIN_ROOT}/bin/huddle" labels` before the queue. It is best
effort: if it fails, say one line with the reason, and the queue is read anyway; it never stops or blocks the watch and never asks
anything. Docs/design.md §19 and §22.

## Each item

- **`review` (Issue #165):** review several at once, oldest first: start reviews while the sum of the item's `effort` stays within
  `review_capacity` of `huddle.json` (default 5); a PR/MR bigger than the capacity is reviewed alone. Each review is a subagent with the
  Agent tool, **in the background**, with a clean context, told: «Review <pr> with /huddle-review, following its «Reviewing for the
  watch» section». A subagent never merges. When it ends with «needs changes», it already posted the comment and the item leaves the queue by itself.
- **Merges, one at a time, in this session.** For each «ready to merge», in order: check it again against the updated base (it still
  merges cleanly, and its tests pass on the branch updated with the base, in a fresh worktree). If not, post the usual «🔁 Changes
  requested» comment asking to update the branch from the base, and nothing is merged. If it does, approve and merge it, and land it, as
  «All good» of `/huddle-review` says. Then start the next review that fits.
- **A review that stops** (a test fails, a requirement is missing, the platform refuses the merge, a permission is missing): say it once,
  with the reason, and do **not** try that same PR/MR with that same `head` again: add `<pr>@<head>` to the keys. A new commit changes
  `head` and makes it a new item (a `head` of `null` means it could not be read: use the PR/MR number alone).
- **`decision` and `triage`:** never answered by the watch: those are the person's decisions. Say one line per new item («#47 waits for your
  decision», «#53 waits for your triage») once per Issue, add `#<issue>` to the keys, and leave it.

## Off (`/huddle-watch off`) and status (`/huddle-watch status`)

- **Off:** run `node "${CLAUDE_PLUGIN_ROOT}/bin/huddle" queue --wait-off` (the wait stops at its next round, even if this session lost its ID), stop
  the background command too when its ID is known, and say it is off. Off also forgets «always»: it will not start again by itself. Nothing running: say so.
- **Status:** say whether this session runs the watch's background wait, its interval, and whether «always» is set on this machine.

## Who does each step

Before you hand a step to the person, check whether you can do it yourself with the tools and logins you have (`gh`, `glab`,
and the repo's own tools). If you can, do it and report what you did. Only a step that needs something you cannot have goes to them: a second
person's account, a payment, a secret, a phone or another device, a legal or business decision, a paid action they must
approve, or a permission that was denied. Write that step as numbered «🙋 Only you» steps for someone with no technical
background (docs/design.md §13): one action per step, a copy block for what is pasted, «You should see:» and «If you see
something else:». Your closing message says what you did yourself, and its next step is either a step you will take or those
🙋 steps. If a permission is denied or a credential is missing, stop and ask; never look for another way.
