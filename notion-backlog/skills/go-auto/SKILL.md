---
name: go-auto
description: Run one backlog iteration end to end in an isolated context — the same procedure as /go, taken through the merge without stopping for review. Built for chaining with /loop.
context: fork
background: false
disable-model-invocation: true
---

# One backlog iteration, unattended

Read [.claude/skills/go/SKILL.md](../go/SKILL.md) and execute it **in `--auto-merge` mode**, plus
whatever else is in `$ARGUMENTS` — `--max-review-passes=N` stays adjustable at the invocation.

That file is the procedure. This one only says what running in an isolated context changes. It is not
a second procedure, and nothing in it may contradict the first: if the two ever disagree, `/go` wins
and this file is the one to fix.

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
in the conversation language, and make it enough to reconstruct the run without opening anything:

- the ticket taken, and the reading you acted on;
- the pull request, and the verdict of every check;
- the review triage: fixed, ticketed with their IDs, rejected with the reason;
- whether the iteration merged or stopped, and on which hard stop if it stopped;
- the tickets created, each with its priority and the remark that explains it;
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
