---
name: huddle-bug
description: Use when the AI Manager wants to turn a bug description, a capture, a link or a raw report labeled «needs triage» into a ready Bug Issue.
---

# huddle-bug

For the AI Manager (the `ai_manager` login in `huddle.json`). Check with `node "${CLAUDE_PLUGIN_ROOT}/bin/huddle" doctor` that you are that
login; if not, stop and say so.

## Two ways in

- `/huddle-bug` followed by a plain description, a capture or a link: «approving a carousel in the inbox shows an error».
- `/huddle-bug #N` on a raw report that has the label `needs triage` (a form on GitHub, the Bug template on GitLab).

## Do

1. **Investigate without changing anything.** Read the code the description points to. Search for the error text. Read the
   recent commits of that area (`git log -S "<text>"`, `git log -- <path>`). Run the area's tests. If the repo's own tools
   can reproduce it locally, reproduce it. Never touch production or secrets, and never change code.
2. **Duplicates.** Before writing, search the open and the recently closed Issues for the same error text or symptom
   (`gh issue list --state all --search "<text>"`, or `glab issue list --search "<text>" --all`). If one matches, offer to
   add the new evidence to it as a comment instead of creating another Issue.
3. **Write the Bug Issue** from the repo's Bug template (`.github/ISSUE_TEMPLATE/bug.md` or `.gitlab/issue_templates/Bug.md`).
   Fill the bug block with what you found and mark what is confirmed and what is a guess: What happens (exact error text),
   What should happen, How to reproduce (with the environment), Evidence, Severity, Probable cause (files and lines, or
   «unknown yet») and The failing test to write first (what it checks and where it goes). Then the Task sections, as in
   `/huddle-issue`, with these rules:
   - **Prompt for Claude Code:** it says to write the failing test first and see it fail, then fix it.
   - **Allowed files:** the smallest set that can fix it.
   - **Tests that must pass:** the area's suite plus the new test.
   - **Depends on:** one `- #N` per line, or `- None`. The labels job reads it.
4. **Severity** is `blocking` (stops a person or production), `normal` or `minor`. Write it under «## Severity»: the labels job
   reads that word and assigns a `blocking` Bug before every other ready Issue. For a `blocking` Bug, also make «🚨 Blocking
   bug» the first line of the Issue's first comment.
5. **Show the draft and wait for the AI Manager's OK.** Then create it with `gh issue create --label bug` (or
   `glab issue create --label bug`) using the repo from `huddle.json`. For `#N`, rewrite that report's body into the full Bug
   Issue instead: keep the reporter's original text under «Original report», and remove `needs triage`. Do not add status
   labels or an assignee by hand. Right after creating the Issue, or after rewriting the report and taking `needs triage` off, run the **full**
   `node "${CLAUDE_PLUGIN_ROOT}/bin/huddle" labels` once: it puts `ready` or `blocked` on the Issue and assigns it (a run scoped with `--issue` never
   assigns an open Issue). It is best effort: on a failure, say one line with the reason and go on. Answer with the Issue link.
6. A missing capture or detail is a question you write as a comment to the reporter; do not stop for it.

## Who does each step

Before you hand a step to the person, check whether you can do it yourself with the tools and logins you have (`gh`, `glab`,
and the repo's own tools). If you can, do it and report what you did. Only a step that needs something you cannot have goes to them: a second
person's account, a payment, a secret, a phone or another device, a legal or business decision, a paid action they must
approve, or a permission that was denied. Write that step as numbered «🙋 Only you» steps for someone with no technical
background (docs/design.md §13): one action per step, a copy block for what is pasted, «You should see:» and «If you see
something else:». Your closing message says what you did yourself, and its next step is either a step you will take or those
🙋 steps. If a permission is denied or a credential is missing, stop and ask; never look for another way.
