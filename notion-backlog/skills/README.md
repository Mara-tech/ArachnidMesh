# What is a skill ?

A skill describes a set of actions that can be performed by an IA agent.
The **skill** differs from **rules** in the sense that the content is **not always** loaded in the context.
You can call the skill by using a command. For example, the below skill is used as soon as you type `/go` in your
prompt.

## `/go` skill

Run an iteration !
What it tells to the agent, in short :

    Get the top priority ticket from the Notion backlog, and work.

Default behavior will push and create a pull request. It should wait for the CI and the review if you configured them.

With option ``--auto-merge``, it will also merge the PR.

## `/go-auto` skill

Be ready to give max autonomy to the IA. Will you be confident enough ?
This is the `/go --auto-merge` which will run in sequence.
You better have a large plan 🤑, otherwise you can still use `/loop 3 times /go-auto` to chain 3 tickets in one prompt.

## How to set this up

Paths below are Claude Code's : `.claude/` at the root of your project, `skills/` and `rules/` inside it, and
`CLAUDE.md` as the file always loaded. Another agent will use its own names — the layout is the same, only the folder
changes.

> **The short way.** `npx @mara-tech/arachnid-mesh` does everything below — it copies the files, fills
> the placeholders in, grants the permissions `/go` needs, and writes the `CLAUDE.md` block. The steps
> that follow are the same procedure by hand, and they stay the reference for what the wizard does.

1. Create or locate the `.claude/` folder at the root of your project
2. There, create a `skills/` and a `rules/` folder
3. Copy `go/`, and if you want `go-auto/`, under your project's `.claude/skills/`.
   Copy `go/references/` along with it — it holds the git and CI mechanics, which are the same on every
   project and have nothing to fill in.
4. **Fill in the placeholders of `go/SKILL.md`.** The skill is a template — it describes the
   procedure, not your project — and it is written to stop rather than guess if one is left in.
   They are the only thing to edit, they are listed in one table at the top of the file, and there
   are four of them:

   | Placeholder | What it is | Example |
   |---|---|---|
   | `<your-notion-database>` | the data source URI of your backlog. Use [this tool](../tools/get_data_source_id.py) to find it | `collection://a1b2c3d4-e5f6-4789-abcd-0123456789ef` |
   | `<your-main-branch>` | the branch your pull requests target | `main` |
   | `<your-local-checks>` | the commands that must pass before a push | `npm run lint && npm run typecheck && npm test` |
   | `<your-coverage-command>` | the command that reports coverage. Leave it as is if your project measures none — the skill says so in its report instead of hiding it | `npm run coverage` |

   The section holding that table is fenced with `<!-- arachnid:setup-only -->`. Once you have filled
   the values in, delete it: a table listing placeholders next to the values that replaced them
   describes a state that no longer exists. The warning just under it stays — it is what makes the
   skill stop instead of guessing.
5. Copy `rules/*.md` (all files except for `README.md`) under your `.claude/rules/`, and have a look at
   the [README](../rules/README.md)
6. Add the `CLAUDE.md` fragments of what you installed: [claude-md/go.md](../claude-md/go.md), and
   [claude-md/go-auto.md](../claude-md/go-auto.md) **only if you installed `/go-auto`** — a `CLAUDE.md`
   announcing a command that does not exist sends the agent looking for it.
    1. Replace `<Backlog Name>` with the name of your Notion backlog
       you [should have created previously](../tools/README.md#how-to-set-this-up).
    2. Take a quick look at the paragraph, there might still be some links to adapt.

Then check nothing was missed. **Scan `.claude/` entirely and `CLAUDE.md` with it**, not just the
skills: three of the placeholders do not follow the `<your-…>` convention, and they live outside
`.claude/skills/` — `<Backlog Name>` in `CLAUDE.md`, `<TICKET_ID_PREFIX>` and
`<your-notion-database-url>` in `.claude/rules/`. This should print nothing:

```bash
grep -rnE '<your-[a-z-]+>|<Backlog Name>|<TICKET_ID_PREFIX>|<repo-language>|<chat-language>' .claude/ CLAUDE.md
```

`npx @mara-tech/arachnid-mesh doctor` runs the same check from the modules' own declarations, and
exits non-zero when something is left.

## The best of it
Log in your GitHub in Claude so you can start Cloud sessions using the `/go` skill, in order to go on with your project without code access (like from your smartphone).
