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

1. Approve with a comment (self-approval may be disabled). Your approval in this session is the AI Manager's approval, so
   merge it yourself with the platform's merge commit and keep the branch (`gh pr merge --merge`; on GitLab merge without
   removing the source branch). Do not hand the merge command to the person: never hand over a step you can do.
2. Confirm the Issue closed (a merged PR/MR; `CLOSED` with `COMPLETED` on GitHub).
3. **A release PR** (versions and `CHANGELOG.md` at a new version): after the merge, check that every cell of the smoke test is ✔
   in the PR text. Then, on an up-to-date default branch, tag and publish it yourself: `git tag -a vX.Y.Z -m "Huddle vX.Y.Z"`,
   `git push origin vX.Y.Z`, and `gh release create vX.Y.Z --notes-file <the version's section of CHANGELOG.md>` (GitLab:
   `glab release create vX.Y.Z`). If a cell is not ✔, do not tag: say which one.
4. Ask the AI Manager only for what needs them, as «🙋 Only you» steps: for example a second account, a token, or a
   permission the platform denied. If a merge or a push is refused (branch protection, a missing permission), stop and
   ask; never look for another way.
5. Tell the developer's next step in one line.

## Who does each step

Before you hand a step to the person, check whether you can do it yourself with the tools and logins you have (`gh`, `glab`,
and the repo's own tools). If you can, do it and report what you did. Only a step that needs something you cannot have goes to them: a second
person's account, a payment, a secret, a phone or another device, a legal or business decision, a paid action they must
approve, or a permission that was denied. Write that step as numbered «🙋 Only you» steps for someone with no technical
background (docs/design.md §13): one action per step, a copy block for what is pasted, «You should see:» and «If you see
something else:». Your closing message says what you did yourself, and its next step is either a step you will take or those
🙋 steps. If a permission is denied or a credential is missing, stop and ask; never look for another way.
