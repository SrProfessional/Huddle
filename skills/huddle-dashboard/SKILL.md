---
name: huddle-dashboard
description: Use when someone wants to see the team's dashboard: Issues closed, tokens and API cost against plans, cost per Issue, pace, progress by area, who does what now and the releases. Run it as `/huddle-dashboard` (Claude Code) or `$huddle-dashboard` (Codex).
---

# huddle-dashboard

A private page for this repo, written on this machine and opened in the browser. Anyone on the team may run it; it changes nothing on the
platform and sends nothing anywhere (only the API prices are read from the network, once a day). The rules are in docs/design.md §26.

**In OpenAI Codex**: run the `huddle` command the session start named wherever this skill writes `node "${CLAUDE_PLUGIN_ROOT}/bin/huddle"`, and approve network access when Codex asks (it reads the platform and the prices).

## Do

1. Run `node "${CLAUDE_PLUGIN_ROOT}/bin/huddle" dashboard` (or with `--no-open` when the person only wants the file, or no browser can open here).
2. It writes `.huddle/dashboard/index.html` and the three scripts the page uses next to it, and opens the page. `.huddle/` is ignored by git
   (setup and update add it to `.gitignore`), so nothing of it is committed. If `.huddle/` is not in the repo's `.gitignore` yet, say so in one
   line: `/huddle-update` adds it.
3. Say in one line, in the person's language, that the page is open and where the file is. If a line on stderr starts with «huddle dashboard:», a
   part could not be read (the platform, the team's branch, the prices): name it; the rest of the page is complete.
4. Never paste the page or its numbers into the chat unless the person asks. A reader who wants the numbers in text uses `huddle usage --team`
   and `huddle progress`.

The page has: Summary (Issues closed, team tokens, what the tokens would cost by API, what the plans cost, the difference), Progress by area, Who
does what now, Tokens and cost (each person, tool and model), Cost per Issue (and per effort point), Pace, Releases, and a 7 days / 30 days / all filter.

## Who does each step

Before you hand a step to the person, check whether you can do it yourself with the tools and logins you have (`gh`, `glab`,
and the repo's own tools). If you can, do it and report what you did. Only a step that needs something you cannot have goes to them: a second
person's account, a payment, a secret, a phone or another device, a legal or business decision, a paid action they must
approve, or a permission that was denied. Write that step as numbered «🙋 Only you» steps for someone with no technical
background (docs/design.md §13): one action per step, a copy block for what is pasted, «You should see:» and «If you see
something else:». Your closing message says what you did yourself, and its next step is either a step you will take or those
🙋 steps. If a permission is denied or a credential is missing, stop and ask; never look for another way.
