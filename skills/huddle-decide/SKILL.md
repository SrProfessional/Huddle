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
