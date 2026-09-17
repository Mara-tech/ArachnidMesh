# Framing

**What the project is built from, in order of authority:**

1. **Framing documents and specifications** — what is needed, what the owner wants, what was decided,
   what the product does.
2. **Automated tests** — they prove the specifications hold, and they outlive the code.
3. **The code** — the least precious of the three, since it can be rebuilt from the other two.

When two of them disagree, the higher one wins. A disagreement is a defect to fix or a question to
ask, never something to smooth over silently.

**How much of this a project keeps is its own call.** A weekend prototype may stop at a list of needs;
a product meant to live for years, and maybe be rebuilt, keeps all four levels below. A missing
document is not a defect. What is one: deciding in the code, in passing, what a missing document would
have made someone decide on purpose — when a ticket hits such a question, ask.

## Four levels, four kinds of statement

Each level says one kind of thing, and **mixing them is the mistake this rule exists to catch**. Every
entry has a stable identifier: never renumbered, never reused once removed, cited by ID rather than
restated. Written in the repository language, like every committed document — see
[language.md](language.md).

| Level | File | Says | Never says |
|---|---|---|---|
| `NEED-n` | `docs/needs.md` | who lacks what, why it matters, ranked by value | how to answer it |
| `PREF-n` | `docs/preferences.md` | how the owner wants the product to look and behave | why it is built that way |
| `ARCH-n` | `docs/architecture/` | how it is built, which options were weighed, why this one | what the user sees |
| `<AREA>-n` | `docs/specs/<area>/` | what the product does: behaviour, rules, data | classes, libraries, frameworks |

A project that keeps these elsewhere edits this table, not the principle.

### NEED — a problem, not a solution

A need names a user, what they lack and what it costs them today. **The test: could two very
different solutions answer it?** If only one fits, it is a preference or an architecture choice
dressed as a need — ask « why? » until the answer is a cost or a problem, not a means.

- ❌ « a mobile app with notifications » → ✅ « members miss the deadlines they agreed to, and learn it
  too late to react »
- ❌ « a real-time dashboard » → ✅ « a lead cannot tell where the team stands without asking each one »

Nothing said is thrown away: the solution that came with it is recorded as a preference. The rank is
the order of value, **not the delivery order** — a low-ranked need can still weigh early on the design
(offline access, permissions), and the document says so.

### PREF — what the owner wants

A preference may name a product, a platform, a colour, a gesture: it records a choice as it was
expressed. Each has a level — **Firm** (departing from it is a question, not a decision), **Leaning**
(the default, open to a good reason), **Nice to have** (never at the cost of something firm). It cites
the needs it serves, or says plainly that it is taste.

### ARCH — the one place implementation is decided

Each decision has a status — **Proposed**, **Leaning**, **Decided**, **Superseded** (with the ID that
replaces it) — cites the needs and preferences it answers, and keeps the options it set aside with
the reason. A choice that needs measuring gets a measurement, not an intuition.

### Specifications — behaviour, not implementation

What the user sees and does, the rules, what the data means. A specification that names its
implementation does not survive the rewrite it exists to guide. It restates the preferences it relies
on as behaviour and cites them. **What is undecided is written as undecided**: an open question left
visible is cheaper than a guess that later reads as a decision.

## Who decides

**The owner of the project.** The agent drafts, questions, weighs options and recommends; the ranking
of needs, the level of a preference and a `Decided` status are the owner's. Writing any of them on the
owner's behalf, for lack of someone to ask, invents a decision.

## How they are used

- **Specification first.** A change of behaviour no specification describes starts by writing or
  amending it, in the same pull request and before the code.
- **Code that contradicts a specification is a bug in the code.** Fix the code.
- **A specification that is wrong is changed explicitly**: the pull request says which rule changed
  and why — never adjusted quietly to match what the code happens to do.
- **A bug fix checks the specification**: if the case was not covered, the fix adds the rule.
- **Tests cite the rule they protect** (`<AREA>-n`), in their name or right next to it, and test
  behaviour through public boundaries — a test that dies with the code it tested failed at its job.
- **A ticket cites the IDs it serves** — the need, the rules it delivers — rather than copying them.
