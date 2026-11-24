---
name: huddle-issue
description: Use when the Coach wants to write a new Issue for a Player from the Huddle Issue template.
---

# huddle-issue

For the Coach (the `coach` login in `huddle.json`). Check with `node "${CLAUDE_PLUGIN_ROOT}/bin/huddle" doctor` that you are that login; if
not, stop and say so.

Use `huddle-brainstorm` first when a new task needs its goal, scope, or approach clarified.

**In OpenAI Codex** (Issue #213): run the `huddle` command the session start named wherever this skill writes `node "${CLAUDE_PLUGIN_ROOT}/bin/huddle"`; make worktrees with `git worktree add` and work in that folder; run `gh`, `glab`, `git push` and `huddle` with network access (approve it when Codex asks).
In Claude Code and Codex, write every Issue/PR/MR body or comment to a temporary UTF-8 file first. Pass `--body-file <file>` to `gh`, use `glab api … -F 'body=@file'` for GitLab notes or `--description-file <file>` for GitLab descriptions, and never pass the text inline.

## Do

1. Ask what the task is (goal, the document that rules over it). Read that document and the code it touches.
2. Fill the repo's Issue template (`.github/ISSUE_TEMPLATE/task.md` or `.gitlab/issue_templates/Task.md`):
   - **Goal:** one or two sentences.
   - **Depends on:** one `- #N` per line, or `- None`. The labels job reads this section.
   - **Effort:** 1 small, 2 medium or 3 large. Write the draft to a temporary file outside the repo and run
     `node "${CLAUDE_PLUGIN_ROOT}/bin/huddle" effort --suggest <file>`: write its `effort` in the «Effort» section and show its `reasons`; the
     Coach may change it. With `split: true`, propose splitting the Issue into parts with «Depends on» between them, before creating it.
   - **Branch:** a short name, created from an up-to-date <staging> (the default branch when there is no staging): read `staging_branch` in `huddle.json`, and write its name in place of «<staging>». With one set, the PR/MR targets it and Huddle closes the Issue when it is merged there.
   - **Prompt for Claude Code:** a text block the Player pastes as is. It must say: read the Issue and the named
     documents; check «Depends on» first; create the branch in its own worktree; TDD; the allowed files only; the tests to
     report with their counts; the closing message; «What was NOT done».
   - **Who does each step:** the Issue's text and its prompt give the session every step, except those only a person can do
     (a second person's account, a payment, a secret, a phone or another device, a legal or business decision, a paid
     action, a permission that was denied). Mark each of those with «🙋 Only you» and write it as numbered steps for someone
     with no technical background (docs/design.md §13); every other step stays the session's.
   - **How to test in staging:** optional. Ask for one or two steps a person with no technical background can do in staging, each with what they should see. `/huddle-test` reads this section to guide the Coach, so write it whenever the Issue changes something a person can see or touch.
  - **Allowed files**, **Contract or spec**, **Tests that must pass:** concrete, checkable.
   - **Overlap warning:** compare the new Issue's allowed files with those of the open Issues (`node "${CLAUDE_PLUGIN_ROOT}/bin/huddle" conflicts` lists the planned conflicts that already exist); when a file is shared, say which Issues and offer to add `- #N` to this Issue's «Depends on» before creating it (the Coach's session decides when the order is obvious: the older Issue goes first), so the board shows `blocked` and two Players never collide at merge. `huddle conflicts --apply` settles the order of the whole repo at once.
   - **Milestone (area):** ask which milestone the Issue goes in. Areas are milestones, and each Issue belongs to one: list the
     open ones with `gh api repos/<project>/milestones --jq '.[].title'` (or `glab api projects/<encoded project>/milestones?state=active`)
     and offer them. If the right one does not exist yet, offer to create it. The Coach keeps its
     `Huddle remaining: N` line (the Issues still to write in that area) up to date in the milestone description. With no
     milestone the Issue is counted as «no area» and left out of the progress percentages.
   - **A Design Issue.** When the task is a design (screens, a flow, a visual), write it from the Design template
     (`.github/ISSUE_TEMPLATE/design.md` or `.gitlab/issue_templates/Design.md`) instead. It has every section above, plus:
     **Screens** (which screens or states), **For whom** (the user and the moment they are in), **Visual guide** (the project's
     design system, or the guide or brand file to follow), **Content** (real texts, never lorem ipsum) and **Deliverable** (what «done» means).
     **Allowed files** are always `design/<issue number>-<slug>/`, and a design Issue never changes code. The prompt must also say that
     changes are asked for in the chat and never by hand on the canvas, and that «ready» makes the session save the design and open the PR.
3. Show the draft, with its milestone, and wait for the Coach's OK only when the Issue changes the product's design, behaviour or scope;
   otherwise create it and show its link (the Coach's session decides, and keeps going). Create it with `gh issue create --milestone "<title>"`
   (or `glab issue create --milestone "<title>"`) using the repo from `huddle.json`; a Design Issue also gets `--label design`
   (the `design` label exists once `node "${CLAUDE_PLUGIN_ROOT}/bin/huddle" labels` has run). Do not add them by hand (the status
   labels and the assignee): the command in step 4 does. The issue number is known only after creating it, so edit the Issue once to write it in the allowed files path.
4. Right after creating the Issue (and after that edit), run the **full** `node "${CLAUDE_PLUGIN_ROOT}/bin/huddle" labels` once: it puts `ready` or
   `blocked` on the new Issue and assigns it (a run scoped with `--issue` never assigns an open Issue). It is best effort: on a failure, say one
   line with the reason and go on; it never stops the task. Every change to an Issue goes through a Huddle session (docs/design.md §22), so this is
   what keeps the board right with no cloud job.
5. Answer with the Issue link.

## Who does each step

Before you hand a step to the person, check whether you can do it yourself with the tools and logins you have (`gh`, `glab`,
and the repo's own tools). If you can, do it and report what you did. Only a step that needs something you cannot have goes to them: a second
person's account, a payment, a secret, a phone or another device, a legal or business decision, a paid action they must
approve, or a permission that was denied. Write that step as numbered «🙋 Only you» steps for someone with no technical
background (docs/design.md §13): one action per step, a copy block for what is pasted, «You should see:» and «If you see
something else:». Your closing message says what you did yourself, and its next step is either a step you will take or those
🙋 steps. If a permission is denied or a credential is missing, stop and ask; never look for another way. When only the person can go on, never write it as free prose: write ONE comment with the list of steps in the form of Issue #338 (`stepsBody` of `${CLAUDE_PLUGIN_ROOT}/lib/core/steps.mjs`: a reason, one action per step with «You should see:» and «If you see something else:», and an ending `resume` or `none`; it refuses a step with two actions or with a command), through a temporary UTF-8 file and `--body-file`, and never hand the person a command to type: you run it yourself after they confirm. The Coach's `/huddle-steps` asks the steps one by one.
