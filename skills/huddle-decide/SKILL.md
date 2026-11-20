---
name: huddle-decide
description: Use when an Issue has the needs decision label and the Coach must answer the Player's «Decision for the Coach» question.
---

# huddle-decide

For the Coach only. Run `node "${CLAUDE_PLUGIN_ROOT}/bin/huddle" doctor`: if you are not the `coach` login in `huddle.json`, stop; a Player
session never answers its own decision.

In OpenAI Codex, stop with one line: «/huddle-decide runs in Claude Code, where the Coach works.» (Issue #201)

## Do

1. List the Issues with the `needs decision` label (name in `huddle.json` under `labels.decision` if renamed). Open the
   one the Coach picks and read the newest comment that starts with «❓ Decision for the Coach:».
2. Read the options, their trade-offs and the recommendation. Read the pushed branch if the answer depends on the code.
   A technical question (a limit, a file to allow, the order of the work, how to build something already decided) has a clear best answer:
   take it (usually the Player's recommendation) without asking the Coach, and say in one line what you decided and why. Only a product
   question (what users see or do, a feature's scope, priorities, money, secrets, security, deleting data) goes to the Coach, with the options.
3. Post the answer on the Issue **and** on its PR/MR (if one exists), starting with the heading and a text block:

````text
## Prompt for Claude Code

```text
First run /huddle-play <n>: it marks this request as taken (👀), so the Issue shows «in progress».
Decision: <the chosen option and why, in one or two lines>.
<what to do now, concrete; end with: push, then comment «Ready for review again» with the counts>
```
````

   Use `gh issue comment` / `gh pr comment` (or `glab issue note` / `glab mr note`).
4. Right after posting the answer, run `node "${CLAUDE_PLUGIN_ROOT}/bin/huddle" labels --issue <n>` (`n` the Issue): it takes `needs decision` off now that the
   answer is there. Do not close anything and do not edit labels by hand. The command is best effort: if it fails (no permission to edit labels, the
   platform is unreachable), say one line with the reason and go on; it never stops or blocks the task and never asks anything, since the cloud job,
   or the next session, catches up. The Player's wait (`node "${CLAUDE_PLUGIN_ROOT}/bin/huddle" wait <n>`) picks the comment up.
5. If the decision changes the Issue's scope, edit the Issue text too, so it stays true.

## Who does each step

Before you hand a step to the person, check whether you can do it yourself with the tools and logins you have (`gh`, `glab`,
and the repo's own tools). If you can, do it and report what you did. Only a step that needs something you cannot have goes to them: a second
person's account, a payment, a secret, a phone or another device, a legal or business decision, a paid action they must
approve, or a permission that was denied. Write that step as numbered «🙋 Only you» steps for someone with no technical
background (docs/design.md §13): one action per step, a copy block for what is pasted, «You should see:» and «If you see
something else:». Your closing message says what you did yourself, and its next step is either a step you will take or those
🙋 steps. If a permission is denied or a credential is missing, stop and ask; never look for another way.
