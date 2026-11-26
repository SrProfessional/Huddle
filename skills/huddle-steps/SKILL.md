---
name: huddle-steps
description: Use when the Coach wants to do the steps that only the person can do, one Issue and one step at a time, or when a step or checkout return is pending. It asks the current step as a multiple choice, records the answer and finishes any checkout return after the last step. Run it as `/huddle-steps` (Claude Code) or `$huddle-steps` (Codex).
---

# huddle-steps

For the Coach only. Run `node "${CLAUDE_PLUGIN_ROOT}/bin/huddle" doctor`: if you are not the `coach` login in `huddle.json`, stop with one clear line («/huddle-steps is for the Coach») and change nothing. The data and the rules are in docs/design.md §13 (the steps of the person, Issue #338) and §19 (the reminders, Issue #340).

**In OpenAI Codex**: run the `huddle` command the session start named wherever this skill writes `node "${CLAUDE_PLUGIN_ROOT}/bin/huddle"`; run `gh`, `glab`, `git push` and `huddle` with network access (approve it when Codex asks).

**Asking the step (Issue #321).** The step is asked with the `AskUserQuestion` tool, never as prose: one question, the recommended one first and marked «(Recommended)». Ordinary steps have 4 options. The automatic «Other» stays. In OpenAI Codex use `request_user_input` (with options and an «Other» answer) when the session has it (check the tool list at run time, it may exist only in Plan mode); otherwise use `request_user_input_async` when supported and follow the managed block's pending-question rule. When neither selector is available, write the same question as a numbered list, the recommended option first, then a last line «Other: tell me what you prefer», and wait.

Do these in this order.

1. **What waits.** Run `node "${CLAUDE_PLUGIN_ROOT}/bin/huddle" steps --json`. On entry, handle `returns` before asking any `steps`, even when `steps` is empty. Follow «Return the main checkout» below and refresh the lists after each successful return. Finish any `stashApprovals` before asking another step, using the approved stash path below, then read the lists again. Only if both `steps` and `returns` are empty and there are no approved stashes waiting, say «No steps wait for you» and stop. The steps come ordered by the Issue that most other work waits for, then by the oldest.
2. **One step, of one Issue, never two at once.** Say the Issue number and title, the reason, «step i of n» and what waits for it (`waiting`: how many other Issues). Ask the step with the question of «Asking the step»: the text is the step's `do`, then «You should see:» its `see` and «If you see something else:» its `else`, in the person's language. If `huddle queue --json` has `asked` on this Issue, add «asked at <time>, still waiting» to the question. A step marked `checkoutChoice` follows «Choose what to do with local changes» below. For ordinary test steps, use these options:
   - **Done** (recommended): the person did it and saw what was expected.
   - **I could not do it**: the person is stuck; ask what stopped them in a word, and keep the step pending.
   - **It failed (I will tell you what I saw)**: it did not show what it should; ask what they saw. The Issue is not resumed.
   - **Skip it**: the Issue goes on without that step. A skipped last step puts the Issue back in play, as `huddle steps --skip` does; a failed one never does.
3. **Record the answer yourself; never ask the person to type a command.** «Done»: `node "${CLAUDE_PLUGIN_ROOT}/bin/huddle" steps <n> --done`. «It failed»: `steps <n> --failed --note "<what they saw>"` and offer `/huddle-bug` after handling any pending return. «Skip it»: `steps <n> --skip --note "<why>"`. «I could not do it» records nothing: run `node "${CLAUDE_PLUGIN_ROOT}/bin/huddle" asked <n>` and go to step 4. The note has no marker or command in it. Before asking a step the person has not answered, run `node "${CLAUDE_PLUGIN_ROOT}/bin/huddle" asked <n>` so the next ask can say «still waiting».
4. **Then the next step of the same Issue**, asked the same way. After recording a step closure, re-read `steps --json`. If this was the final step, handle the Issue's pending return immediately before moving on to the next Issue. After a successful return, re-read `steps --json` and continue the guided steps. When the Issue has no step left, say if it went back into play or was not resumed. Then the next Issue of step 1. If the person answers «Other: stop», go to step 5.
5. **The end.** Show what is closed, what failed, what was skipped, and the Issues that went back into play. Include any checkout returns that are pending. A step that is still pending stays in `huddle queue`, in the «Stalled» block of `huddle next` and in `huddle status`, and the Coach's session asks it again at the start of each turn and each watch wake.

### Choose what to do with local changes

Ask one question in the person's language using the same choice tool or numbered fallback. Use these three options and recommend waiting.

- **Wait** (recommended). Record the ask, leave the step pending and change nothing in the checkout. End this run or continue with an independent Issue.
- **Commit my changes**. After the person has committed and confirmed, run `steps <n> --done --note commit` yourself. The command checks that the main checkout is clean before recording the choice and resuming the Issue. If the checkout still has changes, leave the step pending.
- **Save changes in a stash**. Run `steps <n> --done --note stash` only if the person explicitly chooses this option. Once that command records consent, run `steps <n> --stash` yourself. This saves the approved changes before resuming the Issue. If saving is interrupted, leave the Issue parked. Its `stashApprovals` entry lets the next invocation retry the same command without asking for consent again.

After a successful Commit or Stash choice, re-read `steps --json` and follow step 4. An ambiguous answer leaves the question pending.

### Return the main checkout

Read `skills/huddle-play/parallel.md`, section 7, step 7. Follow the verified return in the main checkout and run `node "${CLAUDE_PLUGIN_ROOT}/bin/huddle" steps <n> --return` yourself. Use that section's recovery instructions for an approved stash. After the command succeeds, report the return and release for that Issue.

If the return is blocked or interrupted, keep the slot reserved and force nothing. Show the blocker and ask one multiple-choice question if the person must decide how to proceed. If the person chooses to wait or quits, report the return as pending and end this run. On the next `/huddle-steps` invocation on this machine, re-read `steps --json` and retry through the same checks. Continue the normal guided steps after a successful return.

A pending step holds only the work that depends on it (the Issue that waits, what lists it under «Depends on» and what shares an allowed file; `huddle queue` shows «holds» and «held»): never merge or move that work forward, and go on with independent reviews and merges.

## Who does each step

Before you hand a step to the person, check whether you can do it yourself with the tools and logins you have (`gh`, `glab`,
and the repo's own tools). If you can, do it and report what you did. Only a step that needs something you cannot have goes to them: a second
person's account, a payment, a secret, a phone or another device, a legal or business decision, a paid action they must
approve, or a permission that was denied. Write that step as numbered «🙋 Only you» steps for someone with no technical
background (docs/design.md §13): one action per step, a copy block for what is pasted, «You should see:» and «If you see
something else:». Your closing message says what you did yourself, and its next step is either a step you will take or those
🙋 steps. If a permission is denied or a credential is missing, stop and ask; never look for another way. Every step you write for the person is in the form of Issue #338 (one action, «You should see:», «If you see something else:»), never with a command for the person to type: you run it yourself after they confirm. To write a list, put it in a file (a first line `Reason: <why>`, an optional `After: resume|none`, then one block per step with `Step:`, `See:` and `Otherwise:` lines) and post it with `node "${CLAUDE_PLUGIN_ROOT}/bin/huddle" steps <n> --post <file>`.
