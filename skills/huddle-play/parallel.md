# Several Issues at once (`/huddle-play` with no number)

Read by `/huddle-play` when the Player gives no Issue number (Issue #164, docs/design.md §24). This session does not work on any Issue
itself: it hands each one to a subagent with a clean context, waits for the reviews, and fills the Player's capacity again as work ends.
So no Issue pays for another one's context. Every command below is `node "${CLAUDE_PLUGIN_ROOT}/bin/huddle"` followed by the words shown.

## 1. What starts now

Run `node "${CLAUDE_PLUGIN_ROOT}/bin/huddle" next --json`. Tell the Player, in their language, in a few lines: the capacity and the points in use, each Issue
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
what was not done, or why you stopped (a decision, a permission, a dependency).
```

A Design Issue never goes to a subagent (`huddle next` never lists one to start): it needs the designer in the chat.

## 3. When a subagent ends

Read only its summary; never read the diff or its files here. Then:

- **It opened its PR/MR, or it stopped for a decision:** nothing more for that Issue here: the Player's watch (step 5) sees the Coach's answer.
- **It stopped for anything else** (a permission, a missing credential, a dependency): tell the Player in one line, and do not retry it.

Then run `huddle next --json` again: an Issue in review uses no room, so the next one that fits can start (step 2).

## 4. Resume an Issue (the Coach answered)

- **A request from the Coach** (a review asked for changes, or a decision was answered; `resume` in `next --json`): continue **that Issue's** subagent with
  SendMessage: «The Coach left a request on #<n>: follow «Continue an Issue» of SKILL.md for #<n>, then end with the same short summary.»
  If SendMessage is not available here, or the subagent's ID is lost (a new session, an old wait that died), launch a new background
  subagent with that same message instead: it works in the Issue's existing worktree. When it ends, go back to step 3.
- **The Issue is finished** (its PR/MR was merged, or the Issue was closed): say so in one line and run `huddle next --json` again.

## 5. Keep watching: the Player's watch (Issue #248)

After each round (and when there was nothing to do), start the Player's watch, which waits with no tokens and wakes this session when an
Issue can start or the Coach answers one: `node "${CLAUDE_PLUGIN_ROOT}/bin/huddle" next --wait --seen <keys>` in the background
(in OpenAI Codex: `next --wait --seen <keys> --codex`, which returns at once; this chat gets «Huddle (Player): … Run $huddle-play and do it»).
`<keys>` are the keys it gave before for what you already handled (`start:#n`, `resume:#n:<id>`), so the same thing never wakes you twice;
leave `--seen` out the first time. When it wakes: run `next --json` again (the queue is re-read live: never start from the old answer) and
go on from step 1. It checks every 2 minutes. One per Player and repo: if it says it already runs in another session, say so in one line and
stop. `node "${CLAUDE_PLUGIN_ROOT}/bin/huddle" next --wait-off` stops it. It needs this session open and the computer on.

## 6. While it runs

Keep a short list for the Player: each Issue, its state (working, in review, waiting for you, stopped) and its PR/MR, and add what
`node "${CLAUDE_PLUGIN_ROOT}/bin/huddle" status` says about the waits (each one's last check, so a wait that died shows). Show it when asked
and after each change. When nothing is left to start, nothing is active and no wait is running, say so and end.

`/huddle-play <n>` still works on one Issue in this session, as before.
