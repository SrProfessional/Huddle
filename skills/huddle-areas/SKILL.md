---
name: huddle-areas
description: Use when the AI Manager wants to define the project's areas, put Issues in them, estimate what is missing in each, or check that the areas are up to date.
---

# huddle-areas

For the AI Manager only. Run `node "${CLAUDE_PLUGIN_ROOT}/bin/huddle" doctor`: if you are not the `ai_manager` login in `huddle.json`, stop; only the
AI Manager defines the areas. It works the same on GitHub and GitLab.

**Areas are milestones.** Each Issue goes in one milestone, and the milestone description holds a one-line purpose and a line of its own,
`Huddle remaining: N`, the estimate of the Issues not written yet (docs/design.md §12). **The number of areas depends on the project and is never fixed:**
one project has 3, another more or fewer. Never start from a number; start from the project.

**You judge, the CLI does the mechanics.** You propose and explain; the AI Manager decides. Never change anything without the AI Manager's explicit OK, and
show every change before you apply it: run the command with `--dry-run` first, show what it printed, and run it for real only after the OK.

## Start

Run `node "${CLAUDE_PLUGIN_ROOT}/bin/huddle" areas list` and `node "${CLAUDE_PLUGIN_ROOT}/bin/huddle" areas check --json`.
No areas yet: do steps 1 to 4 in order. Areas exist: do the check-up (step 5), and offer steps 1 to 4 for whatever it finds.

## Do

1. **Propose the areas from the project.** Read the README, `CLAUDE.md`, the specs and plans if there are any, and the open and closed Issues
   (`gh issue list --state all` or `glab issue list --all`). Propose a list of areas, any number, each with a one-line description, and say why
   these. Ask the AI Manager to accept, rename, merge, split or drop them. Wait for the OK.
2. **Create or update the milestones**, after the OK only: `node "${CLAUDE_PLUGIN_ROOT}/bin/huddle" areas set "<title>" --remaining N --description "<one line>"`.
   It reuses a milestone that already exists (any case of the title) and keeps the rest of its description. Without `--description` it only
   rewrites the `Huddle remaining` line; with it, the purpose replaces the other text, so say so before you do that.
3. **Classify the existing Issues.** For each Issue with no area, open and closed (`areas check --json` lists them), read its title, body, labels
   and the files of its linked PR/MR, and propose an area. Show the proposal grouped by area, with «no area» for platform or tooling work that fits
   none. Apply only what the AI Manager approves: `node "${CLAUDE_PLUGIN_ROOT}/bin/huddle" areas assign <issue> "<title>"`, or `none` to take an Issue out.
4. **Estimate «remaining» per area.** From the specs and plans (the parts not yet written as Issues) and the open work, propose a number per area
   with its reasoning, for example «spec X lists 8 parts, 3 are Issues already, so 5». The AI Manager confirms or edits each one; then run
   `areas set "<title>" --remaining N`.
5. **Check-up.** From `areas check --json` report, one kind at a time:
   - Issues with no area (`noArea`): propose an area for each, as in step 3.
   - Areas with no `Huddle remaining` line (`missingEstimate`) or one that is not a whole number (`malformedEstimate`): propose a number, as in step 4.
   - Areas whose estimate looks stale: for each one in `zeroRemaining`, read the open specs and plans. If they still list parts that are not Issues,
     remaining 0 is stale: propose the number they imply. If not, say 0 is right.
   - Areas in `empty` (no Issue, remaining 0): ask whether to drop them (a milestone is closed or deleted by hand; Huddle never does it).
   Offer the fix for each finding and apply only the ones the AI Manager approves.

## After

Run `node "${CLAUDE_PLUGIN_ROOT}/bin/huddle" progress` and show the result: it is what the team will see. Do not touch the «Huddle progress» Issue; the labels job
rewrites it. Never print or paste a token; if a call is refused for lack of permission, stop and say what is missing.
