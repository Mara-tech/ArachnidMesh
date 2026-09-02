---
name: go
description: Run one iteration of the Notion backlog — take the highest-priority todo ticket, or the one named with --ticket=<id>-n, split it first if it is too big to deliver in one pass, implement it on a branch, open the pull request, report on the ticket page, hand it over for review, and close it once the pull request is merged. Accepts --auto-merge to carry on through the merge instead of stopping at the handover, and --max-review-passes=N to cap the fix passes over the review comments.
disable-model-invocation: true
---

# Run one backlog iteration

One invocation is **one ticket, taken to review**. Never run two at a time; if an iteration is
already open, say so and stop.

Facts about the backlog — database, language, what this repository adds — are in
[.claude/rules/notion-tickets.md](../../rules/notion-tickets.md), already in context. How a ticket is
written is the Notion page it links to, « Rédiger un ticket »; steps 4 and 11 need it.

**This file holds the decisions; the git and CI mechanics are next to it**, in
[references/pull-request.md](references/pull-request.md) — cutting the branch safely, pushing without
landing on the base branch, waiting for the checks, collecting the review, merging and cleaning up.
Steps 5, 7, 8, 9 and 13 send you there. That file is the same on every project and contains nothing
to fill in.

<!-- arachnid:setup-only -->
## What this file needs before it runs

