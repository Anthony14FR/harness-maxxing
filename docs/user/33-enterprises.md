---
section: Using Harness Maxxing
---
# Enterprises

An **enterprise** puts several of your [agents](agents) in one **org chart**, above your projects. The boxes of the
chart are **positions** (a head of marketing, a writer, customer care); each position has a **lead** it reports to, and
at most one agent sitting in it. Work goes **down** the chart (a lead hands a task to a report), results and blockers
go **up** (a hand-in, an escalation), and you get one daily digest instead of one message per agent.

One agent, or a [group](agent-groups), is enough for most work. An enterprise helps when you have **many agents over
several projects** and you have become their dispatcher: you want one place that shows who does what and what it
costs, decisions taken at the right level, and only what really needs you.

- **Marketing agency**: a director, a content lead with a writer, a social media manager.
- **Online shop**: a shop manager, order handling, customer care, a front desk that answers customers.
- **Content studio**, **research and watch**: ready-made charts, below.

Nothing existing changes. An agent keeps its role, its limits, its sandbox and its keys; the enterprise **never grants
anything**, it only narrows (a shared budget, key and domain lists), routes (who hears about what) and keeps a record.
An agent outside any enterprise works exactly as before.

## Switch it on

**Settings -> Features -> Enterprises**. It needs **Agents** to be on, and it is off by default. While it is off, no
enterprise code runs: no note in agents' turns, no ceiling, no routing (your files stay, delegated tasks stay plain
tasks). Switching Agents off pauses everything the same way: deliveries wait, nothing is lost.

## Create an enterprise

On the **Enterprises** page, **New enterprise**:

1. Give it a **name** (and an emoji). Its folder is `enterprises/<name>` in your workspace.
2. Tick the **projects** it covers. A project belongs to **at most one** enterprise.
3. Optionally **start from a template**: *Marketing agency*, *E-commerce*, *Content studio* or *Research and watch*.
   A template is a chart of **vacant** positions with job descriptions, departments and sensible settings; you change
   whatever you like afterwards.

**With Claude**: **Build me a company** (or ask in any session: "build me a company of agents for acme"). Claude asks
five short questions (what the company does, which projects, goals for the next months, a budget in USD a day, how
autonomous it may be), proposes a chart as a short tree and **waits for your OK** and your edits. Only then does it
create the enterprise and its positions, all vacant. It never creates an agent without your explicit yes.

Templates (the ready-made charts) and the labels of the cards they create are in English only.

Position ids `owner`, `server`, `policy`, `visitor`, `free`, `esc` and `none` are reserved. Limits: 20 enterprises, 200 positions each, 6 levels deep (4 by default, the setting **Levels in the chart**) and 12
reports per lead (8 by default).

## The org chart

The **Org chart** tab is the home of an enterprise: a tree of cards, one per position, with the occupant's face, the
title, a state and the cost of the day. States: **Working**, **Waiting for you**, **To read**, **Failed**, **Off**,
**Ready**, **Vacant** and **Blocked** (its deliveries are waiting because a daily budget is reached, an envelope is
full or its agent is off; the card says which).

- **Open a position**: click its card. Its occupant's conversation opens on the right (the same conversation as on its
  agent page); a second tab shows its job description, **Inbox & tasks** and what it asked you.
- **Add position**: a box exists on its own; an agent can be seated now or later. Choose its title, its lead
  (**Reports to**, or **The top of the chart**), its department and its **job description**.
- **Vacant** positions show **Hire**: it creates a **new agent** in a topic of a linked project (you choose the topic)
  and seats it. The agent sets itself up in its conversation from the job description, like any new agent. The
  **Hire** dialog lets you choose the agent's **name**, its **role** (the text of its `CLAUDE.md`, by default the
  title and the job description), its **model** and its **effort**. Or **Seat an agent** that already exists. If it
  lives in a project that is not linked yet, you are offered to **link the project and seat** it in one step. An
  agent holds at most one position.
