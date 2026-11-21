---
name: huddle-verify
description: Use immediately before claiming work is complete, fixed, or passing, and before a commit or PR/MR.
---

# Huddle verification before completion

Evidence comes before a completion claim.

1. Identify the exact command that proves each Issue requirement, including its named test command.
2. Run those commands now, in the Issue worktree; do not reuse an old result or infer success from a diff.
3. Read the complete output and verify the exit status, pass/fail counts, and warnings.
4. Compare the result with the Issue's contract and list anything not completed under **What was NOT done**.
5. Report only the real counts from the fresh run in the commit, PR/MR, or `Ready for review again` comment.

A focused test passing does not replace the full required suite. If a command fails, investigate with `huddle-debug`; do not say it passes. Before a PR/MR, also follow `huddle-play` to fetch and merge the current base, then rerun verification.

**In OpenAI Codex:** use the Huddle command named by the session start and approve network access for platform commands when Codex asks. This skill never merges; only the Coach merges an approved PR/MR.

## Who does each step

Do every authorized step yourself. Use numbered 🙋 Only you steps for actions that require the person, following docs/design.md §13.
If a permission is denied, stop and never look for another way. In the closing message, report what you did and name the next step.