This skill is a template. The four values below are **the only thing to fill in**, once, when the
skill is copied into a project — [skills/README.md](../README.md#how-to-set-this-up) walks through
it. Everything else, `references/` included, is copied as it is.

| Placeholder | What it is | Example |
|---|---|---|
| `<your-notion-database>` | the data source URI of the backlog | `collection://a1b2c3d4-e5f6-4789-abcd-0123456789ef` |
| `<your-main-branch>` | the branch pull requests target — the **base branch** the reference speaks of | `main` |
| `<your-local-checks>` | the commands that must pass before a push | `npm run lint && npm run typecheck && npm test` |
| `<your-coverage-command>` | the command that reports coverage, if the project has one | `npm run coverage` |

The installer strips this section once the values are in — a table that lists placeholders next to
the values that replaced them describes a state that no longer exists.
<!-- /arachnid:setup-only -->

**A placeholder still present when the skill runs is a setup that was not finished**: say which one
and stop. Guessing a value here means querying a database that is not the user's, or pushing onto a
branch that is not the base.

## 0. Read the invocation

`$ARGUMENTS` carries the flags. Read them first, and **say which mode is running before touching
anything** — an iteration that merges when the user expected a handover is not undone by an apology.

| Flag | Effect | Default |
|---|---|---|
| *(none)* | stop at the handover, step 12. The ticket waits in `review in progress` for a human | — |
| `--ticket=<id>-n` | take that ticket instead of the highest-priority one, step 1 | the top of the queue |
| `--auto-merge` | wait for every check, triage the review, fix, merge, set `done`, end on `<your-main-branch>` | off |
| `--max-review-passes=N` | ceiling on fix passes over review comments. `0` reads and records without fixing. **Ignored without `--auto-merge`** | `1` |

The name `--max-review-passes` deliberately avoids `--max-turns`: several CI setups already use that
one for a ceiling on *conversation turns*, an unrelated counter, and one word for two meanings is how
a repository starts lying to its readers.

Anything in `$ARGUMENTS` that is not one of these is not a flag to guess at: say what you did not
understand and stop, rather than running a mode nobody asked for.

## 1. Take the ticket

**Close out what is already finished first**, in two passes — the queue has to describe reality
before it can be trusted to name the next ticket.

**Pass one, the finished.** Any ticket sitting in `review in progress` gets its pull request read and
its status settled — step 13. A ticket whose pull request was merged is `done`, and leaving it open
makes the queue lag behind reality.

```sql
SELECT "userDefined:ID", "Titre", "Commentaires", url
FROM "<your-notion-database>"
WHERE "Statut" = 'review in progress'
```

**Pass two, the interrupted.** A ticket left in `in progress` is an iteration that died in flight —
plan quota exhausted, session closed, machine off. Step 3 sets `in progress`, and everything after it
can stop without warning. The query below filters on `todo`, so such a ticket is **invisible to it**:
without this pass the loop steps over the orphan and leaves it stuck for good, which in an autonomous
run happens once and is never noticed.

```sql
SELECT "userDefined:ID", "Titre", "Commentaires", url
FROM "<your-notion-database>"
WHERE "Statut" = 'in progress'
```

For each one, look for its branch (`git branch -a --list '*<slug>*'`) and its pull request
(`Commentaires` carries it, and `gh pr list --head <branch>` confirms):

| What you find | What to do |
|---|---|
| no branch, no pull request | the work is lost — set the ticket back to `todo`, say so, and start step 1 again |
| a branch, no pull request | resume it at step 6, on that branch |
| an open pull request | resume it at step 8 |

**When in doubt, hand back rather than guess.** A half-finished ticket picked up wrongly costs more
than one returned to the user with a description of what was found.

Then take the ticket for this iteration. **Without `--ticket`**, the top of the queue:

```sql
SELECT "userDefined:ID", "Titre", "Genre", "Priorité", "Dépend de", "Description", url
FROM "<your-notion-database>"
WHERE "Statut" = 'todo'
ORDER BY "Priorité" DESC
LIMIT 1
```

**With `--ticket=<id>-n`**, that ticket instead of the top of the queue:

```sql
SELECT "userDefined:ID", "Titre", "Genre", "Priorité", "Dépend de", "Description", url
FROM "<your-notion-database>"
WHERE "userDefined:ID" = <n> AND "Statut" = 'todo'
```

by its integer, never the displayed `<id>-n` string, for the reason below. An empty result does not
mean the ticket does not exist — it means the ticket is not `todo`. Fetch it anyway, read its actual
`Statut`, and say which one: `done` and `cancelled` are finished and there is nothing to take;
`in progress` and `review in progress` are what the two reconciliation passes above exist to resume,
not a fresh start under a flag. Stop either way rather than guessing which the user meant.

Fetch the page to read its body, not just its properties: the Definition of Done and the details
live there.

**Every query above selects `userDefined:ID`, and it is an integer.** The column is Notion's
`auto_increment_id`, exposed to SQL as `INTEGER`, so a ticket is filtered by `= 33` — never by the
displayed `<id>-33`. The string form is not an error: it returns zero rows, which reads exactly like
« that ticket does not exist ». The ID is selected here because every later step designates the
ticket by it, and because `/go-auto --until` compares the top of the queue against its marker.

## 2. Check it can actually start

Read its `Dépend de` relation. Every ticket it points at must be `done` or `cancelled` — a cancelled
dependency stops blocking, since nothing is coming from it. Say when you cross one rather than
starting silently: a ticket resting on something the user has since dropped is often moot itself, and
that is the user's to judge, not yours.

If one is neither, **the backlog is wrong, not the ticket** — a blocked ticket cannot legitimately be
top of the queue. Treat it as the anomaly it is: raise the blocking dependency above it, tell the
user what you reordered and why, then restart at step 1 on the new top ticket. Do not start the
blocked ticket, and do not quietly slide down to the second-highest and say nothing.

**Under `--ticket=<id>-n`, that premise does not hold** — the user named this ticket deliberately,
priority order or not. A block there is not a backlog anomaly to fix: stop, name the dependency that
is neither `done` nor `cancelled`, and leave the decision to the user rather than reordering the queue
or falling back to the top ticket.

## 3. Claim it

Set `Statut` to `in progress`, and tell the user which ticket you took and what you understood of it
before writing any code. If the ticket is ambiguous enough that two readings give different work,
ask now — not after the branch exists.

## 4. Split it if it is too big — the user decides, not you

A ticket that cannot be taken to review in one pass is not a ticket to start bravely, it is a ticket
to split. « Rédiger un ticket » lists the signs that a ticket holds two; on this project, add these:
the Definition of Done cannot be honestly ticked by one coherent commit, the work spans layers that
would each want their own review, or an arbitration sits in the middle of the path.

**Propose, do not decide.** Say where the seam is and what falls on each side, then wait. The user
may refuse and ask you to attempt it in one pass — that is a legitimate answer, and the iteration
carries on at step 5 as if nothing had happened.

If the user accepts, and only then:

1. **Write the children** as « Rédiger un ticket » says — each one self-contained, each with its own
   Definition of Done. What the parent held is distributed between them, not copied into each.
2. **The children take the parent's place in the queue, in order.** The last child inherits the
   parent's exact priority; each earlier one sits one step above it. A parent at 100 split in two
   gives 101, then 100. They are therefore the next tickets to come out. `Priorité` is a number, not
   an integer counter: if a value above the parent is already held by a ticket still in the queue,
   use the gap (100.5) rather than a duplicate.
3. **Dependencies cascade.** The first child depends on the parent; every other child depends on the
   one before it. A chain, never a fan — it is what keeps the slices in the order they were cut.
4. **Re-point what depended on the parent.** Read the parent's `Est une dépendance de`: in each of
   those tickets, `Dépend de` loses the parent and gains the **last** child. This is the expensive
   step to forget — the parent goes `done` on the spot, so those tickets would look startable while
   the work they are waiting for has not begun.
5. **Close the parent.** `Statut` to `done`, `Commentaires` saying it was split and naming both
   children — the IDs spelled out — and a short note in the body saying why it was cut and what went
   where. Its Definition of Done stays unticked: it moved into the children. **This is the one
   `done` that does not follow a merge.**

Worked example, **PROJ-42** at priority 100 split in two:

| | `Priorité` | `Dépend de` | `Statut` |
|---|---|---|---|
| **PROJ-42**, the parent | 100 | unchanged | `done`, `Commentaires` naming the split into PROJ-66 and PROJ-67 |
| **PROJ-66**, first child | 101 | PROJ-42 | `todo` |
| **PROJ-67**, second child | 100 | PROJ-66 | `todo` |
| whatever depended on PROJ-42 | unchanged | PROJ-42 → **PROJ-67** | unchanged |

Then **restart at step 1**, which takes the first child — it is now the top of the queue. Say so
before restarting rather than after: the user agreed to a split, which is not the same as agreeing to
have the first slice implemented in the same breath.

## 5. Branch off `<your-main-branch>`

Always create a new branch from `<your-main-branch>`, never from whatever branch is checked out, and
create it **`--no-track`**:

```
git fetch origin && git switch -c <prefix>/<slug> --no-track origin/<your-main-branch>
```

`--no-track` is not a detail: it is what makes a later slip fail loudly instead of pushing straight
onto `<your-main-branch>`. Why, in
[references/pull-request.md](references/pull-request.md#step-5-cutting-the-branch). Step 7 sets the
upstream, once, to the right branch.

| `Genre` | prefix |
|---|---|
| feature | `feature/` |
| bug | `bugfix/` |
| déploiement | `chore/` |

`<slug>` is a short kebab-case summary, in the repository language — it is a repository name.

## 6. Implement

Code, tests and documentation in the same pass, under the conventions in `.claude/rules/`. The
ticket's Definition of Done is the contract: every box has to be genuinely checkable before the
ticket moves on. A partially done ticket stays `in progress` and says what is missing.

**Prove the tests bite.** Break the behaviour under test on purpose, watch the new test fail, restore
it immediately. A test that still passes against broken code is worse than no test, because it buys
false confidence. Note which passes you did — they go in the report.

Run `<your-local-checks>` before pushing. Finding a failure here costs one minute; finding it in CI
costs a round trip.

## 7. Commit, push, open the pull request

The user's standing authorization covers exactly this, for the ticket in progress: **commit, push,
and open a pull request against `<your-main-branch>`**. It covers nothing else — no merge, no direct
push to `<your-main-branch>`, no force-push, no branch deletion. Merging, and the branch cleanup that comes with it, happen
only on an explicit instruction — that is step 13, a separate authorization, never automatic. Under
`--auto-merge` that instruction was given at the invocation; without it, it has not been given at
all.

Commit message, branch name, PR title and PR body in the repository language — see
[.claude/rules/language.md](../../rules/language.md). The PR body links the Notion ticket.

Push with an explicit destination refspec, never a bare `git push`, and **read the push summary
before doing anything else** — it must name `<prefix>/<slug>`, never `<your-main-branch>`. The
command, and what to do if it named the base branch, are in
[references/pull-request.md](references/pull-request.md#step-7-pushing-without-landing-on-the-base-branch).

Two things on the ticket, in the same pass — a commit that lands without them leaves the backlog
describing a state that no longer exists:

- **Tick the Definition of Done boxes the commit actually satisfies**, where they live: the
  `Description` property on most tickets, the page body on the others. Tick what is true and nothing
  more — an unticked box is the honest signal that the ticket is not finished, and a ticked one is a
  claim someone will trust without re-checking.
- **Point `Commentaires` at the pull request**: one line, `PR #<n> <state> — <url>`, where
  `<state>` says in a word or two where the pull request stands — here, that it is open. It is
  written in the conversation language, and step 13 tabulates the five it can take. The line is
  rewritten from then on rather than appended to; step 13 keeps it current.

## 8. Wait for every check

Whatever the project has wired to a pull request runs here — a test suite, a build, a type check, a
linter, an automated code reviewer. How to wait for them, and how to tell a check that **judges**
from one that merely **advises**, is in
[references/pull-request.md](references/pull-request.md#step-8-waiting-for-every-check). A red check
that judges stops the iteration; a red advisory one only deprives you of an opinion.

What belongs here rather than there is what the reader of the ticket needs: **a repository with no
checks at all is a legitimate case**. There is nothing to wait for, nothing to triage at step 9, and
the iteration goes on — but it is written down, in the report and in the handover, as "nothing
checked this pull request". The distance between "nothing objected" and "nobody was asked" is exactly
what the reader needs and cannot recover afterwards. Under `--auto-merge` it matters twice over: no
human read the diff *and* no machine did, and the local run of step 6 does not fill the gap — same
tree, same machine, same agent.

Without `--auto-merge`, the iteration continues at step 10: the review comments, if any, are left for
the user.

## 9. Triage the review — `--auto-merge` only

Collect whatever landed on the pull request, from the advisory checks of step 8 or from a human who
commented early. Inline comments and pull-request-level ones are read separately, with the two
commands in
[references/pull-request.md](references/pull-request.md#step-9-collecting-what-the-review-left).

**Nothing came back is a possible outcome**, and it is not an approval: it is a missing opinion. Skip
to step 10 and write it there as an absence. Expect it on a second pass in particular: an automated
reviewer commonly skips a pull request that already carries one of its own comments, so a fix pass
often gets no new review at all. Note the absence and carry on — never wait for it as a condition.

Every remark lands in exactly one of three outcomes. **The criterion is written down on purpose**:
left to a feeling, "important" drifts from one iteration to the next, and nobody can tell afterwards
whether a remark was weighed or skipped.

| Outcome | When |
|---|---|
| **Fix now** | it contradicts a rule in `.claude/rules/`; **or** it shows a concrete failure path — inputs leading to a wrong result — in code this ticket touches; **or** it bears on a Definition of Done box this ticket claims to tick |
| **Ticket** | correct, but outside this ticket's Definition of Done. It goes through step 11 |
| **Reject** | the reviewer lacked context and the code is right as it stands. **Write the reason.** A silent rejection is indistinguishable from an oversight |

Then at most `--max-review-passes` fix passes. One pass is: fix, push, and wait for the checks again
at step 8. When the ceiling is reached, **whatever is still in "fix now" becomes a ticket** rather
than a blocker — the choice is deliberate, and it buys "nothing is lost" rather than "nothing lands
unreviewed". Say which of the two you are giving up, in the report and in the final message.

## 10. Report on the ticket page

Append to the **body of the Notion page**, in the conversation language — not the `Commentaires`
property.

What a report carries is on « Rédiger un ticket ». Two things that page cannot know about this
project, and they are the ones that get skipped:

- **the test results**: how many tests, in which files, and the proof that they bite (which
  behaviour you broke, which tests fell);
- **a coverage snapshot** from `<your-coverage-command>`: before → after, per touched file, plus the
  global figure. If the project measures no coverage, say that once — an absent section reads like an
  oversight, a stated absence does not.

Under `--auto-merge`, one more section — **the review and what became of it**. Without it, the merge
looks like an approval nobody gave:

- the remarks received, and from which check;
- what was fixed, and in which pass;
- what left as a ticket, **with the ticket's ID**;
- what was rejected, with the reason;
- and, if the review never ran, that it never ran.

## 11. Create the tickets the work revealed

Anything the work turns up that does not belong to this ticket becomes **its own ticket, immediately**
— a defect too large to fix in passing, an arbitration to be made, a module whose tests are thin, or
a deliverable that is itself a set of tickets ("define the backlog from spec files").

Write it as « Rédiger un ticket » says. **Say out loud what priority you chose and why**: a defect
that silently corrupts a save outranks a cosmetic cleanup.

A ticket born of a review remark **quotes the remark that produced it**. That sentence is what makes
its reason legible in six months, when the pull request has been merged and nobody remembers why the
ticket exists.

Do not fix them in passing. A ticket that grows sideways stops being reviewable.

## 12. Hand over

Give the user, in the conversation language:

- the pull request link and the ticket link;
- what was done and what was deliberately left out;
- the tickets created at step 11, with the priority chosen for each and why — and for each one born
  of a review remark, **the remark that explains it**;
- **the top of the queue as this iteration leaves it**: the ticket ID, its priority, and whether this
  iteration is what created it. One query, made once, that turns « do I run this again? » into a
  decision instead of a question;
- anything you are unsure about — this is the last moment where it is cheap.

**Without `--auto-merge`:** set `Statut` to `review in progress`. The iteration ends there; the ticket
does not, and step 13 closes it whenever the user gets to it.

**With `--auto-merge`:** do not stop here — step 13 runs now, in the same breath, and the handover
above is the account of an iteration already closed rather than one waiting on you.

## 13. Close the ticket when the pull request is merged

**Nothing polls.** The pull request gets looked at right after step 12, and at the start of the next
`/go` — step 1. Between the two, the ticket waits. `--auto-merge` does not add polling either: it
merges instead of waiting for someone else to.

**A merge is the only thing that makes a ticket `done`** — not a green CI, not a review that read
well, not the absence of comments. It reaches you three ways:

- **The user merged it themselves.** Read the state below and settle the ticket.
- **The user asks you to merge.** That explicit instruction — never your own initiative, never the
  standing authorization of step 7 — authorizes the merge and the cleanup below.
- **`--auto-merge` was passed.** The instruction was given at the invocation, and it covers this
  iteration only. Check the hard stops first.

**Hard stops. Under `--auto-merge`, any one of these cancels the merge**, and the iteration degrades
into the handover of step 12 — `Statut` stays `review in progress` and the user is told which stop
fired. They are mechanical on purpose: none of them is a judgement call that could be argued away in
the middle of an unattended run.

| Stop | How you know |
|---|---|
| a check that judges is not green | step 8 |
| the pull request cannot merge | `mergeable`/`mergeStateStatus` — a conflict is never resolved unattended |
| a **human** requested changes | `reviewDecision` is `CHANGES_REQUESTED`; an automated reviewer is advisory and does not count here |
| the Definition of Done is not fully ticked | the ticket is not finished, whatever the diff says |
| the push landed on `<your-main-branch>` | the anomaly step 7 tells you to watch for |

None of these is the "an important remark is still unfixed" case: that one was settled at step 9 — it
becomes a ticket and the merge goes ahead.

The commands — reading that state, merging, deleting the branch, coming back onto
`<your-main-branch>` — are in
[references/pull-request.md](references/pull-request.md#step-13-reading-the-state-merging-cleaning-up).

Then write the state back on the ticket. `Commentaires` keeps the shape step 7 gave it —
`PR #<n> <state> — <url>`, one line, rewritten rather than appended to — and only `<state>` moves.
**The shape is what stays constant, the wording is not**: `<state>` is written in the conversation
language, while `PR #<n>` and the link are what step 1 recognises the line by on the next iteration.

| The pull request is | `<state>` says | `Statut` |
|---|---|---|
| `OPEN`, no `reviewDecision` | that it is open | `review in progress` |
| `OPEN`, `APPROVED` | that it was reviewed and approved | `review in progress` |
| `OPEN`, `CHANGES_REQUESTED` | that the review requested changes | `review in progress`, and tell the user — this skill does not resume work on its own |
| `MERGED` | that it was merged | `done` |
| `CLOSED`, not merged | that it was closed without being merged | leave it, and ask the user what happened. `cancelled` only if they answer that the need is gone — never on your own reading of a closed pull request |

Before setting `done`, check the Definition of Done is fully ticked: a merged pull request under
unticked boxes means one of the two is lying, and it is worth one sentence to the user rather than a
silent tick.

**End on a fresh `<your-main-branch>`, ready for the next `/go`.**