- **Vacate** empties a position without touching the agent. Deleting an agent vacates its position; restoring it from
  the Trash does not re-seat it by itself.
- **Change lead**, or **drag** a card onto another one (computer). The chart refuses a cycle, too many levels or too
  many reports under one lead. If the chart changed in the meantime it reloads and you try again.
- **Remove position**: its reports move to its lead (or where you choose), and its open tasks get the new lead as
  requester; its agent is not touched.
- **Top**: in the settings you choose who stands at the top, **You** or one position (a Director) that reports to you.

The **Org** view of the **Office** (the view menu of the Agents page) draws the desks grouped by enterprise and
department; agents outside any enterprise are under *Not in an enterprise*.

## What an occupant knows

At every turn, an occupant reads, from general to specific:

1. the **mission** of the enterprise (its `CLAUDE.md`, edited in the **Profile** tab),
2. the **notes of its department**,
3. its own **job description**,

then its own role and memory as always. These three are added to the turn by the server and cut at **3,000
characters in total** (the editor shows the count; the cut falls at the end, so the job description is what gets
truncated first): keep them short. A position's panel shows the size of its note and warns when it is cut. Changing the mission once changes it for every
occupant at its next turn. Nothing is written into the agent's folder: unlinking leaves no trace in the agent.

The **company profile** (products and prices, hours, terms, contact, FAQ) is **not** given to every turn. Agents read
it **on demand** (`maxxing enterprise profile`), so a long catalogue costs nothing to an agent that never needs it. It
is what customers may hear: put nothing private in it, every occupant can read it, and an agent must never quote a
price or a term that is not in it.

## Delegation, hand-ins and escalation

| What | How |
|---|---|
| **Delegate** | A lead gives a task to one of its **direct reports** (never further down, never across the chart), whatever the report's department: no request is needed. It becomes a normal entry of the [Tasks](tasks) file, labelled with the enterprise, and the report receives it. |
| **Hand in** | The report says it is done, with a summary: it goes to the **requester's** inbox, never to you. The lead accepts it or sends it back with notes. |
| **Block** | A report that cannot go on says why; the task shows **Blocked** with the reason. |
| **Escalate** | A position that needs a decision asks **one level up**, saying what it tried, the options and its recommendation. |

Deliveries are not one run per message: they wait in the position's **inbox**, and its occupant runs **once** for
everything waiting, after its usual grouping delay. A delivery that cannot start (agent off, budget or runs per hour
reached, vacant position) **waits** instead of being lost. These runs count in the agent's budget and limits.

**Follow-ups**: nobody has to watch for a late task. When a delegated task has not moved for **4 hours** (**2 hours**
in total autonomy), the position that asked for it is woken with the list of those tasks, to chase, escalate or decide
(once per task per period; a task whose owner is running right now is left alone). In total autonomy the top position
also gets one **daily follow-up** listing every open task. See what is open with `maxxing enterprise tasks`.

Delegation to a direct report never needs a request, whatever the department of the report. This is fixed
behaviour, not a setting.

**Escalation timeout** (setting, 4 hours by default, 1 to 72): a question nobody answers climbs one level, up to you,
where it becomes a notification you can answer. A vacant, switched-off or out-of-budget lead is skipped at once. An
escalation always reaches you, even from a silent agent. The hand-overs on one task are limited (6 by default); past
that, it goes to you.

## Review before hand-in

Set **Reviewer** in the settings (a position) and a contributor's hand-in no longer goes straight to the requester: the
task goes to the reviewer first (stage **Waiting for review**). The reviewer runs
`maxxing enterprise review TASK approve` (stage **Reviewed**, then the usual hand-in to the requester, mentioning the
review) or `maxxing enterprise review TASK changes "notes"` (stage **Changes asked**; the notes go back to the task's
owner, who goes on working). Only the reviewer can use the command, and a task owned by the reviewer itself is not
reviewed. Leave the setting empty for no review step.

