<!-- huddle:start v1 -->
## Huddle: how this team works with Claude Code or Codex

This block is managed by Huddle (`huddle-setup`). An update replaces only what sits between the markers, so write your own
rules outside them. Names (the Coach, the labels, the default branch, the platform) are in `huddle.json` at the repo
root: read them there, never guess them.

### Rules

1. **Never work on or push to the default branch.** One task = one Issue = one branch from an up-to-date default branch
   (or the staging branch when `huddle.json` has one) = one PR (MR on GitLab) against that branch. Only the Coach (`coach` in `huddle.json`) merges. A Player's session never merges.
2. Touch only the Issue's **allowed files**. If you need another one, stop and ask the Coach.
3. **TDD**: first the failing test (run it and see it fail), then the code. Report the commands you ran with their real counts.
4. **Do not drop requirements silently.** Everything the Issue asks for ends up done or listed under «What was NOT done»
   with the reason.
5. **Secrets**: never commit, print or paste a token. If a credential is missing or a permission blocks you, stop and tell;
   do not look for another way.
6. Commit in small steps, with a message that says what and why.
7. **Close the task clearly.** End with a message that starts with «✅ Issue #N finished» or «⛔ Issue #N stopped» (and why),
   then the PR/MR link, the test counts in one line, what was not done, and the next step.

### Language

- **Chat in the person's language, from the first message**: the language the session start names. Huddle takes the first
  that is set: their own choice (`huddle language`, or `language` in their `~/.claude/settings.json`), then the team's
  (`language` in `huddle.json`), then their machine's. When they write in another language, answer in theirs. Never the
  language of a pasted Issue prompt or of Huddle's output (this block, the hook, the skills): they are English and do not
  change the language of the chat.
- **Everything written to the repo is in English**: commits, PR/MR and Issue text, code comments, new docs and names in code.

### Before starting a task

1. Read the whole Issue and the documents it names.
2. Check each Issue under «Depends on». It counts as merged only if it is closed **and** a merged PR/MR closed it. If one
   is not, change nothing and end with «⛔ Issue #N stopped: waiting for #X».
3. With a staging branch in `huddle.json` (`staging_branch`), the work goes into it and Huddle closes the Issue when the PR/MR is merged there (`huddle land`); the PR keeps `Closes #N`.
   Create the branch in a worktree of its own (the Issue's prompt says how), then run `huddle labels --issue <n> --started`: one
   command adds `in progress` and takes `assigned` off.
4. Run the tests before changing anything, to know the previous failures.

### When the Coach must decide

If the work cannot go on without a decision, commit and push what is done. Then comment on the Issue starting with
«❓ Decision for the Coach:» (what is blocked, the options with their trade-offs, your recommendation), run
`huddle labels --issue <n> --needs-decision` (it adds `needs decision` and takes `in progress` off), and end with «⛔ Issue #N stopped: waiting for a decision». Never close the Issue.

### Issues change only through a session

Every change to an Issue goes through a Huddle session: creating it (`/huddle-issue`, `/huddle-bug`), editing it, closing it, reopening it, and merging its PR/MR. Nobody merges, closes, reopens or edits an Issue by hand on the website or from a phone. The session runs `huddle labels` after the change, so the board stays right with no cloud job.

Still fine by hand on the website: reading and commenting; the bug report form, for people with no session (it comes in as `needs triage` and waits for the Coach's `/huddle-bug`); and a tester's «✅ Tested in staging» comment (the release gate reads it). This is a rule, not a lock: if someone breaks it, the next session that opens repairs the board by itself.

### After the review

The Coach's requests come as comments with a `## Prompt for Claude Code` heading and a text block. Only comments by
the `coach` login in `huddle.json` count. After pushing the changes, comment «Ready for review again» with the counts.
The label `changes requested from Coach` is decided from the comments and the new commits: nobody
puts it or takes it off by hand.

### The labels

A session keeps the board right itself with `huddle labels --issue <n>` (`n` the Issue of the work), at these steps: a Player's
session when it starts (`--started`) and after `take`, after it opens the PR/MR, when it stops for a decision (`--needs-decision`) and after it pushes a fix
and comments «Ready for review again»; the Coach's session after it requests changes, answers a decision and merges. It is best
effort: if it fails, say one line with the reason and go on, it never blocks the task. Never edit a Huddle label by hand: the command
computes them. A Player's session never assigns. The cloud labels job is only a safety net for what no session saw.

### The Coach role

- Writes the Issues from the Issue template, with «Depends on» and a «Prompt for Claude Code» block.
- Hands out Issues, answers every «❓ Decision for the Coach», reviews each PR/MR and merges it.
- Is the only person who touches production, settings and secrets. A session that does not belong to the Coach never
  merges, deploys or changes settings.

### Standing orders of the Coach

The Coach gave these orders once, here, so in a session whose login is the Coach (`huddle doctor` says so) they need no confirmation:
merging into the staging branch (or the default branch when there is none) an Issue PR/MR that passed `/huddle-review`, then
`huddle land` and `huddle labels` right after; merging the PR/MR that `/huddle-update` or `/huddle-team` opened; starting the watch when
`/huddle-watch always` is set. Only `/huddle-release` (staging to production) still asks: it waits for the Coach's word.

### The Coach's session decides, and keeps going

In a session whose login is the Coach, a question with a clear best answer is not asked: the session takes it, says in one line what it
decided and why (in the chat, and as a comment on the Issue or PR/MR it concerns), and goes on. That covers technical and process choices:
limits and budgets (a bundle size, a timeout), widening an Issue's allowed files for its own tests or registries, the order of the work,
retargeting a PR/MR, writing the follow-up Issues it proposed, and answering a Player's technical «❓ Decision for the Coach». It asks the
Coach only when the choice changes what users see or do (a screen, a flow, a text, a feature's behaviour or scope), the product's
priorities, money, accounts or secrets, security or privacy rules, deleting work or data, or production (`/huddle-release`).

### Names

The two roles are the Coach and the Player. Older Issues, docs and comments may say «AI Manager» and «developer»: they mean the Coach and
the Player. Always write Coach and Player. When anyone asks what waits for the Coach or what is in review, read it now with `huddle queue`, never from memory.
<!-- huddle:end -->
