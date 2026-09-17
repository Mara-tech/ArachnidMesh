# Writing a ticket

> 🤖
> This page says **how a need expressed in plain language becomes a workable ticket**. Its first
> reader is whoever formalises the need and creates the page — human or agent; its second is whoever
> will pick that ticket up weeks later, knowing nothing of the conversation that produced it.
> It is **shared by every backlog** in this space and assumes nothing about the domain: it holds for
> a code project as much as for any other work that gets taken off a queue.

## How the backlog is used

A backlog here is not a wish list, it is **a queue**. It is worked off **one task at a time, by
decreasing priority**: whoever executes takes the highest-priority `todo` ticket whose dependencies
are all `done`, moves it to `in progress`, carries it through, reports in the body of the page, then
moves it to `review in progress`. Moving a ticket to `done` belongs to the human reviewer, never to
the executor. One task is open at a time: there is no parallelism to spread, only an order to
respect.

Four consequences, and they govern everything else on this page:

- **A ticket is read alone.** Whatever was said that matters has to be written in the ticket, or it
  is lost.
- **Priority is a position in the queue**, not a mood. Writing a ticket means deciding what comes
  before it and what comes after.
- **One ticket, one delivery.** What cannot be finished in one pass is not a ticket, it is two.
- **Writing a ticket does not start it.** The role of whoever formalises stops at creation, in
  `todo`. Starting an iteration belongs to the owner of the backlog.

## Before writing: read the database schema

- **The properties described below are the common model, not a guarantee.** A database may hold
  fewer, or hold others, and may name them in another language. Read the real schema of the target
  database before creating anything, and write only into properties that exist.
- **Never invent a list value** (`select`, `multi-select`). Take an existing option; if none fits,
  say so and ask for one to be added. An option created on the fly fragments the database silently,
  and nobody notices until the first filter that misses.
- **Check that an equivalent ticket does not already exist**, searching on the words of the need and
  not on its presumed title. If it exists, complete it — do not create a second one.

## The properties

| Property | Required | What it carries |
| --- | --- | --- |
| `Titre` | Yes | The expected outcome, in one sentence that reads on its own |
| `Statut` | Yes — `todo` | The position in the life cycle. Always `todo` at creation |
| `Priorité` | Yes | A number. The largest comes off the queue first |
| `Genre` | Yes, if the database has one | What the ticket is: feature, fix, deployment… |
| `Description` | Yes | The self-contained ticket: observation, consequence, Definition of Done |
| Page body | As soon as there is detail | The analysis, the options dropped, the references. Later receives the execution report |
| `Dépend de` | If and only if blocking | The tickets that must be `done` — or `cancelled` — before this one can start |
| `En rapport avec` | Optional | Same ground, no ordering constraint |
| `Tags` | Optional | Something to filter on. No tag beats an approximate tag |
| `Version` | Optional | The milestone aimed at — leave empty if the database tracks none |
| `Commentaires` | Optional | One line of synthesis, at most. Never a report |
| `ID`, `Créé le`, `Modifié le` | Automatic | Managed by Notion — never write into them |

### Titre

A short sentence saying **the expected outcome or the observed fact**, not the activity to carry
out. It has to be understandable on its own in a list view, without opening the page.

- ❌ "Improve the export" → ✅ "The CSV export drops accented characters"
- ❌ "Budget meeting" → ✅ "Settle the Q4 travel budget"

No number and no prefix in the title: the ID is already a property, and a prefixed title goes out of
sync the day things are reordered. **A ticket is then designated by its ID**, never by its title — in
other tickets, in reports, in comments: a title gets reworded, an ID does not.

### Statut

At creation, **always** `todo`, without exception. A ticket created straight into `in progress`
leaves the queue without anyone having taken it: it will never be worked off, and it will not be
seen.

What follows does not concern whoever writes: `in progress` and `review in progress` belong to the
executor, `done` to the reviewer.

`cancelled` is the only other exit from the queue, and it belongs to the **owner of the backlog**: a
ticket goes there when the need is gone — obsolete, arbitrated otherwise, or absorbed by another
ticket. Neither the executor nor the reviewer puts it there, and never because the work turned out
harder than expected: that is a ticket to split, not to cancel. Say in `Commentaires` what made it
moot, and the ID of whatever replaces it if something does — without that sentence, a cancellation is
indistinguishable from a ticket someone gave up on.

### Priorité

A number, **the largest goes first**. It is the only order of the queue: nothing else — not the
creation date, not the ID, not the felt severity — decides what comes out first.

Setting a priority means answering a concrete question: **between which two existing tickets does
this one go?** You read the neighbouring priorities and place yourself between them.

- **Leave gaps.** A step of 100 between two tickets lets you insert later without renumbering
  anything. A step of 1 forces a shift on the very first insertion.
- **Do not duplicate an existing priority**: two tickets level with each other leave the order to
  chance, and chance will land on the one that is blocked.
