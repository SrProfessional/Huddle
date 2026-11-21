---
name: huddle-tdd
description: Use when implementing a feature, bug fix, refactor, or behavior change, before writing implementation code.
---

# Huddle test-driven development

Write one failing test before each behavior change. Watch it fail for the expected missing behavior, write the smallest change that passes it, then keep the suite green.

1. Read the Issue, its allowed files, and its required test command. Do not broaden the work without the Coach.
2. **Red:** add one test for one observable behavior. Run that test and confirm it fails because the behavior is absent, not because of a typo or broken setup.
3. **Green:** write only the code needed for that test. Run the focused test again.
4. **Refactor:** only after green, simplify duplication or names; rerun the test after each refactor.
5. Run the full required suite before reporting completion. Record its real command and counts.

Never write production code first, keep it as a reference, or turn a test that passed immediately into evidence. A passing test before the change tests existing behavior; correct the test or find the already-present behavior.

For a defect, first reproduce it in a failing test. If the cause is unclear, use `huddle-debug` before changing code. Before any completion claim, use `huddle-verify`.

**In OpenAI Codex:** use the Huddle command named by the session start, make the Issue worktree with `git worktree add`, and approve network access for platform commands when Codex asks. This skill never merges; only the Coach merges an approved PR/MR.
