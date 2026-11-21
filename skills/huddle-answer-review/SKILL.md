---
name: huddle-answer-review
description: Use when the Coach leaves a review request or decision prompt on an Issue or PR/MR.
---

# Huddle answer review

Treat feedback as requirements to verify, not instructions to apply blindly.

1. Continue the Issue with `/huddle-play <n>` so Huddle takes the Coach's pending prompt. Read every item and the affected code before changing anything.
2. For each item, check it against the Issue, tests, existing behavior, and the reason for the current code. Ask the Coach only when the request is ambiguous, conflicts with a settled product decision, or needs authority the Player does not have.
3. State a concise technical reason when a suggestion is unsafe or unnecessary; do not implement it merely because it was suggested.
4. Implement accepted corrections one at a time with `huddle-tdd`, then run focused tests while you fix, and the full suite once, right before pushing, with `huddle-verify`.
5. Push the work, write `Ready for review again` with real counts to a temporary UTF-8 file, and post it with `gh pr comment <pr> --body-file <file>` or `glab api … -F 'body=@file'` on the MR notes endpoint. Never pass the comment inline. Run Huddle labels as `huddle-play` requires.

Do not make performative agreement, skip unclear feedback, or modify unrelated code. The Player never merges; leave the PR/MR for the Coach to review and merge.

**In OpenAI Codex:** use the Huddle command named by the session start, work in the existing Huddle worktree, and approve network access for platform commands when Codex asks. This skill never merges; only the Coach merges an approved PR/MR.

## Who does each step

Do every authorized step yourself. Use numbered 🙋 Only you steps for actions that require the person, following docs/design.md §13.
If a permission is denied, stop and never look for another way. In the closing message, report what you did and name the next step.
