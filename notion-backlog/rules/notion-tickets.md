# The Notion backlog

Work on this project is tracked in the Notion database **<Backlog Name>**, data source
`<your-notion-database>`
([open it](<your-notion-database-url>)).

**How a ticket is written in the Notion page
[Rédiger un ticket](<your-ticket-writing-instructions-notion-page>)**, next to the database:
every property, which ones are mandatory, when and how to fill the optional ones, how to place a
priority, how to write a Definition of Done. That page is shared by every backlog and it is the
authority — read it before creating or filling a ticket, and do not restate it here. What follows is
only what this repository adds to it.

Tickets are written and reported on **in French** — see [language.md](language.md). The code they
produce is in English.

## What this repository adds

- **A ticket is designated by its `<TICKET_ID_PREFIX>-n` ID, never by its title** — in other tickets, in reports, in
  pull requests, in any comment left in the code. A title gets reworded; an ID does not.
- **`Genre` decides the branch prefix.** The mapping is in the `/go` skill, at the step that creates
  the branch.
- **`done` follows the merge, or a split.** Exactly two things move a ticket to `done`: its pull
  request was merged, or **the user agreed to split it** and its content now lives in the children.
  Never a green CI, a review that read well, or an opinion that the work is finished.
  - Normally the user merges, and that merge *is* the review verdict.
  - Under `/go --auto-merge` and `/go-auto`, the skill merges, on an authorization given at the
    invocation. The verdict is then « whatever checks the project has, plus a triaged review », which
    is **weaker** — no human read the diff, and on a repository with no checks wired to its pull
    requests, nothing read it at all. Say which of the two it was, rather than letting a `done` imply
    someone looked.
- **`cancelled` is the user's call, never yours.** A ticket leaves the queue undelivered only because
  the user says the need is gone — obsolete, arbitrated the other way, absorbed by another ticket.
  Never cancel one on your own initiative, and never because it turned out to be harder than it read.
  Put what made it moot in `Commentaires`, with the ID of whatever replaces it if something does: a
  `cancelled` with no reason is indistinguishable from a ticket someone gave up on.
- **`Commentaires` carries the pull request**: its link and its current state, rewritten as that
  state changes. The `/go` skill has the wording.

## Running an iteration

The procedure — pick, branch, implement, PR, report, hand over — is the `/go` skill
(`.claude/skills/go/SKILL.md`). It loads when invoked, so it is not in context right now.

Two entry points, one procedure:

- **`/go`** runs it in this conversation and stops at the handover, leaving the ticket in
  `review in progress`. `--auto-merge` makes it go through to the merge.
- **`/go-auto`** (`.claude/skills/go-auto/SKILL.md`) runs the same thing in an isolated context and
  always goes through to the merge. It is the one meant for `/loop`; only its report comes back.

**Only the user starts an iteration, by typing `/go` or `/go-auto`.** Never begin one on your own
initiative, even when the next ticket is obvious and the backlog is right there.

Anything found along the way that does not belong to the ticket in hand becomes its own ticket rather
than a remark that gets lost, or a fix smuggled into an unrelated pull request.
