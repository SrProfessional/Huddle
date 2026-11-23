---
name: huddle-play
description: Use when a Player works on an Issue: it starts an Issue that has no branch yet, and picks one up again after the Coach answered it (a review asked for changes, or a decision was given). Run it as `/huddle-play <n>`, or `/huddle-play` alone to work on several assigned Issues at once.
---

# huddle-play

One task = one Issue = one branch = one PR/MR. `/huddle-play <n>` is the only command a Player types to work on Issue `n`: the session
sees by itself whether the Issue is new or already started. You are a Player session: **never merge**, never touch the default
branch, production or secrets. The rules are in the Huddle block of `CLAUDE.md`; names are in `huddle.json`. Use `huddle-tdd` for each implementation change, `huddle-debug` for a failure or unexpected result, `huddle-verify` before a completion claim, and `huddle-answer-review` when the Coach leaves a prompt. In Claude Code and Codex, write every Issue/PR/MR body or comment to a temporary UTF-8 file first. Pass `--body-file <file>` to `gh`, use `glab api … -F 'body=@file'` for GitLab notes or `--description-file <file>` for GitLab descriptions, and never pass the text inline.
**In OpenAI Codex (the session start said «Huddle (OpenAI Codex)»)** (Issue #201): run the `huddle` command it named wherever this skill writes `node "${CLAUDE_PLUGIN_ROOT}/bin/huddle"` (other files of this skill sit next to it, under `skills/`); make the worktree with `git worktree add` and run every command in that folder, instead of `EnterWorktree`; a Design Issue ends at once with «⛔ Issue #N stopped: this Issue is done in Claude Code (it needs Claude Design)»; on the Coach's login it reviews and merges as in Claude Code, unless another session holds the watch (it then reviews). In Codex the background wait of `$huddle-play <n>` (one Issue) is `node "${CLAUDE_PLUGIN_ROOT}/bin/huddle" wait <n> --codex`; `$huddle-play` with no number uses the Player's watch instead (`next --wait --codex`, see parallel.md), never one wait per Issue. The per-Issue wait returns at once, waits with no tokens, and when the Coach answers it sends this session a message to run `$huddle-play <n>` (the session start also says when a request waits). Run every command that reaches GitHub or GitLab (`git fetch`, `git push`, `gh`, `glab`, `huddle`) with network access (approve it when Codex asks): the Codex sandbox has none.

`labels --issue <n>` (docs/design.md §22; `n` is this Issue) keeps the board right at the moments named below. It is best effort: if it fails, say one line with the reason and go on; it never stops or blocks the task and never asks the person anything (the cloud job, or the next session, catches up). A Player's session never assigns and never edits a Huddle label by hand.

## Version notice (first, always)

Before anything else, run `node "${CLAUDE_PLUGIN_ROOT}/bin/huddle" notice`. It is read-only and needs no login. When it prints text, say that
text to the person, in their language, as the first thing in your answer, and then go on with the task: the notice never stops the work
and never asks anything. When it prints nothing, say nothing about versions (it shows at most once a day, so silence is normal).

## Which one is it?

With no number (`/huddle-play`): read and follow `${CLAUDE_PLUGIN_ROOT}/skills/huddle-play/parallel.md` (several Issues at once, by capacity). With a number, read the Issue and find its branch (the «Branch» section):
- **Neither a local branch nor `origin/<branch>` exists:** the Issue was never started. Follow «Start an Issue» (or «A Design Issue»).
- **The branch exists:** the Issue was started. Follow «Continue an Issue». Do not start it over.

## Start an Issue

1. Read the whole Issue and the documents it names. Follow its «Prompt for Claude Code» block.
2. Check each Issue under «Depends on»: it counts only if it is closed **and** a merged PR/MR closed it. If one is not, change
   nothing and end with «⛔ Issue #N stopped: waiting for #X», after the steps of «A stop for a dependency» below.
3. Create the branch in a worktree of its own, as the Issue says, then run `node "${CLAUDE_PLUGIN_ROOT}/bin/huddle" labels --issue <n> --started`: one command adds `in progress` and takes `assigned` off (never add it by hand). With `staging_branch` set in `huddle.json`, the branch starts from the up-to-date staging branch (`origin/<staging_branch>`), not from the default branch; without it, from the up-to-date default branch.
4. Run the tests before changing anything. Then work with TDD, touching only the allowed files; while you work, run the tests of the area you touched, not the whole suite (Issue #244).
5. Bring in the base branch first (Issue #195): before opening the PR/MR and before commenting «Ready for review again», run `git fetch origin` and `git merge origin/<base>` (the staging branch, or the default branch when there is none), resolve the conflicts, then run the full suite once, right before pushing: the counts you report are that last full run's, after the merge. Open the PR/MR with `Closes #N`, using the template (with `staging_branch` set, open it **against** the staging branch; Huddle closes the Issue when it is merged there): what changed, the real test counts, **What was NOT done**. Right after it is opened, run `node "${CLAUDE_PLUGIN_ROOT}/bin/huddle" labels --issue <n>`.
6. End with «✅ Issue #N finished» (or «⛔ Issue #N stopped»), the link, the counts, what was not done, the next step. The next step is
   one the session takes, or numbered «🙋 Only you» steps when only the person can do it (see «Who does each step»).
7. Start the wait in the background: `node "${CLAUDE_PLUGIN_ROOT}/bin/huddle" wait <n>`. When it ends, a review request is
   pending: the Player runs `/huddle-play <n>` again. If `node "${CLAUDE_PLUGIN_ROOT}/bin/huddle" doctor` says you are the Coach (a team of one), do not wait and do not stop: run `/huddle-review` on that PR/MR right away, in a fresh worktree (the tests run again), and on all good merge it, `huddle land` and the labels, as its standing order says. A Player who is not the Coach never merges.

## A Design Issue (the Issue has the `design` label, or the Design template's «Screens» and «Visual guide» sections)

The person is usually a designer. A Design Issue never changes code: there is no code, so there are no tests to run or to report, and
the only allowed files are `design/<issue number>-<slug>/`. Steps 1 to 3 of «Start an Issue» are the same (check «Depends on», the
branch in its own worktree, `labels --issue <n> --started`). Then:

1. **Create the design with Claude Design in this session**, as a design artifact (`Artifact` tool, quickstart with the `design` intent). Use the
   project's design system when one is set up; otherwise follow the Issue's «Visual guide». Design every screen listed under «Screens»,
   for the person in «For whom», with the real texts of «Content» (never lorem ipsum). Give the designer the artifact link to watch it.
2. **Tell the designer, in plain words, before the first change:** «Ask me for every change here in the chat. Never change anything by hand on the canvas.»
3. **Polish only through the chat.** The designer asks for changes in words; you apply them and republish the same artifact (same file path,
   so the link stays). Keep a short list of the decisions taken in the chat, and count the rounds. If you notice a change you did not make
   (a new version saved from the page, which a publish refusal or a notice on the watched artifact tells you), say so, and ask whether to keep that change or
   go back to your own last version. Never merge a change you did not make without that answer.
4. **The designer says it is ready** («listo», «ready» or similar). Ask for a one-line confirmation («Do I save it and open the PR?»). On a yes, finish the
   Issue yourself, with no further step from the designer:
   - Save in `design/<issue number>-<slug>/`:
     - `README.md`: the artifact link, the screens, the decisions taken in the chat (a short list) and the round number;
     - `design.html`: the final page exported as standalone HTML (read it with the `Artifact` tool and write it as one file);
     - `screens/`: PNG screenshots of each screen, desktop and phone (for example `home-desktop.png` and `home-phone.png`).
   - Commit, push, and open the PR/MR with `Resolves #N`, using the template. The PR text has the screenshots inline, the artifact link and
     the decisions, and «What was NOT done». If a screenshot cannot be taken, say so there; never leave it out silently. Then run `labels --issue <n>` as in «Start an Issue».
   - Close with the usual message: «✅ Issue #N finished», the link, what was not done (there are no test counts, say «no code, no tests»), the next step. Start the wait in the background as in «Start an Issue».
5. **Changes requested.** The designer runs `/huddle-play <n>` again in this same session and the Issue is continued (see «Continue an Issue»).
   Each new round is a new commit, and `README.md` gets that round's decisions and its number. The repo keeps the history, since Claude Design
   has no version history. Republish the same artifact, save `design.html` and the `screens/` again, push, then comment «Ready for review again»
   (no test counts).

## Continue an Issue

1. Enter the Issue's worktree, `.claude/worktrees/<branch>`, with your `EnterWorktree` tool. If the folder is gone but the branch
   exists, create it again with `git worktree add .claude/worktrees/<branch> <branch>` (without `-b`) and enter it.
2. Run `node "${CLAUDE_PLUGIN_ROOT}/bin/huddle" pending <n>` again, even if the session start already said a request waits (that line may be minutes old). If nothing is pending, run `node "${CLAUDE_PLUGIN_ROOT}/bin/huddle" take <n>`: when it says the Issue was interrupted (its session is gone), continue it in this worktree (run the tests, finish what the Issue asks, open the PR/MR). Otherwise say in one line that another session took it, go on with the person's own request, change nothing, and offer to wait with
   `node "${CLAUDE_PLUGIN_ROOT}/bin/huddle" wait <n>`.
3. If a request is pending, tell the Player which one it is (one line), then run
   `node "${CLAUDE_PLUGIN_ROOT}/bin/huddle" take <n>`. It marks the request 👀 and prints the Coach's prompt. Follow that
   prompt as if the Player had pasted it; same rules. Only comments by the `coach` login count. The Player is not asked
   to paste anything. Right after `take`, run `node "${CLAUDE_PLUGIN_ROOT}/bin/huddle" labels --issue <n>`.
4. Fix with focused tests, bring in the base, run the full suite once right before pushing, push, then comment «Ready for review again» with that run's real test counts (a Design Issue has none: say «no code, no tests»), then run
   `node "${CLAUDE_PLUGIN_ROOT}/bin/huddle" labels --issue <n>`. Do not touch the `changes requested from Coach` label or any other by hand.
5. End with «✅ Issue #N finished» (or «⛔ Issue #N stopped»), the link, the counts, what was not done and the next step. The next step is
   one the session takes, or numbered «🙋 Only you» steps when only the person can do it (see «Who does each step»).
6. Start the wait again in the background: `node "${CLAUDE_PLUGIN_ROOT}/bin/huddle" wait <n>`. When it ends, a new request is pending:
   the Player runs `/huddle-play <n>` again.

## A stop for a dependency (Issue #298)

A stop «⛔ Issue #N stopped: waiting for #X» (at the start or while working) must leave the dependency written, so Huddle can park the Issue (docs/design.md §24). In this order: (1) read the Issue body and add `- #X` to its «Depends on» section if it is not there: change only that section, remove `- None` when a real dependency is added, write the body to a temporary UTF-8 file and use `--body-file`; (2) comment why it stopped, also with `--body-file`; (3) if the PR/MR is already open, turn it into a draft (`gh pr ready --undo`; on GitLab, the draft title) and say so in your last message; (4) run `node "${CLAUDE_PLUGIN_ROOT}/bin/huddle" labels --issue <n>`. When the dependency is merged, nothing is edited: the labels pass and `huddle next` read it as done.

## When you cannot go on

Commit and push what is done. Comment on the Issue starting with «❓ Decision for the Coach:» (what is blocked, the options with trade-offs, your recommendation), then run `node "${CLAUDE_PLUGIN_ROOT}/bin/huddle" labels --issue <n> --needs-decision` (one command adds `needs decision` and takes `in progress` off), and end with «⛔ Issue #N stopped: waiting for a
decision». Never close the Issue. Then start the wait in the background: `node "${CLAUDE_PLUGIN_ROOT}/bin/huddle" wait <n>` (tell the Player to leave the session open; it uses no Claude tokens). When it ends, the Coach answered: continue as in «Continue an Issue» (`node "${CLAUDE_PLUGIN_ROOT}/bin/huddle" take <n>`, then follow the prompt).

## Who does each step

Before you hand a step to the person, check whether you can do it yourself with the tools and logins you have (`gh`, `glab`, and the repo's own tools). If you can, do it and report what you did. Only a step that needs something you cannot have goes to them: a second person's account, a payment, a secret, a phone or another device, a legal or business decision, a paid action they must approve, or a permission that was denied. Write that step as numbered «🙋 Only you» steps for someone with no technical background (docs/design.md §13): one action per step, a copy block for what is pasted, «You should see:» and «If you see something else:». Your closing message says what you did yourself, and its next step is either a step you will take or those 🙋 steps. If a permission is denied or a credential is missing, stop and ask; never look for another way.
