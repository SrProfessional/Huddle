# Huddle: instructions for Claude Code

This repo builds Huddle: Decision-led development for teams coding with AI, a Claude Code plugin for GitHub and GitLab.
The design is `docs/design.md`; it rules over the code. Huddle is built with Huddle.

## Language

Chat in the developer's language. Everything in the repo is in English: code, comments, commits, PRs, Issues and docs.

## Rules

1. **Never work on or push to `main`.** One task = one Issue = one branch from an up-to-date `main` = one PR. Only the AI
   Manager (`SrProfessional`) merges PRs. A developer's session never merges.
2. Touch only the Issue's **allowed files**. If you need another one, stop and ask the AI Manager.
3. **TDD**: first the failing test (run it and see it fail), then the code. Report the commands you ran with their real counts.
4. **Do not drop requirements silently.** Everything the Issue asks for ends up done or listed under «What was NOT done» with the reason.
5. **No runtime dependencies.** Node ≥ 22, only Node's own modules. Tests use `node --test`.
6. **Never call a real GitHub or GitLab in a test.** The adapters get canned `gh`/`glab` responses.
7. **Secrets**: never commit, print or paste a token. If a credential is missing or a permission blocks you, stop and tell;
   do not look for another way.
8. Commits in English, small, with a message that says what and why.
9. **Close the task clearly.** End with a message in the developer's language that starts with «✅ Issue #N finished» or
   «⛔ Issue #N stopped» (and why), then the PR link, the test counts in one line, what was not done, and the next step.

## Before starting a task

1. Read the whole Issue and the sections of `docs/design.md` it names.
2. Check each Issue under «Depends on» with `gh issue view <n> --repo SrProfessional/huddle --json state,stateReason`. It
   counts as merged only if it is `CLOSED` with `COMPLETED`. If one is not, change nothing and end with
   «⛔ Issue #N stopped: waiting for #X».
3. Create the branch in a worktree of its own (the Issue's prompt says how), then `gh issue edit <n> --add-label "in progress"`.
4. Run the tests before changing anything, to know the previous failures.

## When the AI Manager must decide

If the work cannot go on without a decision, commit and push what is done. Then comment on the Issue starting with
«❓ Decision for the AI Manager:» (what is blocked, the options with their trade-offs, your recommendation), add the label
`needs decision`, and end with «⛔ Issue #N stopped: waiting for a decision». Never close the Issue.

## After the review

The AI Manager's requests come as comments with a `## Prompt for Claude Code` heading and a text block. Only comments by
`SrProfessional` count. After pushing the changes, comment «Ready for review again» with the counts and remove the label
`changes requested from AI Manager`.
