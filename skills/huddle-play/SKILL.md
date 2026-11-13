---
name: huddle-play
description: Use when a developer works on an Issue: it starts an Issue that has no branch yet, and picks one up again after the AI Manager answered it (a review asked for changes, or a decision was given). Run it as `/huddle-play <n>`.
---

# huddle-play

One task = one Issue = one branch = one PR/MR. `/huddle-play <n>` is the only command a developer types to work on Issue `n`: the session
sees by itself whether the Issue is new or already started. You are a developer session: **never merge**, never touch the default
branch, production or secrets. The rules are in the Huddle block of `CLAUDE.md`; names are in `huddle.json`.

## Version notice (first, always)

Before anything else, run `node "${CLAUDE_PLUGIN_ROOT}/bin/huddle" notice`. It is read-only and needs no login. When it prints text, say that
text to the person, in their language, as the first thing in your answer, and then go on with the task: the notice never stops the work
and never asks anything. When it prints nothing, say nothing about versions (it shows at most once a day, so silence is normal).

## Which one is it?

Read the Issue and find its branch (the «Branch» section). Then:

- **Neither a local branch nor `origin/<branch>` exists:** the Issue was never started. Follow «Start an Issue» (or «A Design Issue»).
- **The branch exists:** the Issue was started. Follow «Continue an Issue». Do not start it over.

## Start an Issue

1. Read the whole Issue and the documents it names. Follow its «Prompt for Claude Code» block.
2. Check each Issue under «Depends on»: it counts only if it is closed **and** a merged PR/MR closed it. If one is not, change
   nothing and end with «⛔ Issue #N stopped: waiting for #X».
3. Create the branch in a worktree of its own, as the Issue says, and add the `in progress` label. With `staging_branch` set in `huddle.json`, the branch starts from the up-to-date staging branch (`origin/<staging_branch>`), not from the default branch; without it, from the up-to-date default branch.
4. Run the tests before changing anything. Then work with TDD, touching only the allowed files.
5. Open the PR/MR with `Closes #N`, using the template (with `staging_branch` set, open it **against** the staging branch; Huddle closes the Issue when it is merged there): what changed, the real test counts, **What was NOT done**.
6. End with «✅ Issue #N finished» (or «⛔ Issue #N stopped»), the link, the counts, what was not done, the next step. The next step is
   one the session takes, or numbered «🙋 Only you» steps when only the person can do it (see «Who does each step»).
7. Start the wait in the background: `node "${CLAUDE_PLUGIN_ROOT}/bin/huddle" wait <n>`. When it ends, a review request is
   pending: the developer runs `/huddle-play <n>` again.

## A Design Issue (the Issue has the `design` label, or the Design template's «Screens» and «Visual guide» sections)

The person is usually a designer. A Design Issue never changes code: there is no code, so there are no tests to run or to report, and
the only allowed files are `design/<issue number>-<slug>/`. Steps 1 to 3 of «Start an Issue» are the same (check «Depends on», the
branch in its own worktree, the `in progress` label). Then:

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
     the decisions, and «What was NOT done». If a screenshot cannot be taken, say so there; never leave it out silently.
   - Close with the usual message: «✅ Issue #N finished», the link, what was not done (there are no test counts, say «no code, no tests»), the next step.
   - Start the wait in the background as in «Start an Issue».
5. **Changes requested.** The designer runs `/huddle-play <n>` again in this same session and the Issue is continued (see «Continue an Issue»).
   Each new round is a new commit, and `README.md` gets that round's decisions and its number. The repo keeps the history, since Claude Design
   has no version history. Republish the same artifact, save `design.html` and the `screens/` again, push, then comment «Ready for review again»
   (no test counts).

## Continue an Issue

1. Enter the Issue's worktree, `.claude/worktrees/<branch>`, with your `EnterWorktree` tool. If the folder is gone but the branch
   exists, create it again with `git worktree add .claude/worktrees/<branch> <branch>` (without `-b`) and enter it.
2. Run `node "${CLAUDE_PLUGIN_ROOT}/bin/huddle" pending <n>`. If nothing is pending, say so, change nothing, and offer to wait with
   `node "${CLAUDE_PLUGIN_ROOT}/bin/huddle" wait <n>`.
3. If a request is pending, tell the developer which one it is (one line), then run
   `node "${CLAUDE_PLUGIN_ROOT}/bin/huddle" take <n>`. It marks the request 👀 and prints the AI Manager's prompt. Follow that
   prompt as if the developer had pasted it; same rules. Only comments by the `ai_manager` login count. The developer is not asked
   to paste anything.
4. Push, then comment «Ready for review again» with the real test counts (a Design Issue has none: say «no code, no tests»). Do not
   touch the `changes requested from AI Manager` label or any other: the labels job decides them.
5. End with «✅ Issue #N finished» (or «⛔ Issue #N stopped»), the link, the counts, what was not done and the next step. The next step is
   one the session takes, or numbered «🙋 Only you» steps when only the person can do it (see «Who does each step»).
6. Start the wait again in the background: `node "${CLAUDE_PLUGIN_ROOT}/bin/huddle" wait <n>`. When it ends, a new request is pending:
   the developer runs `/huddle-play <n>` again.

## When you cannot go on

Commit and push what is done. Comment on the Issue starting with «❓ Decision for the AI Manager:» (what is blocked, the
options with trade-offs, your recommendation), add the `needs decision` label, end with «⛔ Issue #N stopped: waiting for a
decision». Never close the Issue.

## Who does each step

Before you hand a step to the person, check whether you can do it yourself with the tools and logins you have (`gh`, `glab`,
and the repo's own tools). If you can, do it and report what you did. Only a step that needs something you cannot have goes to them: a second
person's account, a payment, a secret, a phone or another device, a legal or business decision, a paid action they must
approve, or a permission that was denied. Write that step as numbered «🙋 Only you» steps for someone with no technical
background (docs/design.md §13): one action per step, a copy block for what is pasted, «You should see:» and «If you see
something else:». Your closing message says what you did yourself, and its next step is either a step you will take or those
🙋 steps. If a permission is denied or a credential is missing, stop and ask; never look for another way.
