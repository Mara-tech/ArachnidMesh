## Backlog

Work is tracked in the Notion database **<Backlog Name>** — see [.claude/rules/notion-tickets.md](.claude/rules/notion-tickets.md).

**`/go` runs one iteration**: it takes the highest-priority `todo` ticket, implements it on a branch, opens the pull request, reports on the ticket page, and hands it over for review. The procedure is [.claude/skills/go/SKILL.md](.claude/skills/go/SKILL.md); it loads only when invoked. Pass `--ticket=<id>-n` to take that ticket instead of the top of the queue, and `--auto-merge` to carry on through the merge instead of stopping at the handover.

**An iteration only ever starts on an explicit request from the user** — typed as a command or asked in words. Never on your own initiative, even when the next ticket is obvious and the backlog is right there.
