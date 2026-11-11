---
name: huddle-update
description: Use when a repo that already has Huddle set up must be brought to the installed Huddle version: after updating the plugin, when the update notice or the doctor's `setup` line says so, or when a release asks a new question.
---

# huddle-update

Brings the repo you are in to the installed Huddle. Run it from the repo root, on a branch that is not the default branch. A repo
with no `huddle.json` has not been set up: use `/huddle-setup` instead.

## Run the command first

Run, in the repo root, before you ask anything:

`node "${CLAUDE_PLUGIN_ROOT}/bin/huddle" update --json`

It reads and writes only files (no login, no network). Read the JSON it prints:

- **`status` is `updated`** and `pendingQuestions` is empty: it already did the work. Go to «Report».
- **`status` is `questions`** (exit code 3): it changed **nothing**. `pendingQuestions` lists what this repo has not answered yet. Go to «Ask».
- **`status` is `up-to-date`**: nothing to do. Say so.

If it fails, show its message (for example «there is no huddle.json here») and stop.

## Ask

Ask **only the pending questions** (`pendingQuestions`), never the five questions of `/huddle-setup` and never one the repo has already
answered. One message, in the developer's language, one line per question: its `ask`, its `options` when it has them, and its
`default` offered as the answer. Never ask for a token.

Then run `node "${CLAUDE_PLUGIN_ROOT}/bin/huddle" update --json --answer <key>=<value>` with one `--answer` for each question (a
value is read as JSON when it is JSON: `true`, `3`, else text). It writes the answers and refreshes the repo. If it refuses a key, show why.

## Report

Tell the developer what changed, from the JSON: the block of `CLAUDE.md` (`claudeMd`), the files in `changed`, the templates kept
because the project edited them (`skipped`, with the way to get the current one that the `notes` give), and every line of `notes`
(for example a labels job that pins an older `HUDDLE_REF`: updating that pin is a PR the AI Manager's session opens). Then say:
commit it on a branch and open a PR/MR; the update never commits.

When you are the AI Manager's session, do every step you can yourself (docs/design.md §13): run the command, make the branch, commit and
open the PR/MR. Hand over only what needs a person.

## Look before you change anything

`node "${CLAUDE_PLUGIN_ROOT}/bin/huddle" update --check` writes nothing and says `up to date` (exit 0) or what would change and which
questions are pending (exit 3). `--dry-run` prints the whole change and writes nothing. The `setup` line of `node "${CLAUDE_PLUGIN_ROOT}/bin/huddle" doctor` gives the same answer.

## Who does each step

Before you hand a step to the person, check whether you can do it yourself with the tools and logins you have (`gh`, `glab`,
and the repo's own tools). If you can, do it and report what you did. Only a step that needs something you cannot have goes to them: a second
person's account, a payment, a secret, a phone or another device, a legal or business decision, a paid action they must
approve, or a permission that was denied. Write that step as numbered «🙋 Only you» steps for someone with no technical
background (docs/design.md §13): one action per step, a copy block for what is pasted, «You should see:» and «If you see
something else:». Your closing message says what you did yourself, and its next step is either a step you will take or those
🙋 steps. If a permission is denied or a credential is missing, stop and ask; never look for another way.
