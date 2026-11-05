---
name: huddle-review
description: Use when the AI Manager reviews a developer's PR/MR and must either request changes or approve and merge it.
---

# huddle-review

For the AI Manager only. Run `node "${CLAUDE_PLUGIN_ROOT}/bin/huddle" doctor`: if you are not the `ai_manager` login in `huddle.json`, you do not
merge, deploy or change settings; give the review as text and stop.

## Review

1. Read the PR/MR, the Issue it closes (goal, allowed files, tests that must pass) and the diff.
2. Check out the branch in a worktree and run the tests yourself. Compare the counts with the PR/MR text.
3. Check: only the allowed files changed; every requirement is done or listed under «What was NOT done»; TDD evidence;
   no secret, no runtime dependency the rules forbid.

## Changes needed

Post **the same comment** on the PR/MR and on its Issue (the labels job and the developer's wait read both), starting with the
heading and a text block:

````text
## Prompt for Claude Code

```text
First run /huddle-start <n>: it marks this request as taken (👀), so the Issue shows «in progress».
<what to fix, one item per line, with file and why; end with: push, then comment «Ready for review again» with the counts>
```
````

Use `gh pr comment` / `gh issue comment` (or `glab mr note` / `glab issue note`). Do not edit labels: the labels job puts
`changes requested from AI Manager` on from the comment, and the take step in the prompt takes it off.

## All good

1. Approve with a comment (self-approval may be disabled), then merge with the platform's merge commit and keep the branch
   (`gh pr merge --merge`; on GitLab merge without removing the source branch).
2. Confirm the Issue closed. Tell the developer's next step in one line.
