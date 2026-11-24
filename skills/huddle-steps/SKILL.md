---
name: huddle-steps
description: Use when the Coach wants to do the steps that only the person can do, one Issue and one step at a time, or when a step waits for the person. It asks the current step as a multiple choice, records the answer and puts the Issue back in play after the last step. Run it as `/huddle-steps` (Claude Code) or `$huddle-steps` (Codex).
---

# huddle-steps

For the Coach only. Run `node "${CLAUDE_PLUGIN_ROOT}/bin/huddle" doctor`: if you are not the `coach` login in `huddle.json`, stop with one clear line («/huddle-steps is for the Coach») and change nothing. The data and the rules are in docs/design.md §13 (the steps of the person, Issue #338) and §19 (the reminders, Issue #340).

**In OpenAI Codex**: run the `huddle` command the session start named wherever this skill writes `node "${CLAUDE_PLUGIN_ROOT}/bin/huddle"`; run `gh`, `glab`, `git push` and `huddle` with network access (approve it when Codex asks).

**Asking the step (Issue #321).** The step is asked with the `AskUserQuestion` tool, never as prose: one question, 4 options, the recommended one first and marked «(Recommended)»; the automatic «Other» stays. In OpenAI Codex use `request_user_input` (with options and an «Other» answer) when the session has it (check the tool list at run time, it may exist only in Plan mode); with no such tool, write the same question as a numbered list, the recommended option first, then a last line «Other: tell me what you prefer», and wait.

Do these in this order.

1. **What waits.** Run `node "${CLAUDE_PLUGIN_ROOT}/bin/huddle" steps --json`. None: say «No steps wait for you» and stop. The list comes ordered: the Issue that most other work waits for first, then the oldest.
2. **One step, of one Issue, never two at once.** Say the Issue number and title, the reason, «step i of n» and what waits for it (`waiting`: how many other Issues). Ask the step with the question of «Asking the step»: the text is the step's `do`, then «You should see:» its `see` and «If you see something else:» its `else`, in the person's language. If `huddle queue --json` has `asked` on this Issue, add «asked at <time>, still waiting» to the question. The options:
   - **Done** (recommended): the person did it and saw what was expected.
   - **I could not do it**: the person is stuck; ask what stopped them in a word, and keep the step pending.
   - **It failed (I will tell you what I saw)**: it did not show what it should; ask what they saw. The Issue is not resumed.
   - **Skip it**: the Issue goes on without that step. A skipped last step puts the Issue back in play, as `huddle steps --skip` does; a failed one never does.
3. **Record the answer yourself; never ask the person to type a command.** «Done»: `node "${CLAUDE_PLUGIN_ROOT}/bin/huddle" steps <n> --done`. «It failed»: `steps <n> --failed --note "<what they saw>"`, then offer `/huddle-bug` for it. «Skip it»: `steps <n> --skip --note "<why>"`. «I could not do it» records nothing: run `node "${CLAUDE_PLUGIN_ROOT}/bin/huddle" asked <n>` and go to step 4. The note has no marker or command in it. Before asking a step the person has not answered, run `node "${CLAUDE_PLUGIN_ROOT}/bin/huddle" asked <n>` so the next ask can say «still waiting».
4. **Then the next step of the same Issue** (the command printed it), asked the same way. When the Issue has no step left, say what happened to it: back in play, or not resumed (a failed or an `none` list). Then the next Issue of step 1. The person may answer «Other: stop»: go to step 5.
5. **The end.** Show what is closed, what failed, what was skipped, and the Issues that went back into play. A step that is still pending stays in `huddle queue`, in the «Stalled» block of `huddle next` and in `huddle status`, and the Coach's session asks it again at the start of each turn and each watch wake.

A pending step holds only the work that depends on it (the Issue that waits, what lists it under «Depends on» and what shares an allowed file; `huddle queue` shows «holds» and «held»): never merge or move that work forward, and go on with independent reviews and merges.

## Who does each step

Before you hand a step to the person, check whether you can do it yourself with the tools and logins you have (`gh`, `glab`,
and the repo's own tools). If you can, do it and report what you did. Only a step that needs something you cannot have goes to them: a second
person's account, a payment, a secret, a phone or another device, a legal or business decision, a paid action they must
approve, or a permission that was denied. Write that step as numbered «🙋 Only you» steps for someone with no technical
background (docs/design.md §13): one action per step, a copy block for what is pasted, «You should see:» and «If you see
something else:». Your closing message says what you did yourself, and its next step is either a step you will take or those
🙋 steps. If a permission is denied or a credential is missing, stop and ask; never look for another way. Every step you write for the person is in the form of Issue #338 (one action, «You should see:», «If you see something else:»), never with a command for the person to type: you run it yourself after they confirm.
