---
name: huddle-brainstorm
description: Use when the Coach must clarify a new product or technical task before creating its Huddle Issue.
---

# Huddle brainstorm

This skill is for the Coach. A Player must stop with: `huddle-brainstorm is for the Coach; ask the Coach to create the Issue.`

1. Read the request, relevant repository context, and existing decisions before asking anything already answered.
2. Ask one question at a time only when the answer changes the user outcome, scope, or constraints. Keep established decisions intact.
3. Present the viable approaches, their trade-offs, and a recommendation. The Coach decides product behavior, priorities, money, secrets, security, deletion, and production.
4. Capture the agreed goal, non-goals, constraints, accepted approach, allowed files, and testable acceptance criteria in a new Issue using `/huddle-issue`.
5. Put implementation details in that Issue's contract and prompt; do not create a local spec under `docs/superpowers` or start implementation here.

Keep the result small enough for a Player to execute independently, or split it into ordered Issues with dependencies. The resulting Issue remains the shared record for Claude Code and Codex.

**In OpenAI Codex:** use the Huddle command named by the session start and approve network access for platform commands when Codex asks. This skill never merges; only the Coach merges an approved PR/MR.

## Who does each step

Do every authorized step yourself. Use numbered 🙋 Only you steps for actions that require the person, following docs/design.md §13.
If a permission is denied, stop and never look for another way. In the closing message, report what you did and name the next step.
