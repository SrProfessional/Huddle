---
name: huddle-debug
description: Use when a test fails, a bug appears, or behavior is unexpected, before proposing a fix.
---

# Huddle systematic debugging

Find the root cause before fixing a symptom.

1. **Investigate:** read the whole error, reproduce it, inspect recent changes, and trace bad data or state back to its source. In a multi-step system, collect evidence at each boundary first.
2. **Compare:** find a working analogue in this repository or read the governing reference completely. List the material differences and dependencies.
3. **Hypothesize:** state one specific cause and test it with the smallest possible experiment. Change one variable at a time.
4. **Fix:** create the minimal failing regression test with `huddle-tdd`, implement one source-level fix, and run the relevant tests plus the required suite.

Do not stack guesses, hide warnings, or call a symptom patch a fix. If an experiment disproves a hypothesis, return to investigation with its new evidence. After three failed fix attempts, stop and raise an architectural question for the Coach rather than attempting a fourth.

If the Issue cannot continue without a product, security, or architecture decision, follow Huddle's decision flow: preserve the work, explain options and a recommendation to the Coach, and do not invent the answer. Use `huddle-verify` before saying the problem is solved.

**In OpenAI Codex:** use the Huddle command named by the session start and approve network access for platform commands when Codex asks. This skill never merges; only the Coach merges an approved PR/MR.
