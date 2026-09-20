# The demonstration for the product owner

What `--with-demo` asks for, at step 7 of [SKILL.md](../SKILL.md): a **visual** account of what the
ticket changed, made for the person who asked for it. **Nothing in this file is filled in** — like
[pull-request.md](pull-request.md) next to it, it is the same on every project and is copied as it
is.

[SKILL.md](../SKILL.md) decides *whether* there is a demonstration and *when* it is prepared — before
the pull request is opened, so its body can link it. This file says *what* it is made of.

## Who reads it

**The product owner, not the reviewer.** Someone who knows what they asked for and wants to see it,
and who generally does not know what a branch is. Everything that follows is that one sentence
applied.

The technical account already exists and has its own readers: the diff, the checks, the report of
step 10. The demonstration does not repeat it, does not summarise it, and does not replace it.

## First, is there one to make?

**Plenty of changes lend themselves to no visual demonstration**, and saying so is a result rather
than a failure: a lock-file bump, a refactor with no behaviour attached, a CI workflow, a rule
written for the agent itself. Say it in one line — what changed, and why nothing is worth showing —
and carry on with the iteration.

What makes a demonstration worth building is that **something is now visible, or behaves visibly,
that did not before**. A screen, a produced document, an output a human reads, an error that used to
be cryptic and now is not.

The failure mode to avoid is the other one: a demonstration invented for a change nobody can see.
It costs the reader the trust they will need on the next one, when there is something real to look
at.

## Where it lives

Three forms, and the choice is worth one sentence in the handover rather than a coin toss:

| Form | When it is the right one |
|---|---|
| **A Claude artifact**, published online | the demonstration stands on its own and its value is that it can be handed to someone with a link — no checkout, no build, nothing to install. The common case |
| **In the repository**, the demonstration alone | it belongs with the code that produced it, or it needs the project's own data, assets or output to be honest |
| **In the repository**, the tooling that builds it | the same demonstration will be wanted again by the tickets that follow. Then what is committed is what *builds* demonstrations, and this ticket's is its first output |

The third is a real investment: it adds files the project will maintain. Take it when the reuse is
already visible in the backlog — the next tickets touch the same screen, the same report, the same
output — not on the hope that it might be. **When in doubt, build the demonstration and not the
tool**: the second ticket that needs it is the one that knows what the tool should be.

An HTML page is the usual shape in every one of the three — self-contained, opens in a browser,
survives being emailed. It is not the only one: an image, a short recorded sequence, a produced
document are all demonstrations if that is what the change made visible.

## Before and after, when there is one

**The most convincing demonstration shows both states** — what it looked like, what it looks like
now, side by side. It is what turns « it is done » into something the reader can check for
themselves.

It is not always available. A feature that did not exist has no before, and a before that has to be
staged elaborately is not worth the staging. Show the after alone rather than fabricating a
comparison, and say which of the two you are showing.

## What stays out

The demonstration is **visual and non-technical**. These belong to the conversation, the pull request
or the report of step 10 — and nowhere near it:

- the analysis of the ticket, the readings weighed, the approach taken;
- the state of the pull request, the branch, the checks — the reader generally does not know git, and
  what they would learn from a green tick is nothing;
- the questions the work raised, the arbitrations left open, the tickets created at step 11. They are
  handed over at step 12, to the user, in words;
- the test results and the coverage figures. They are the report's, and the report has its reader.

A demonstration that needs a paragraph of explanation to be understood is a demonstration to redo.

## Where the link goes

One link, in the three places the iteration already writes to:

- **the pull request body**, next to the Notion ticket link it already carries;
- **the report of step 10**, on the ticket page — this is where the product owner actually looks;
- **the handover of step 12**, in the conversation.

A demonstration that lives only in the working directory is one nobody will ever see: an artifact
carries its own URL, and a demonstration in the repository is reachable once the pull request is
merged. Say which of the two it is when you hand it over.
