---
name: huddle-watch
description: Use when the AI Manager wants its session to check by itself what waits for it and review the PRs/MRs, waiting in the background with no Claude tokens while nothing waits. Run it as `/huddle-watch`, `/huddle-watch 10m`, `/huddle-watch status` or `/huddle-watch off`.
---

# huddle-watch

For the AI Manager only. Run `node "${CLAUDE_PLUGIN_ROOT}/bin/huddle" doctor`: if you are not the `ai_manager` login in `huddle.json`,
stop with one clear line («/huddle-watch is for the AI Manager») and change nothing. The rules are in docs/design.md §19.

The watch waits in the background with a small Node process (`queue --wait`), as a developer's session waits for its review: it uses
**no Claude tokens while nothing waits**, and wakes this session only when something new waits. Nothing turns it on by itself.

## On (`/huddle-watch` or `/huddle-watch <interval>`)

An interval is like `5m`: default 5 minutes, allowed 2 to 60 (the wait takes it in seconds: `5m` is `300`).

1. If this session already runs the watch's background wait, the watch is already on: do **not** start a second one; say it is on and its
   interval, and stop.
2. Your first message says plainly: **turning the watch on is the AI Manager's order to review and merge, as if they asked for each
   review.** It uses no Claude tokens while nothing waits. It stops with `/huddle-watch off`, or by closing Claude Code, because the wait
   lives only in the session; it needs the session open and the computer on.
3. **Check now:** first run `node "${CLAUDE_PLUGIN_ROOT}/bin/huddle" labels` once, then run `node "${CLAUDE_PLUGIN_ROOT}/bin/huddle" queue --json` once and handle what it
   lists («Each item» below). When nothing waits, say one line, «Nothing is waiting for the AI Manager.», so the person sees that it ran.
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

- **`review`:** run `/huddle-review` on that PR/MR (the item's `pr`) with its usual rules. All good: approve and merge, as it does today.
  Changes needed: the usual «🔁 Changes requested» comment. Either way the item leaves the queue by itself. If the review **stops** (a test
  fails, a requirement is missing, the platform refuses the merge, a permission is missing), say it once, with the reason, and do **not**
  try that same PR/MR with that same `head` again: add `<pr>@<head>` to the keys. A new commit changes `head` and makes it a new item (a
  `head` of `null` means it could not be read: use the PR/MR number alone). Handle the items one at a time, oldest first.
- **`decision` and `triage`:** never answered by the watch: those are the person's decisions. Say one line per new item («#47 waits for your
  decision», «#53 waits for your triage») once per Issue, add `#<issue>` to the keys, and leave it.

## Off (`/huddle-watch off`) and status (`/huddle-watch status`)

- **Off:** run `node "${CLAUDE_PLUGIN_ROOT}/bin/huddle" queue --wait-off` (the wait stops at its next round, even if this session lost its ID), stop
  the background command too when its ID is known, and say it is off. Nothing running: say so.
- **Status:** say whether this session runs the watch's background wait, and its interval.

## Who does each step

Before you hand a step to the person, check whether you can do it yourself with the tools and logins you have (`gh`, `glab`,
and the repo's own tools). If you can, do it and report what you did. Only a step that needs something you cannot have goes to them: a second
person's account, a payment, a secret, a phone or another device, a legal or business decision, a paid action they must
approve, or a permission that was denied. Write that step as numbered «🙋 Only you» steps for someone with no technical
background (docs/design.md §13): one action per step, a copy block for what is pasted, «You should see:» and «If you see
something else:». Your closing message says what you did yourself, and its next step is either a step you will take or those
🙋 steps. If a permission is denied or a credential is missing, stop and ask; never look for another way.