- **Announce the choice.** Priority is the backlog owner's call: propose it with your reason in one
  sentence, do not impose it. When it is debatable, say so in the body of the page.

### Genre

What the ticket **is**, not what it touches — that is what `Tags` are for. `Genre` often triggers
machinery downstream (on a code project, the branch prefix, for instance), which is why it has to be
taken from the existing options.

If the need fits no genre, it usually means it is not a ticket yet: it is an idea, a question, or
three tasks tangled together.

`cadrage` — framing — has a place of its own: the ticket delivers neither a feature nor a fix, but
documents and decisions: the needs, the preferences, the architecture, the specifications. Its
material is the project owner's answers; it is carried out with them, and its Definition of Done
carries their validation.

### Tying the ticket back to the framing

When the project keeps framing documents, **a ticket cites the identifiers it serves** — `NEED-3`,
`PREF-7`, `ARCH-2`, the specification rules it delivers — rather than copying their content. A copy
diverges as soon as the original changes; an identifier does not.

And do not confuse the two while writing: **a need says what is missing and why, never how to answer
it.** "A mobile app with notifications" is not a need, it is a preference; the need is behind it —
"members learn too late about the deadlines they agreed to". When a ticket is born of a solution, go
back up to the need before writing it.

### Description

This is **the ticket itself**, the one you must be able to read without opening the page. Three
things, in this order:

1. **The observation** — the observable fact, with its reference and the date it was verified. Not
   "it seems that", not "we think that": what was seen, and where.
2. **The consequence** — what it costs today, or what it unlocks tomorrow. This is what justifies the
   priority, and it is what is missing most often.
3. **The Definition of Done** — see just below.

Two rules that hold everywhere but that are decided here:

- **What is verified and what is assumed do not mix.** "Measured on 12/03 over the last three
  exports" and "it has probably always been the case" are not the same sentence, and whoever
  executes has no way of sorting them out again.
- **An unsettled arbitration is announced on the first line**, with a ⚠️. Without that, the ticket
  will be taken for an executable task, and somebody will settle it alone, in passing, without
  knowing they were settling anything.

### The Definition of Done

A list of checkboxes. Each one describes **a state observable by somebody other than the author**:
one must be able to answer yes or no without discussion.

- ❌ "Improve the readability of the report" → ✅ "The report fits on one page and every figure cites
  its source"
- ❌ "Fix the bug" → ✅ "An export containing accented characters is read back identical; the check
  fails before the fix and passes after"

Put in it as well **what is deliberately out of scope**, whenever the temptation is predictable: "no
change to the interface in this ticket". That is what stops a ticket from growing along the way until
nobody can read it.

The boxes **are ticked as the work goes**, by whoever executes, and only when it is true: an unticked
box is the honest signal that something is left, a ticked box is a claim the next person will believe
without checking again.

> 🎯
> **A Definition of Done you cannot manage to write is the sign of a need not yet understood.** That
> is the moment to ask the question — not afterwards, once the work has been done in the wrong
> direction.

### Page body

`Description` carries the condensed ticket; the body carries everything that does not fit in it and
would otherwise be lost. A layout that works:

- **The observation** — the facts in detail, their references (file, document, screenshot, source),
  the date they were verified.
- **To do** — the substance, without imposing a solution that has not been decided.
- **Definition of Done** — when it is too long for the property.
- **Out of scope** — what the ticket deliberately does not do.
- **Priority** — the position chosen and why, when it is not obvious.

The body then receives **the execution report**, at the end of the page — what that carries has its
own section further down. Do not fill it in when creating the ticket: it belongs to whoever executes.

### Dépend de, En rapport avec

`Dépend de` is **blocking**, and nothing else goes in it: the ticket cannot start as long as the
target is not `done` — or `cancelled`, a cancelled dependency blocks nothing any more. "It would be
more comfortable afterwards" is not a dependency.

> ⚠️
> **Consistency rule:** a ticket must never have a priority **higher** than a ticket it depends on.
> The queue is worked off on priority alone — a blocked ticket at the head of the queue is an anomaly
> that costs whoever takes it a round trip, and that forces the backlog to be reordered before any
> work can happen.

`En rapport avec` links two tickets that touch the same ground, with no ordering constraint. It is
what you use when you hesitate: **when in doubt, non-blocking** — a wrong link costs one reading, a
wrong dependency blocks a queue.

### Tags, Version, Commentaires

- **Tags**: something to filter on later. Only set them if they are true and useful; do not repeat
  the `Genre` in them.
- **Version**: to be filled in only if the database really tracks versions or milestones. Empty beats
  invented.
- **Commentaires**: one line of plain text, the pointer to the deliverable in progress and its state
  (the pull request link, for instance), one sentence of synthesis at most. Anything beyond one
  sentence goes in the body of the page, where it is readable.

## One ticket, one delivery

Four signs that two tickets are being written as one:

- the Definition of Done holds an "and" between two independent outcomes;
- one half is blocked by a decision, the other is not;
- the two halves could be delivered weeks apart without getting in each other's way;
- two unrelated observations are needed to justify the ticket.

