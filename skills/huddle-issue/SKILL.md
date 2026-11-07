---
name: huddle-issue
description: Use when the AI Manager wants to write a new Issue for a developer from the Huddle Issue template.
---

# huddle-issue

For the AI Manager (the `ai_manager` login in `huddle.json`). Check with `node "${CLAUDE_PLUGIN_ROOT}/bin/huddle" doctor` that you are that login; if
not, stop and say so.

## Do

1. Ask what the task is (goal, the document that rules over it). Read that document and the code it touches.
2. Fill the repo's Issue template (`.github/ISSUE_TEMPLATE/task.md` or `.gitlab/issue_templates/Task.md`):
   - **Goal:** one or two sentences.
   - **Depends on:** one `- #N` per line, or `- None`. The labels job reads this section.
   - **Branch:** a short name, created from an up-to-date default branch.
   - **Prompt for Claude Code:** a text block the developer pastes as is. It must say: read the Issue and the named
     documents; check «Depends on» first; create the branch in its own worktree; TDD; the allowed files only; the tests to
     report with their counts; the closing message; «What was NOT done».
   - **Allowed files**, **Contract or spec**, **Tests that must pass:** concrete, checkable.
   - **Milestone (area):** ask which milestone the Issue goes in. Areas are milestones, and each Issue belongs to one: list the
     open ones with `gh api repos/<project>/milestones --jq '.[].title'` (or `glab api projects/<encoded project>/milestones?state=active`)
     and offer them. If the right one does not exist yet, offer to create it. The AI Manager keeps its
     `Huddle remaining: N` line (the Issues still to write in that area) up to date in the milestone description. With no
     milestone the Issue is counted as «no area» and left out of the progress percentages.
3. Show the draft, with its milestone, and wait for the AI Manager's OK. Create it with `gh issue create --milestone "<title>"`
   (or `glab issue create --milestone "<title>"`) using the repo from `huddle.json`. Do not add status labels or an
   assignee: the labels job does that.
4. Answer with the Issue link.
