# Huddle

**Decision-led development for teams coding with AI.**

Huddle is a team method and a Claude Code plugin. One person, the AI Manager, hands out tasks as Issues. Each developer
pastes the Issue's «Prompt for Claude Code» into a session. The session works on its own branch, stops to ask when a
decision is not its to make, opens a pull request (a merge request on GitLab) and waits for the review on its own.

It works with GitHub and GitLab, including self-managed GitLab.

> **Status:** under construction. The design is in [docs/design.md](docs/design.md). Version 0.1.0 is not released yet.

> Our job is no longer typing code. It is making good decisions. The AI writes, tests and asks; the person decides.

## Why Huddle

AI coding tools made writing code cheap. They did not make teams faster on their own. When every developer prompts the
AI in their own way, every session understands the project differently. Tasks collide in the same files. Mistakes show up
late, in review or in production. And the one thing the AI cannot bring, knowledge of the business, the users and the
priorities, gets answered in a rush.

Huddle turns that around. The person's time goes into deciding and reviewing. The AI does the typing, the testing and the
asking.

| Without a method | With Huddle |
|---|---|
| Most of the time goes into writing code by hand, or into writing a new prompt for every task. | The person's time goes into deciding and reviewing. |
| Each person explains the project to the AI in their own way. | Every session reads the same context and the same rules. |
| Tasks collide in the same files. | Each task has its own files, so two people do not collide. |
| Mistakes show up late, in review or in production. | Tests and review catch mistakes before merging. |

## The cycle

From an idea to merged code, step by step:

1. **The AI Manager plans and splits the work.** They define what gets built, write the spec and split it into tasks that
   do not step on each other: each one touches different files.
2. **The AI Manager creates the Issue with its prompt ready.** Each task is an Issue with the exact prompt to paste into
   Claude Code, the files that may and may not be touched, and the tests that must pass.
3. **The developer opens a session and pastes the prompt.** There is no need to explain the project: `CLAUDE.md` and the
   team docs already give the session its context.
4. **The developer answers the AI's questions and decides.** This is where the value is. The session asks what the Issue
   does not settle: what to do in an unusual case, what text the user sees, what to prioritize. Each answer is a
   decision, and the quality of the result depends on it.
5. **Claude Code writes the test, the code and opens the pull request.** First the failing test, then the code that makes
   it pass. The pull request lists the tests it ran with their real results. The session ends with a message that starts
   with «✅ Issue #N finished»: the link, what was not done and your next step. If you do not see that message, the session
   is not over.
6. **CI filters.** The automatic tests run on every pull request. If something fails, it does not reach review.
7. **The AI Manager reviews, merges and defines what comes next.** Anything that touches production (the real database,
   deployments, keys) is done only by the AI Manager.

When a session cannot go on without a decision, it does not guess. It pushes what is done, writes the question on the
Issue with the options and a recommendation, and stops. The AI Manager answers there, and the session continues on the
same branch.

## Who does what

**AI Manager** (a single person, not the AI; they lead the work with the help of their own Claude Code session)

- Decides what gets built and in what order.
- Writes the specs and creates the Issues with their prompt.
- Reviews and merges pull requests. The only one who merges into the default branch.
- The only one who touches production and secrets.

**Developer**

- Takes an Issue and works on its own branch.
- Answers the session's questions with judgment.
- Reviews what the AI did before opening the pull request.
- If something does not fit the Issue, asks the AI Manager instead of improvising.
- Works only with local, disposable test data.

## What each Issue brings

The Issue template makes every task arrive complete, so anyone's session starts the same way, no matter who takes it.

| Part | What it says |
|---|---|
| Goal | What we want to achieve and why, in a few lines. |
| Prompt for Claude Code | The text to paste into Claude Code, with the steps, the branch and how to open the pull request. |
| Allowed files | The only things the session may touch. |
| Forbidden files | What is not touched. If it needs to be, the session asks first. |
| Contract or spec | The document that rules over the code. |
| Tests | What must pass before opening the pull request, with its counts. |

## Why working this way is better

**The decision is the work.** The AI is fast at writing and testing, but it does not know the business, the users or the
priorities. When it asks, the person brings what the AI does not know. A good answer saves hours; a rushed answer is paid
for later.

**A ready prompt removes variation.** If each person writes their own request, each session understands something
different. With the prompt written by the AI Manager, they all start with the same goal, the same limits and the same
tests.

**Clear limits, fewer collisions.** Allowed and forbidden files let several people move forward at once without stepping
on each other, and tell the AI where not to go.

**Production in a single pair of hands.** Nobody on the team needs keys or access to the real database. A mistake in one
session cannot touch what customers use.

## Why not open 10 sessions to take 10 Issues at once?

It sounds faster, but in practice a developer with many open sessions gets less done and decides worse.

- **The computer becomes the bottleneck.** Each session runs tests, starts test databases and builds the app. With many at
  once, the machine slows down and they all move more slowly than a few would.
- **Attention does not multiply.** Each session asks questions, sometimes one after another. With ten open, the questions
  pile up, you lose the thread of each task and start answering fast just to get through. That is when the decision stops
  being objective, and the decision is exactly what the person brings.
- **Every session has to be reviewed.** What the AI did is reviewed before opening the pull request. Ten half-reviewed
  pull requests are worth less than two done well, and they fill up the AI Manager's review queue.

**Our recommendation:** one or two active sessions per person. More speed comes from adding developers, not from adding
windows.

## What is not negotiable

- **Never push to the default branch.** One task is one Issue, one branch and one pull request. Only the AI Manager
  merges.
- **Only the allowed files.** If another one is needed, ask first.
- **Test first.** Write the failing test, then the code. The pull request says which tests were run and with what result.
- **No production and no secrets.** If a permission or a key is missing, stop and tell. Do not look for another way.
- **Nothing is dropped silently.** Everything the Issue asks for ends up done, or noted under «What was NOT done» with the
  reason.
- **Chat in your language; the repository is in English.** You talk to Claude Code in the language you prefer. Commit
  messages, pull requests, Issues, code comments and documents are in English.

## What the plugin adds

The method works with plain Issues and a good `CLAUDE.md`. The plugin takes the manual steps away:

- Status labels that move on their own: ready, assigned, in progress, in review, blocked, needs decision, and changes
  requested from AI Manager.
- A dependency check before a session starts: if an Issue it depends on is not merged yet, the session does not begin.
- Skills to set a project up, start an Issue, write a new Issue, review a pull request and ask for a decision.
- A session that waits for the review on its own and picks up the AI Manager's requested changes as soon as they arrive.
- The same commands on GitHub, on gitlab.com and on a company's own GitLab server.

## License

[MIT](LICENSE)