In those cases: two tickets, linked by `Dépend de` if the order matters, by `En rapport avec`
otherwise.

Likewise, **what you discover while writing a ticket and that does not belong in it becomes its own
ticket**, right away. A remark slipped into the body of a page is lost; a ticket comes off the queue.

## Tickets that are decisions

Some needs are not executable: they wait on an arbitration that whoever writes has no business
making. They stay tickets — but they say so on the first line, and their Definition of Done bears on
**the decision**, not on the implementation:

- [ ] The options are laid out with their real cost, quantified on this project
- [ ] A recommendation is made, honestly saying what is not certain
- [ ] The project owner has decided
- [ ] The chosen option is implemented — and not before the arbitration

## The execution report

A ticket does not end when its Definition of Done is ticked: it ends when the body of its page says
**what happened**. This part belongs to whoever executes, and it addresses somebody who has neither
the conversation, nor the work, nor the hesitations — often the same person, months later.

It is written **on the day of delivery**: reconstructed three weeks later, it has already lost what
made it valuable. It opens with its date ("Done on YYYY-MM-DD") and goes at the end of the body,
under the original content: the ticket then reads in the order it was lived.

What a good report carries, from the most precious down:

- **The arbitrations made** — the decision, **the option dropped, and the reason for dropping it**.
  It is the only thing nobody can reconstruct afterwards: the outcome can be read in the deliverable,
  the path cannot. When a decision is reversible, say under which condition it flips — that is what
  saves having the debate again instead of noting that the condition is met.
- **The observations made in passing and not dealt with** — what was seen and deliberately not fixed:
  why it is inconsequential today, from when it will bite, and **the ticket that now carries it**. An
  observation without a ticket is an observation lost.
- **The evidence, with its figures** — what was verified and *how*. "Before: X, after: Y" can be read
  again; "clearly improved" cannot. And when a check was itself put to the test — something it
  watches was broken on purpose to see whether it would fall — say so: that is the difference between
  a check and a check that serves.
- **The reservations** — what the delivery does **not** prove: a case not covered, a check that
  freezes current behaviour for want of a written rule, a verification you did not know how to do. A
  written reservation costs one sentence; discovered later by somebody else, it costs an
  investigation.
- **The structural choices** — where the thing was put, and why there rather than elsewhere. The next
  person who wants to move it will know what they are breaking.
- **The side effects** — the small changes made along the way and their reason. Those are the ones
  nobody can explain six months later.

Two things that have no place in it:

- **the chronological narrative** — what was tried and then abandoned only matters if the abandoning
  was a decision;
- **self-assessment** — "clean work", "well covered": neither verifiable nor useful. The figures and
  the reservations carry the judgement, and they carry it better.

> ⏳
> **The report is the only place where the "why" survives.** The deliverable shows what was done, the
> history shows when — but the reasoning that produced the decisions leaves no trace anywhere else.
> What is not written there is lost, and it is generally exactly what the next person will come
> looking for.

## Template

```markdown
Titre        : <the expected outcome, or the observed fact>
Statut       : todo
Priorité     : <between ticket X and ticket Y>
Genre        : <an existing option of the database>

Description  :
  ⚠️ <only if an arbitration is still to be made>

  <Observation: the observable fact, its reference, the date it was verified.>
  <Consequence: what it costs today, or what it unlocks.>

  ## ✅ Definition of Done
  - [ ] <a state observable by a third party>
  - [ ] <…>
  - [ ] <what is deliberately out of scope>

Page body :
  ## The observation   <the facts in detail, with their references>
  ## To do             <the substance, without imposing an undecided solution>
  ## Out of scope      <what the ticket deliberately does not do>
  ## Priority          <the position chosen and why>
```

## Before creating the page

- [ ] The real schema of the database has been read; no list value has been invented
- [ ] No equivalent ticket already exists
- [ ] The title says the expected outcome and reads on its own
- [ ] `Statut` = `todo`
- [ ] `Priorité` set against the neighbouring tickets, no duplicate, never above a dependency
- [ ] `Genre` taken from the existing options
- [ ] The `Description` is self-contained: observation, consequence, Definition of Done
- [ ] Every box of the Definition of Done is verifiable by a third party
- [ ] What is verified is told apart from what is assumed
- [ ] Unsettled arbitrations are announced at the top, with ⚠️
- [ ] `Dépend de` holds nothing but blocking tickets
- [ ] The ticket reads without the conversation that produced it

> 🧭
> **The final test.** Read the ticket again and ask whether somebody who was not there can pick it up
> in three months, know what to do, and know when they are finished. If the answer is no, what is
> missing is almost always one of two things: the verified observation, or the Definition of Done.

---

`arachnid-mesh:writing-a-ticket:v1` — this page ships with ArachnidMesh and the wizard rewrites it in
place when a newer version ships. Edits made here are replaced on the next update, so anything
specific to one project belongs in that project's rules rather than on this page.