While a task waits for review (**Waiting for review** or **Changes asked**), the requester cannot accept it: only the
reviewer's verdict moves it on. If the reviewer position is removed or the setting is cleared, the tasks waiting for
review go back to the requester to accept.

## Meetings

A **lead** (or you) can call an **enterprise meeting** to get several positions' views at once, across projects:
`maxxing enterprise meeting start "topic" --with writer,social [--hours 6]`. A lead invites positions **in its own
branch** of the chart; the top position may invite any position; nobody invites itself. Each invited position receives
the topic and answers once with `maxxing enterprise meeting reply ID "text"` (each invited position answers on its own). The meeting
closes when everyone has answered or at the **deadline** (4 hours by default, up to 168), and the organizer receives
the **minutes**: all the replies. The meetings are listed with their replies and minutes, read-only in the app.

## Requests and approvals

An occupant can **ask for something** that the chart must decide: spending, a purchase, a change to a job
description, a worker, a budget raise, a profile edit... A request to change a job description or to seat an agent
names its target (`--position`, with `--job` or `--agent`), which must be in the requester's own team. Each category is decided by the **requester's lead** or by
**you**, depending on the **autonomy** profile of the enterprise (setting):

| Request | Careful | Balanced | Autonomous |
|---|---|---|---|
| Assign to a direct report, read the profile, write in one's own department | free | free | free |
| Deliver into another department's folder | you | lead | lead |
| Edit a report's job description | you | lead | lead |
| Create a worker from an approved template | you | lead | lead |
| Edit the company profile (not prices or terms) | you | lead | lead |
| Declared spending up to the department's threshold | you | lead | lead |
| Raise a report's daily budget (inside the envelope) | you | you | lead |
| Re-seat an agent on a vacant position of one's team | you | you | lead |
| Edit prices or terms, put the front desk live | you | you | you |
| Hire or remove a permanent agent; change keys, domains, sandbox, folders | you | you | you |
| Spending above the threshold, any new recurring cost | you | you | you |
| Publish publicly, write to a customer, anything irreversible | you | you | you |

Some rows are enforced by the server; the spending rows are **declared** by the agent and the last row relies on the
agent's role and its usual approvals.

**Hire requests**: a position can ask for a **new position and its agent** with
`maxxing enterprise request hire "why" --title T --topic projects/<p>/topics/<t> [--department D] [--reports-to P]
[--job TEXT] [--name N] [--role TEXT] [--model M] [--effort E]` (only `--title` and `--topic` are required). It is always
yours to decide: **on your Accept**, the position is created under the chosen lead, the agent is created in that topic
and seated, and the requester is told the outcome (or why it failed).

The **hire card** shows everything you accept: title, department, lead, topic, name, model, effort, the job description
and the **role** (the first 600 characters, in a collapsible block), and a **From outside** marker when the request
was made after text from outside. Read the role before you accept. The new agent is **protected (sandboxed)** when its
requester is, or when the position it takes is marked as running outside code.

A request that reaches you is an **Allow / Deny** card in the **Overview** ("Waiting for you"), in the notifications
and on Telegram. A lead decides in its next run. If nobody answers in time, the request climbs one level, like an
escalation. Everything is written in the **Decisions** tab (the decision log, filterable by kind and position).

Rules no setting can change:

1. A request born in a run **started from outside** (a webhook, a mail, a feed event, the front desk, a forwarded
   Telegram message) is **always decided by you**, and so is everything further down that chain.
2. The approvals of tool calls and the requests of safety settings (sandbox, keys, domains, folders, budget) stay
   yours: a lead **never** answers them, and an agent never changes itself.
3. Nobody decides their own request, and a lead only decides for its own team.
4. **Allowing a request grants nothing.** If it needs a key, a domain or a folder, you still get the usual card of
   the agent.

