# Several Issues at once (`/huddle-play` with no number)

Read by `/huddle-play` when the Player gives no Issue number (Issue #164, docs/design.md §24). This session does not work on any Issue
itself: it hands each one to a subagent with a clean context, waits for the reviews, and fills the Player's capacity again as work ends.
So no Issue pays for another one's context. Every command below is `node "${CLAUDE_PLUGIN_ROOT}/bin/huddle"` followed by the words shown.

## 1. What starts now

Run `node "${CLAUDE_PLUGIN_ROOT}/bin/huddle" next --json`. Finish any pending main-checkout return in `returns` as section 7, step 7 describes, then read the schedule again after a release. Tell the Player, in their language, in a few lines: the capacity and the points in use, each Issue
to **resume** (the Coach answered it and no session took it yet), each Issue that starts now (number, title, effort), and each one that
waits with its reason. Resume first (step 4), then start (step 2). **Nothing to resume or start is not the end**: go to step 5 and keep
watching (Issue #248).

Say once, in plain words: «I work on these Issues in parallel, each with its own helper. Leave this session open: closing it stops them.
If a helper needs your OK for a command, the question appears here. To use fewer at once: `huddle capacity <points>`.»

## 2. One subagent per Issue

In OpenAI Codex, a subagent is a Codex subagent (Codex runs them by default); the rest is the same (Issue #213).

For each Issue in `start`, launch a subagent with the Agent tool, **in the background**, and keep its ID next to the Issue number. Its
prompt, with `<n>` and the paths filled in:

```text
You work on Issue #<n> of this repo with Huddle, as a Player session. Read ${CLAUDE_PLUGIN_ROOT}/skills/huddle-play/SKILL.md and follow
«Start an Issue» for Issue <n> exactly: its own worktree from the up-to-date staging branch (or the default branch when there is none),
labels --issue <n> --started, TDD, the allowed files only, the PR/MR, labels --issue <n>. Do not start the wait. If you cannot go on,
follow «When you cannot go on» but do not start the wait either. End with a short summary: the PR/MR link, the test counts in one line,
what was not done, or why you stopped (a decision, a permission, a dependency). If you stop for a dependency, follow «A stop for a
dependency» of SKILL.md: write `- #X` in the Issue's «Depends on» and turn an open PR/MR into a draft.
```

A Design Issue never goes to a subagent (`huddle next` never lists one to start): it needs the designer in the chat.

## 3. When a subagent ends

Read only its summary; never read the diff or its files here. Then:

- **It opened its PR/MR, or it stopped for a decision:** nothing more for that Issue here: the Player's watch (step 5) sees the Coach's answer.
- **It stopped for a dependency** («waiting for #X»): check that the stopped Issue now names it in «Depends on» (`gh issue view <n> --json body`); if it does not,
  write `- #X` there yourself as in «A stop for a dependency» of SKILL.md (and turn an open PR/MR into a draft), then run `labels --issue <n>`. Tell the Player in one line, and do not retry it.
- **It stopped for anything else** (a permission, a missing credential): tell the Player in one line, and do not retry it.

Then run `huddle next --json` again: an Issue in review uses no room, so the next one that fits can start (step 2).
When `used` is above `capacity` (a request came back), nothing new starts: wait for the work to end, then run `huddle next --json` again.

## 4. Resume an Issue (the Coach answered)

- **A request from the Coach** (a review asked for changes, or a decision was answered; `resume` in `next --json`): continue **that Issue's** subagent with
  SendMessage: «The Coach left a request on #<n>: follow «Continue an Issue» of SKILL.md for #<n>, then end with the same short summary.»
  If SendMessage is not available here, or the subagent's ID is lost (a new session, an old wait that died), launch a new background
  subagent with that same message instead: it works in the Issue's existing worktree. When it ends, go back to step 3.
- **An interrupted Issue** (`kind: "interrupted"`, no Coach request): continue it the same way, with the message «#<n> was interrupted: run `huddle take <n>`, then follow «Continue an Issue» of SKILL.md for #<n>: in its worktree run the tests, finish what the Issue asks and open the PR/MR». `take` marks this session as its worker, so no other session offers it.
- **The Issue is finished** (its PR/MR was merged, or the Issue was closed): say so in one line and run `huddle next --json` again.

## 5. Keep watching: the Player's watch (Issue #248)

After each round, including an empty queue at startup, ensure the Player's watch is running before closing the foreground round.
Keep the watch if it is already running in this session. Otherwise start it with
`node "${CLAUDE_PLUGIN_ROOT}/bin/huddle" next --wait --seen <keys>` in the background
(in OpenAI Codex: `next --wait --seen <keys> --codex`, which returns at once; this chat gets «Huddle (Player): … Run $huddle-play and do it»).
`<keys>` are the keys it gave before for what you already handled (`start:#n`, `resume:#n:<id>`), so the same thing never wakes you twice;
leave `--seen` out the first time. When it wakes: run `next --json` again (the queue is re-read live: never start from the old answer) and
go on from step 1. It checks every 2 minutes. One per Player and repo: if it says it already runs in another session, say so in one line and
stop. `node "${CLAUDE_PLUGIN_ROOT}/bin/huddle" next --wait-off` stops it. It needs this session open and the computer on.
It waits with no tokens. If Codex queues a message without resuming the chat, the same watch keeps polling for new events.

**After you closed the chat or turned off the computer** (Issue #304): a new session simply runs `/huddle-play` again, with no question. A watch whose owner is gone (its process, its heartbeat, or a restart of the computer) is taken over by the new one without `--take-over`; only a live owner keeps it. The session start clears the stale wait markers of sessions that are gone, so no warning says «run /huddle-play n» for an Issue with nothing to resume (a Coach request that waits is still offered by `resume`). An Issue of this login that was in progress on this machine, with commits, and whose worker is gone shows in `resume` with `kind: "interrupted"` (and a `branch`); it is never offered when another machine claimed it, or it is paused, parked, in review or waiting for the Coach.

## 7. An Issue that needs a tool open on the main checkout (Issue #339, docs/design.md §24)

An Issue with `- Editor: <tool>` (or plain `- Editor`; `- Unity Editor` is the same as `- Editor: Unity`) under `## Needs` runs in the tool the person already has open on the **main checkout**: no worktree, no switching by hand. `huddle next` starts it only when nothing else of this login is active and lists the rest as «waits for the tool: #n is running» or «#n uses it». The slot is held until the main checkout's return is verified. The rules are the pure functions of `lib/core/tool-slot.mjs`. The subagent (or this session) runs these checks and commands itself, in the main checkout, and **never** runs `git stash`, `git reset`, `git checkout .` or a forced switch on its own:

1. **Look first, change nothing.** Run `git status --porcelain` and `git branch --show-current` in the main checkout. Is the tool connected? Only a tool with a detector can be asked (the first one is a game engine's editor, through the sessions' tools for it, `mcpforunity://instances` for Unity); any other or unnamed tool is unknown.
2. **Uncommitted changes** (any line of the status): stop and write ONE step (`checkoutPlan`, kind `changes`): «Choose what happens to the changes in your main checkout: commit them, save them aside with a stash so I can give them back, or ask me to wait», in a file with `Reason:`, `Step:`, `See:` and `Otherwise:` lines. Post the dirty-checkout option with `huddle steps <n> --post <file> --preflight --checkout-changes`. The Coach's `/huddle-steps` asks **Wait**, **Commit my changes** and **Save changes in a stash**. Wait leaves the step pending and the checkout untouched. Commit checks the checkout again after the person has committed. Stashing begins only after the Coach records the person's explicit stash choice with `steps <n> --done --note stash`, then runs `steps <n> --stash` while the Issue is parked. Use plain `--preflight` for the branch and tool questions. The command checks the recorded choice, saves the changes with a unique tag, and pins that stash by its commit ID. If saving was interrupted, retry the same command to recover the tagged stash. Check that saving succeeded and the checkout is clean before switching. A checkout on a branch that is neither the base nor the Issue's is one question as well (kind `branch`). A tool that is not connected, or has no detector (and its step was not closed yet): ONE step «Open <tool> on the main checkout» (kind `tool`); once the person closes it, go on. One question at a time: changes, then branch, then the tool.
3. **Switch.** Clean, on the base branch, tool open: `git fetch origin`, then `git switch -c <branch> origin/<base>` (the branch is new; `git switch <branch>` when it exists). The checkout stays on that branch until step 7.
4. **Work** through the tools for it, run the Issue's tests, commit and push as always, open the PR/MR.
5. **Leave it ready.** Post the test steps for the person (`huddle steps <n> --post <file>`: one action each, what to see, what to do otherwise), for example «Press Play on the scene, on the phone and tablet layouts, in English and Spanish», **before** `labels --issue <n>`. Nothing else touches the checkout while they are open.
6. **The Issue may close while the steps are open.** It closes when its PR lands in staging (`huddle land`), usually while the person is still testing. `huddle steps <n> --post` records the test steps in this machine's shared folder. `huddle next` says «waits for the tool: #n (closed, its test steps are still open) uses it», and `huddle steps` and `/huddle-steps` still list and close the recorded Issue's steps. The final step being done, failed or skipped changes the record to a pending return. Another session still sees the slot held.
7. **Return the checkout** in the session that closed the last test step or in a later session on this machine. The close prints a pointer, and `huddle steps --json` and `huddle next --json` list pending handoffs under `returns`. On the main checkout, check `git status --porcelain --untracked-files=all` and `git branch --show-current`. If clean and on the Issue branch, fetch origin, switch to the configured base and run `git merge --ff-only origin/<base>`. If already clean and on the base, fetch and fast-forward there. Then run `huddle steps <n> --return` yourself. It fetches origin and verifies the actual main checkout is clean, on the base, and up to date. If the approved stash is recorded, it restores that exact stash, including staged changes, while the slot is still reserved. It keeps the stash as a backup and releases only after a successful restore. If restoration stops and the checkout is still clean, retry `huddle steps <n> --return`. If it is dirty, inspect the saved stash by the commit ID and ask the person one multiple-choice question about resolving the conflict or verifying the restored changes. After the person confirms those changes are back and all conflicts are resolved, run `huddle steps <n> --return --confirm-restored` yourself. For unexpected changes, a moved branch, or a failed check, keep the reservation and force nothing.

## 6. While it runs

Keep a short list for the Player: each Issue, its state (working, in review, waiting for you, stopped) and its PR/MR, and add what
`node "${CLAUDE_PLUGIN_ROOT}/bin/huddle" status` says about the waits (each one's last check, so a wait that died shows). Show it when asked
and after each change. After the last active Issue finishes, if no Issue is eligible, follow step 5 before closing the foreground round.

`/huddle-play <n>` still works on one Issue in this session, as before.
