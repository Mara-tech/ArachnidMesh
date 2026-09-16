# ArachnidMesh

Harness helper and tips if you use AI agents for your projects.

## Install

From the project you want to equip:

```bash
npx @mara-tech/arachnid-mesh
```

One command, nothing to install globally. It shows what is already in place, lets you pick the
components you want, asks each question once, shows the diff, and writes only after you say yes.
The same command later updates what it installed — see [cli/README.md](cli/README.md).

Everything it does can also be done by hand: each module documents its own manual setup, and the
wizard automates that procedure rather than replacing it.

## Modules

### Notion backlog
Use Notion as your project backlog, and let a coding agent run one iteration at a time on it —
`/go` takes the top `todo` ticket, implements it on a branch, opens the pull request and reports back.

A new backlog does not start empty: its first tickets frame the project — the needs ranked by value
(`NEED`), the owner's preferences (`PREF`), the architecture choices (`ARCH`), then the specifications
that the rest of the backlog delivers. How far a project takes that is its own call.

How a ticket gets written is not left to taste either. The page that says so — « Writing a ticket » —
ships with the module, the wizard creates it in Notion, and it carries a version: the day it
improves, every project it was installed in is offered the newer one.

→ [notion-backlog/](notion-backlog/README.md) · manual setup starts at [tools/README.md](notion-backlog/tools/README.md)

### Code review
Coming soon 😉