**The top position decides for me** (setting, off by default): the top position of the chart decides what would
otherwise reach you, including its own requests (the log says so), so you can **run the enterprise by talking only to
the CEO**. Grants are not needed in that mode. Always staying yours: requests born from **outside content**, **hires
and removals** (`hire`, `hire_remove`), changes of **keys, domains, sandbox and folders**, **prices and terms**, and
**putting the front desk live**. When the top is vacant or off, the request goes to you as usual.

- It only fully works with **Trust along the chain** on. With it off, a message from another agent counts as outside
  text, so the requests made while handling a delivery are marked outside and reach you, not the top. The settings
  warn about it and offer to turn trust on.
- A **batch that started from outside** (a stranger's message among the deliveries of a run) never lets the top
  decide: what is requested in it climbs to you.
- Switching it **off** hands the requests still waiting at the top back to you, with their cards.

**Total autonomy** (setting, off by default, at the top of the settings; needs a top position of the chart): the
enterprise runs by itself and **each request is decided by the requester's lead**, while the top position decides its
own and has the last word. While it is on, **Autonomy** is *autonomous*, **Trust along the chain** is on and **The top
position decides for me** is on, whatever you stored (the settings show these values, disabled; your choices come
back when you switch it off). What is free stays free: routine work needs no request. A lead that is vacant, switched
off or out of budget is skipped for the next one above; when the top is unavailable, the request reaches you.
Occupants are told to work with maximum proactivity: never wait, chase, decide at their level.

- **Still yours**: requests born from outside content, `hire` and `hire_remove`, prices and terms, and putting the
  front desk live.
- **Escalations stop at the top**: a question climbs no further than the top position, which answers it. Only when the
  top is unavailable does it reach you.
- **Only the top writes to you**, with `maxxing enterprise report-to-owner "text"` (no other position may). Every
  other notification is muted (it stays in the decision log) except the cards that wait for your answer, the daily
  digest and the weekly and monthly reports, and the envelope alerts.

**Delegated approval**: you can let a lead decide a category up to a ceiling until a date ("until Friday, the head of
marketing decides spending up to 50 USD"), 30 days at most, revocable. It never covers the rows where you always
decide. See [the command line](#from-the-command-line).

## Envelopes: budget, keys and domains

The **envelope** of the enterprise (settings) and of each **department** caps what its agents may use together:

- **Budget per day (USD)**: the sum of what its agents spend in a day, workers included. A position has no budget of
  its own: it is its occupant's daily budget. The digests and reports are not counted in the agents' budgets: they are
  held back by the same ceiling check (budget reached means the raw list is sent). The costs shown (chart cards, Overview,
  chart of the day, dashboard card) include the workers' spending.
- **Keys** and **Domains**: a list of key names / sites. Empty means no narrowing.

An envelope **only narrows**: it never gives an agent anything it did not have. A run is limited to the smallest of
what is left for the agent, its department and the enterprise. When the budget of a department or of the enterprise is
**reached**, new runs do not start (the delivery waits, the position shows *Blocked* with the reason) and you get **one**
notification for that envelope that day, not one per agent. An agent with no budget of its own, under a ceiling, gets at most **0.50 USD per run** (or its department's ceiling split
among its reports, if lower): the run is **cut** there, so siblings run side by side; when the last of an envelope is fully
held, a run waits and starts when room is back. Give an agent a budget of its own to lift that per-run limit. A key or a domain that an agent holds beyond a narrowed list is
flagged in the chart; the server never edits an agent itself, you remove it. Widening an agent beyond its envelope is
refused.

**Budget warnings**: when the agents' own daily budgets add up to more than the ceiling of their department (or of the
enterprise), the settings show a warning with the sum and the ceiling. **Split the ceiling** gives each agent of a
department an equal share (rounded down to 0.05 USD a day). **With a Claude subscription**, the amounts are
**estimates at API prices**: the real limit is your subscription's quota, not these dollars.

**Shared keys** (settings): vault keys given to **every occupant** of the enterprise on top of its own. They are still
filtered by the department and enterprise key envelopes (they never widen one), and never reach a position that runs
outside code, nor a front desk turn. An **import resets** them to none.

**Positions that run outside code**: switch **Runs code from outside** on a position (for instance one that builds
the pull requests of strangers). Its agent must be **protected (sandboxed) and hold no key**: seating an unfit agent is
refused with the reasons (*it is not protected*, *it holds keys*), and deliveries to an occupant that became unfit
**wait**: the position shows *Blocked* with the reason. On such a position **every run** (its triggers, its schedules,
your chat with it, not only the deliveries) is forced to **sandbox with no key**, and the agent's keys and sandbox
cannot be changed while it holds the seat (the change is refused). An agent hired from a protected requester or for
such a position is protected. The position panel warns when this server cannot run protected agents (sandbox not
available).

**Departments** (settings): a branch of the chart with its own envelope and notes, and overrides of some settings
(shown as *Same as the enterprise* when not overridden): communication, who may be written to, workers, autonomy,
escalation timeout and spending threshold. Nothing else can be overridden (the server refuses it), and trust along
the chain is enterprise-wide.

## Who may talk to whom

The **Communication** setting decides how agents of the enterprise may write to each other:

- **Strict**: an agent writes only to its lead and its reports.
- **Leads** (default): leads can also write to each other.
- **Open**: also the **pairs you list** (one per line, two position ids).

A refused message says who to go through. Agents outside the enterprise, and [groups](agent-groups), are not affected.

## Trust along the chain

Normally a message from another agent is **outside text**: the receiving run asks before every risky action (unless
the agent trusts outside events). Inside a chart this would send you a card for almost every delegated step.
**Trust along the chain** (setting, **off by default**) changes that: a task whose **whole chain is clean** (it
started from your words or a schedule, and no run in the chain was started from outside) reaches the receiver as an
order from its lead. One outside-started run **anywhere** in the chain keeps everything after it outside text, and the
mark is set by the server, never by an agent. Hand-ins going up are always information for the lead, never orders.

In a clean chain, **reports from the team** (hand-ins, blockers, escalations, requests, meeting replies) are not
outside text either: the receiver gets them in its normal prompt, framed as information, so its run does not need your
approvals. An item that carries an outside mark keeps today's behaviour, and a batch that mixes both is split so the
outside items run alone. The read-only commands `maxxing enterprise show`, `profile` and `tasks` never wait for
approval, even in a run started from outside; run them alone on their line (no pipe), so they match.
Leave it off if you do not need it: it relaxes a safety default.

## Who is doing what

- **Right now**: a strip under the header of an enterprise shows who is working, waiting, blocked or has deliveries
  queued, on which task and since when, with a link to the agent.
- **Tasks** tab: the tasks agents delegated to each other, grouped as *To do*, *In progress*, *In review*, *Blocked* and
  *Done*, with owner, requester, age, last move, hand-overs (**Hops**), an **Outside content** marker and a link to the
  run. Filter by position.
- **Delegations** card, on the page of a seated agent: the tasks it asked for, with their live state (waiting in the
  inbox, working, handed in, blocked, in review).

## The digest, reports and the Overview

- **Daily digest**: once a day (setting: hour, 8 by default), one short message on what happened, per department: done,
  next, blocked. The server collects the facts without Claude; **one** short call writes the text, charged to the
  enterprise. Nothing new means no call and no message; budget reached means the raw list is sent. Options: **One per
  lead** (each lead also gets its team's digest) and **Titles only** (one line per item).
- **Weekly report** (Monday morning) and **Monthly report** (the 1st): objectives, blocked work, cost per department.
  Switch them on in the settings. A period missed because the server was down is built at the next opportunity.
- **Reports** tab: all of them, newest first, **Build now** to make one at once.
- **Overview** tab: what waits **for you** (requests to allow or deny, escalations to answer: only those whose decider
  is you), a line for what is still in progress with the leads, the **cost of the day** per department against its
  ceiling, tasks open, late and blocked, objectives and the latest digest. The dashboard card counts the same.

With [Telegram](telegram) linked, each enterprise gets **its own thread** (named after it, with a building emoji): the
digest, the cards that need you, and the answers you give there. Without topics, they arrive in the main chat with the
enterprise's emoji in front. The **Notifications** settings apply: set the source *Enterprises* to off or silent and the
digests and notes stay in the app (or arrive silently); a card that waits for your answer stays loud, like an approval.

The titles of notifications, Telegram cards and decision texts follow the **language of the server** (English or French); some message bodies and button labels stay in English.

## Workers

A position may need short-lived helpers ("resize these 12 visuals"). The **Workers** setting:

- **Discreet** (default): helpers live inside the agent's turn (Claude Code sub-agents). Nothing to manage.
- **Visible**: **temporary agents** you can see in the chart. You approve once a **worker template** per position
  (role, model, daily budget). A worker is always protected (sandbox, no key, no domain, no trigger), at most 5 live at
  a time, and goes to the Trash when its task is done or after 24 hours. You can stop one at any time. It never has more than its
  creator: it takes the occupant's rules, forbidden tools, approvals and permission mode, and counts in the department
  and enterprise budgets. A task it gets is outside text unless the whole chain is trusted. Deleting the enterprise or
  switching the feature off stops (retires) its workers.
- **Off**: no helpers.

## Front desk

The **front desk** is a position that answers people **outside** the company on a **public chat link**.

- It is always labelled **"AI assistant of <name>"**; you can add a label of your own, never remove the AI mention.
- It has no key, no domain, no folder and no tool but two: read the profile, and **route** a request to the right
  department. Its runs use the **default permission mode** and only `maxxing enterprise profile` and
  `maxxing enterprise route` are let through: every other tool call, shell command included, is denied (a check that
  applies whatever the agent's own settings allow). The server checks it each time a visitor writes: with a key, a domain, a writable folder, trust in outside
  events, Telegram on, or no daily budget or hourly run limit on its occupant, the desk answers *unavailable*. It routes, it does not solve: a refund request becomes a task for customer care, **marked as coming from
  outside**, so everything it triggers asks you first.
- **Going live is your decision**, and **needs every occupant of the chart to be protected** (sandboxed, so they cannot
  read what they should not) and **the desk's agent to be restricted** (no key, no domain, no writable folder, no trust
  in outside events, no Telegram, a daily budget and an hourly run limit). The Front desk settings list each position that is not
  ready, with what to fix and a link to open the agent; saving is refused until it is. The public link is an entry point without a session,
  so it ships **off**, with its own **rate limit** per visitor (20 messages an hour by default), a limit of 300
  messages an hour for all visitors together (and of 30 routed requests an hour), a limit on how often one visitor can
  read the page, a size limit per message (1,000 characters) and the agent's own limits. The **link to share** is
  `<your address>/desk/<token>`: a plain chat page (no account, no cookie, no outside script) that says it is an AI
  assistant, in the language of the server (English or French).
  A request the desk routes comes to the department's lead as coming from the front desk, never from you. It cannot be embedded in an iframe on another site: share the link itself. Regenerate the link to cancel
  the old one.
- **Retention**: conversations are kept 30 days by default (1 to 365) and you can delete any of them. They are never
  exported, and deleting one (or its retention running out; retention only runs while Enterprises is on) removes the visitor's text from the desk agent's sessions, its thread and its Claude Code transcripts. What stays: a request the desk routed lives on as a task for the lead and in the lead's inbox (the request text only, not the conversation around it); the log keeps no visitor text.
  Other positions receive summaries and themes only, never the visitors' words.

**Weekly insights**: once a week, one short call over the desk's conversations produces the questions most asked,
rising topics, pain points and what the profile could not answer. Unanswered questions come as **suggested FAQ
entries** in the Profile tab (accept with an answer, or dismiss), and the relevant leads get a task, marked as coming
from outside.

## Objectives

An objective is a sentence with an optional target and unit, a current value and an **owner position**; it can sit
under a parent objective (enterprise, department, position). Only its owner position updates the value; the weekly
report shows progress. Nothing is measured automatically.

## Export and import

In the enterprise's **Settings** tab (**Export and import**), **Download** exports the enterprise as a zip: chart, job
descriptions, departments, settings, mission, profile and shared files. It holds **no** grant, **no** agent path, **no**
key or domain list, no front desk conversation and no live public link: the desk comes back **off** with no link,
**trust along the chain** comes back off and approved worker templates are left out (listed as skipped). An import also
resets the shared keys, the top-decides switch, the autonomy, workers, communication (and who may write to whom) and digest / weekly / monthly switches, department overrides included, to their defaults (listed as skipped
when they were not): set them again if you want them.
**Import** (the same tab, or the **Enterprises** page) creates a **new** enterprise from a zip (a free name is chosen if
needed), with **vacant** positions and no linked project: link your projects, then hire or seat the agents. Files
that could not be kept are listed (a worker template to approve again, a file that looks like a secret). Agent
definitions found in the zip are kept in `files/imported-agents/` to hire from.

## Unlink or delete

- **Unlink a project**: refused while agents of that project hold positions, unless you choose **Unlink and vacate**
  (the positions become vacant; the agents, their runs and their sessions are not touched). Open tasks stay in Tasks as
  plain tasks.
- **Delete enterprise** (settings, danger zone): the folder goes to the **Trash** with its state. Agents, topics,
  sessions and files are untouched.
- A chart file that cannot be read (hand edit) shows **This enterprise has a problem**; nothing is saved over it until
  you fix the JSON, and agents keep running as plain agents.

## From the command line

`maxxing enterprise ...` does everything the page does (see the [CLI reference](cli-reference)). The structure
commands are **yours**: an agent never changes the chart, its settings or its grants.

| Who | Commands |
|---|---|
| You | `create`, `link`, `unlink`, `position add\|move\|seat\|vacate\|remove`, `settings`, `grant`, `report`, `decisions`, `export`, `import` |
| An agent, as its own position | `show`, `profile`, `tasks`, `assign`, `done`, `block`, `escalate`, `answer`, `request` (with `request hire`), `decide`, `review`, `meeting start\|reply`, `objective set`, `worker`, `report-to-owner` (top position only), and `route` (front desk) |

You can run the agent commands too, with `--as POSITION`, to test a flow. The `maxxing-enterprises` skill lets Claude
set a chart up from a conversation.

## Tips

- If agents hold a broad GitHub key, **protect `main` with a GitHub ruleset** (pull request required, no direct push)
  so that nothing reaches it without a merge you control.
- For real separation, give the agents **a dedicated GitHub account** instead of yours.
- To deploy after a merge when your Dokploy panel is private, add a **watcher job** that checks the repository and
  triggers the deployment, since a webhook cannot reach the panel.

## Safety in short

- The enterprise only **narrows and routes**; it grants nothing. Keys, domains, folders and sandbox stay yours.
- The server enforces ceilings, cycles, depth, hand-over limits and who may run which command; a prompt never does.
- Tool approvals and safety requests are always yours. Anything born from outside text is decided by you.
- Agents delegate only to their direct reports and never edit the chart or each other.
- The front desk is off by default, labelled as AI, protected, rate limited, and its tasks are marked as outside.
- Switch **Enterprises** off in Settings -> Features at any time: no enterprise code runs, your files stay.
