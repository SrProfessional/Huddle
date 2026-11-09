---
name: huddle-decide
description: Use when an Issue has the needs decision label and the AI Manager must answer the developer's «Decision for the AI Manager» question.
---

# huddle-decide

For the AI Manager only. Run `node "${CLAUDE_PLUGIN_ROOT}/bin/huddle" doctor`: if you are not the `ai_manager` login in `huddle.json`, stop; a developer
session never answers its own decision.

## Do

1. List the Issues with the `needs decision` label (name in `huddle.json` under `labels.decision` if renamed). Open the
   one the AI Manager picks and read the newest comment that starts with «❓ Decision for the AI Manager:».
2. Read the options, their trade-offs and the recommendation. Read the pushed branch if the answer depends on the code.
   If the choice is really the AI Manager's, ask them with the options; do not decide for them.
3. Post the answer on the Issue **and** on its PR/MR (if one exists), starting with the heading and a text block:

````text
## Prompt for Claude Code

```text
First run /huddle-start <n>: it marks this request as taken (👀), so the Issue shows «in progress».
Decision: <the chosen option and why, in one or two lines>.
<what to do now, concrete; end with: push, then comment «Ready for review again» with the counts>
```
````

   Use `gh issue comment` / `gh pr comment` (or `glab issue note` / `glab mr note`).
4. Do not change labels or close anything: the labels job takes `needs decision` off once the answer is there, and the
   developer's wait (`node "${CLAUDE_PLUGIN_ROOT}/bin/huddle" wait <n>`) picks the comment up.
5. If the decision changes the Issue's scope, edit the Issue text too, so it stays true.

## Who does each step

Before you hand a step to the person, check whether you can do it yourself with the tools and logins you have (`gh`, `glab`,
and the repo's own tools). If you can, do it and report what you did. Only a step that needs something you cannot have goes to them: a second
person's account, a payment, a secret, a phone or another device, a legal or business decision, a paid action they must
approve, or a permission that was denied. Write that step as numbered «🙋 Only you» steps for someone with no technical
background (docs/design.md §13): one action per step, a copy block for what is pasted, «You should see:» and «If you see
something else:». Your closing message says what you did yourself, and its next step is either a step you will take or those
🙋 steps. If a permission is denied or a credential is missing, stop and ask; never look for another way.
