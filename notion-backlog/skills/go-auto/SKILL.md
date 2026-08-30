---
name: go-auto
description: Run one backlog iteration end to end in an isolated context — the same procedure as /go, taken through the merge without stopping for review. Accepts --until=<id>-n to keep chaining iterations until that ticket reaches the top of the queue. Built for chaining with /loop.
context: fork
background: false
---

# One backlog iteration, unattended

Read [.claude/skills/go/SKILL.md](../go/SKILL.md) and execute it **in `--auto-merge` mode**, plus
whatever else is in `$ARGUMENTS` **except `--until=<id>-n`, which is consumed here and not passed
on**. `--max-review-passes=N`, by contrast, goes through and stays adjustable at the invocation.

That file is the procedure. This one only says what running in an isolated context changes. It is not
a second procedure, and nothing in it may contradict the first: if the two ever disagree, `/go` wins
and this file is the one to fix.

## Who may start it

**An explicit user request starts this skill** — typed as `/go-auto`, or asked in words. **Never your
own initiative**: not because the backlog is full, not because the last iteration went well, not
because the next ticket is obvious and nobody is looking. The rule is in
[notion-tickets.md](../../rules/notion-tickets.md), and it governs *initiative*, not execution.

`/go` keeps `disable-model-invocation: true` and this skill does not, which is deliberate rather than
an oversight: `/go` is the interactive entry point, stopping at a handover for a human who is by
definition there to type it. This one is the unattended entry point, and an unattended run that only
a keystroke can start cannot be chained — which is the whole reason it exists. What guards the
initiative is the paragraph above, not the flag.

## `--until=<id>-n` — a marker, not a count

Without it, one invocation is one iteration, unchanged.

With it, the run becomes a **chain**, and the ticket named is the floor it stops at:

1. Run the top-of-queue query of `/go` step 1.
2. If the top ticket is the marker, **stop without taking it** and report. That is the success case,
   not a failure to find work.
3. Otherwise take that ticket through a full iteration, `--auto-merge` included, then go back to 1.

**A count would be the wrong instrument, and that is why this is a marker.** Step 11 of every
iteration creates tickets, and one of them can land above the marker; re-reading the queue before
each iteration takes those in too. That is the point rather than an accident to guard against —
« three iterations » stops short of exactly the work the chain was asked to absorb.

`--until` is consumed here and **never forwarded** to `/go`: step 0 of that skill stops on a flag it
does not recognise, and it is right to.

**The marker must be a startable `todo` ticket, not merely present.** The stop at 2 compares against
the query of `/go` step 1, which filters `WHERE "Statut" = 'todo'`. A marker in any other state never
surfaces there, so the stop never fires and the chain runs on down to « no startable ticket left » —
having merged the whole backlog unattended, which is the outcome this guard exists to prevent.
Existence is therefore the wrong thing to check.

Read the marker before the first iteration and stop without running anything unless it is `todo`.
Read it **by its integer** — `= 33`, not the displayed `<id>-33`; step 1 of `/go` says why the string
form is the dangerous one. Say which state you found — absent, `done`, `in progress`, `cancelled` —
because « I cannot find it » and « you closed it an hour ago » are different mistakes on the caller's
side. Stop too if it is already at the top: there is nothing above it left to absorb.

**Re-read its state at each turn of the loop, not only at the start.** A marker that leaves `todo`
mid-chain — cancelled, or closed by someone else — puts the chain straight back into the case above,
and the stop conditions below cannot tell it apart from an empty queue. Stop and say so.

The chain also ends on:

- **any hard stop of step 13** — it cancels the merge of the iteration that hit it, and the chain
  with it. One handed-over iteration is a result; chaining past it stacks unattended work nobody has
  read;
- **an iteration that stops for a split it may not make.** « There is nobody to answer you » leaves
  that ticket in `todo`, so it is still the top of the queue and still startable: the chain would
  re-read it, meet the same split, and spin there until the context runs out. It is not a step 13
  hard stop — those all presuppose a branch — so nothing else in this list catches it. End the chain
  and name the ticket that needs cutting;
- **no startable `todo` ticket left**, as under the stop conditions below;
- **the context running out.** The whole chain runs in one forked context and every iteration adds to
  it, so a long chain will meet that ceiling. Stop while there is still room to write the report, and
  name the ticket the chain reached — a chain that dies mid-iteration costs the restart that step 1
  of `/go` exists to reconcile.

## There is nobody to answer you

The context is forked: no conversation history, and no one to take a question mid-flight. Two steps
of the procedure assume an interlocutor, and they change here rather than being skipped.

- **Step 3 — what you understood of the ticket.** It stops being a question and becomes a line of the
  report. Write the reading you acted on, so a wrong one can be seen afterwards instead of being
  guessed at.
- **Step 4 — splitting a ticket that is too big.** A split is the user's decision, and that does not
  become yours because nobody is watching. **Do not split.** Stop the iteration, leave the ticket in
  `todo`, and say where you would have cut it and why. A backlog silently reorganised by an
  unattended run is worse than an iteration that did nothing.

Everything else runs unchanged, hard stops included: step 13 lists them, and any one of them cancels
the merge and turns the run into a handover.

## What comes back is all the user will read

Only the final report returns to the main conversation — the working context is discarded. Write it
in the conversation language, and make it enough to reconstruct the run without opening anything.

**Under `--until` the first five are per iteration**, one entry each, in the order they ran — a chain
of merged iterations reported as though it were one is a chain nobody can check afterwards.

- the ticket taken, and the reading you acted on;
- the pull request, and the verdict of every check;
- the review triage: fixed, ticketed with their IDs, rejected with the reason;
- whether that iteration merged or stopped, and on which hard stop if it stopped;
- the tickets created, each with its priority and the remark that explains it.

Then once, for the run as a whole:

- **the top of the queue as the run leaves it**: the ticket ID, its priority, and whether this run is
  what created it. Without that line, deciding whether to invoke again means repeating a query the
  run had already made — and under `--until`, it is also what says why the chain stopped where it
  did;
- what you were unsure about — there is no later moment to raise it.

## Chaining with `/loop`

`/loop` takes an **interval**, not a count: `/loop 30m /go-auto`. With no recognised interval it
self-paces, and the text becomes the prompt replayed at each wake-up — which is why `/loop 7 times
/go-auto` works, but through the language rather than through a parser.

**Stop the loop, rather than finding something to do**, when:

- no `todo` ticket is startable;
- everything left is blocked by pull requests that have not been merged — say so and stop. Do not
  fall back on a ticket whose dependencies are unmet: that is the anomaly step 2 describes, and
  reordering the queue to unblock yourself is exactly the silent reorganisation forbidden above;
- a hard stop fired. One handed-over iteration is a result; a loop that keeps going past it stacks
  unattended work on a branch nobody has looked at.

**Nothing here watches the plan quota.** No tool exposes it, and a threshold would not hold anyway —
what the next iteration will cost is unknown. An interrupted run is caught by step 1 of `/go`, which
reconciles tickets left in `in progress`. That is the guarantee: not that you will never be cut off,
but that being cut off costs a restart rather than a stuck ticket.
