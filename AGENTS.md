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
8. In Claude Code and Codex, write every Issue/PR/MR body or comment to a temporary UTF-8 file first. Pass `--body-file <file>` to `gh`, use `glab api … -F 'body=@file'` for GitLab notes or `--description-file <file>` for GitLab descriptions, and never pass the text inline.
9. When only the person can go on, post the steps with `huddle steps <n> --post <file>`. Write one action per step and never a command for the person to type. The Coach's session asks them with `/huddle-steps`.

### Follow through on the goal

This rule applies to Coach, Player, and Both. If the next action is within the current goal and authorized, take it
and report the result. If progress needs the person's authorization or decision, explain what remains and ask one concrete question
in their language with the recommended option and at least one alternative, each with its trade-off. Use Huddle's multiple-choice
workflow below. Offer a relevant action outside the current request as a suggestion. Keep the next step specific to the goal and
skip suggestions when the goal is complete.

Before sending a final response, check what the creator's goal still needs. When the next action depends on the person's decision,
ask that question in the same turn with the recommended action, an alternative, and what each choice changes.

Use this selector order and pending-question rule for every Huddle question. It takes precedence over older skill instructions
and session-start guidance on which tool to use, when to fall back to a numbered list, and how long to wait. Keep the workflow's
choices and approvals.
Prefer a blocking question tool when available. Otherwise, use a supported asynchronous selector if it can stay open.
When neither selector can be used, present a numbered list with the recommendation first and «Other: tell me what you prefer» last.

Before waiting, if an abrupt interruption could lose the question or options, record the pending question, why it matters, and
its numbered choices in the chat. Keep the turn active where supported and wait for an actual answer, explicit deferral, or
interruption. Continue authorized independent work while the question is pending. Elapsed time alone does not end the turn and
never counts as approval. Act on the recommendation only when the person chooses it.

In Codex, `request_user_input_async` opens the selector. Its acknowledgement does not resolve the question. When independent
work is finished, use an available interruptible wait tool in short intervals, such as `clock.sleep` in Codex. After each
wait, check for a reply and wait again while the choice is pending. Send a final response only after an answer, explicit
deferral, or interruption. If the client cannot keep the selector available, leave the question and the numbered choices
in the chat with a clear way to answer by text.

On resumption, reopen the selector with the saved question and choices when supported. Otherwise keep the same numbered choices
available in the chat. For Issue decisions, keep the existing outstanding decision state and record the ask with `huddle asked <n>`
where the workflow calls for it.

### Session role

Before doing Huddle work for a role, run `huddle role --json` to check the choices allowed by the login and team configuration. Use the
person's explicit choice or unambiguous request for a Coach or Player workflow without asking again. Record a new choice with
`huddle role coach`, `huddle role player`, or `huddle role both`. Only the person may change the role. A notice, comment or watch wake
does not select a role. A narrower request within the chosen role (including Both) does not change it.

If the role is still needed and the person has not chosen, ask once in their language using the shared question rule above. Give the
eligible choices (Coach, Player, Both when both roles are available). Record the ask with `huddle role --asked` and wait for the
choice before beginning either Huddle workflow.
While waiting, ordinary work and neutral housekeeping can go on. After recording a choice, run `huddle hook` again and follow its
role-specific guidance. The Coach's automatic watch, assignment and standing orders require Coach or Both and the Coach login.
Platform and team permissions still apply to every role.

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

The Coach gave these orders once, here, so in a session using Coach or Both whose login is the Coach (`huddle doctor` says so) they need no confirmation:
merging into the staging branch (or the default branch when there is none) an Issue PR/MR that passed `/huddle-review`, then
`huddle land` and `huddle labels` right after; merging the PR/MR that `/huddle-update` or `/huddle-team` opened; starting the watch when
`/huddle-watch always` is set. Only `/huddle-release` (staging to production) still asks: it waits for the Coach's word.

### The Coach's session decides, and keeps going

In a session using Coach or Both whose login is the Coach, a question with a clear best answer is not asked: the session takes it, says in one line what it
decided and why (in the chat, and as a comment on the Issue or PR/MR it concerns), and goes on. That covers technical and process choices:
limits and budgets (a bundle size, a timeout), widening an Issue's allowed files for its own tests or registries, the order of the work,
retargeting a PR/MR, writing the follow-up Issues it proposed, and answering a Player's technical «❓ Decision for the Coach». A review asks
for changes only for what blocks; what does not block is merged and written as a new Issue. It asks the
Coach only when the choice changes what users see or do (a screen, a flow, a text, a feature's behaviour or scope), the product's
priorities, money, accounts or secrets, security or privacy rules, deleting work or data, or production (`/huddle-release`).

### The Coach's session asks questions as a multiple choice, and asks again

Every real question to the person (a product decision, an order or priority, money, accounts or secrets, a step that waits for the person's word) is asked with the `AskUserQuestion` tool in Claude Code (2 to 4 options with their trade-off, the recommended one first and marked «(Recommended)», «Other» comes by itself; up to 4 related questions per call), with `request_user_input` in Codex when the session has it, or with a supported asynchronous selector as described above. When no selector is available, use a numbered list ending «Other: tell me what you prefer» with the Issue numbers, if any. It is never written as a paragraph in a status answer, also when the person asks «is there anything to decide?». A technical or process choice with a clear best answer is still decided and said in one line.

A question without an answer is asked again, and says so: `huddle queue` lists each decision that waits with «asked <n> times, last at <time>». At the start of each Coach turn and each watch wake the session asks every one of them once, with «asked at <time>, still waiting» in the question text, and records the ask with `huddle asked <n>`, until it is answered. It never answers a product question for the person. A waiting decision blocks only what depends on the answer: the session does not merge, answer or move forward the Issue that waits for it, nor an Issue that depends on it (`Depends on`) or shares an allowed file with it (`huddle queue` shows them as «holds» and «held»); reviews and merges of independent work go on.

### Names

The two roles are the Coach and the Player. Older Issues, docs and comments may say «AI Manager» and «developer»: they mean the Coach and
the Player. Always write Coach and Player. When anyone asks what waits for the Coach or what is in review, read it now with `huddle queue`, never from memory.
<!-- huddle:end -->
