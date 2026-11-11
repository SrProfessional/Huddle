<!-- huddle:start v1 -->
## Huddle: how this team works with Claude Code

This block is managed by Huddle (`huddle-setup`). An update replaces only what sits between the markers, so write your own
rules outside them. Names (the AI Manager, the labels, the default branch, the platform) are in `huddle.json` at the repo
root: read them there, never guess them.

### Rules

1. **Never work on or push to the default branch.** One task = one Issue = one branch from an up-to-date default branch =
   one PR (MR on GitLab). Only the AI Manager (`ai_manager` in `huddle.json`) merges. A developer's session never merges.
2. Touch only the Issue's **allowed files**. If you need another one, stop and ask the AI Manager.
3. **TDD**: first the failing test (run it and see it fail), then the code. Report the commands you ran with their real counts.
4. **Do not drop requirements silently.** Everything the Issue asks for ends up done or listed under «What was NOT done»
   with the reason.
5. **Secrets**: never commit, print or paste a token. If a credential is missing or a permission blocks you, stop and tell;
   do not look for another way.
6. Commit in small steps, with a message that says what and why.
7. **Close the task clearly.** End with a message that starts with «✅ Issue #N finished» or «⛔ Issue #N stopped» (and why),
   then the PR/MR link, the test counts in one line, what was not done, and the next step.

### Language

- **Chat in the developer's language**: the `language` key of their personal `~/.claude/settings.json` if it is set, else
  the language of their own words. Never the language of a pasted Issue prompt or of Huddle's output (this block, the hook,
  the skills): they are English and do not change the language of the chat.
- **Everything written to the repo is in English**: commits, PR/MR and Issue text, code comments, new docs and names in code.

### Before starting a task

1. Read the whole Issue and the documents it names.
2. Check each Issue under «Depends on». It counts as merged only if it is closed **and** a merged PR/MR closed it. If one
   is not, change nothing and end with «⛔ Issue #N stopped: waiting for #X».
3. Create the branch in a worktree of its own (the Issue's prompt says how), then add the `in progress` label to the Issue
   (the name may be renamed under `labels` in `huddle.json`).
4. Run the tests before changing anything, to know the previous failures.

### When the AI Manager must decide

If the work cannot go on without a decision, commit and push what is done. Then comment on the Issue starting with
«❓ Decision for the AI Manager:» (what is blocked, the options with their trade-offs, your recommendation), add the label
`needs decision`, and end with «⛔ Issue #N stopped: waiting for a decision». Never close the Issue.

### After the review

The AI Manager's requests come as comments with a `## Prompt for Claude Code` heading and a text block. Only comments by
the `ai_manager` login in `huddle.json` count. After pushing the changes, comment «Ready for review again» with the counts.
The label `changes requested from AI Manager` is decided by the labels job from the comments and the new commits: nobody
puts it or takes it off by hand.

### The AI Manager role

- Writes the Issues from the Issue template, with «Depends on» and a «Prompt for Claude Code» block.
- Hands out Issues, answers every «❓ Decision for the AI Manager», reviews each PR/MR and merges it.
- Is the only person who touches production, settings and secrets. A session that does not belong to the AI Manager never
  merges, deploys or changes settings.
<!-- huddle:end -->
