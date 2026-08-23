## Backlog

Work is tracked in the Notion database **<Backlog Name>** — see [.claude/rules/notion-tickets.md](rules/notion-tickets.md).

**`/go` runs one iteration**: it takes the highest-priority `todo` ticket, implements it on a branch, opens the pull request, reports on the ticket page in French, and hands it over for review. The procedure is [.claude/skills/go/SKILL.md](skills/go/SKILL.md); it loads only when invoked. Pass `--auto-merge` to carry on through the merge instead of stopping at the handover.

**`/go-auto` runs the same iteration unattended**, in an isolated context, always through to the merge — it is the one meant for chaining with `/loop`, and only its final report comes back. It cannot ask you anything, so it never splits a ticket on its own: it stops and says where it would have cut. See [.claude/skills/go-auto/SKILL.md](skills/go-auto/SKILL.md).

Only the user starts an iteration, either way.
