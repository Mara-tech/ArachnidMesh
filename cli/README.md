# arachnid-mesh

Installs and updates agent tooling — skills, rules and the permissions they need — into a project.

```bash
npx @mara-tech/arachnid-mesh
```

No global install. Run it from the project you want to equip.

## What a run looks like

1. **State** — what it found: the project, its git branch, and what is already installed.
2. **A verb** — Install, Update, Configure, Remove or Doctor. With nothing installed yet, it goes
   straight to Install.
3. **Components** — a multi-select grouped by module. Dependencies tick themselves and are locked,
   so you see why they are there.
4. **Questions** — the union of what the selected components need, **each asked once**. A value two
   components share is asked once, not twice; a value a selected action will produce is not asked at
   all, and a value the project can answer for itself is not asked either. Each question says what it
   is for, and where to look when you do not know. Defaults come from the project (git branch, build
   file) and from your previous answers.
5. **The diff** — every file it would create, update, or leave alone. Nothing is written before you
   confirm.

## Verbs

| | |
|---|---|
| `install` | add components |
| `update` | refresh installed components to the version shipped with this CLI |
| `configure` | change answers without touching versions |
| `remove` | delete the files a component wrote |
| `doctor` | check the installation is complete and coherent |

## Nothing technical is asked at install

Starting a project means not knowing yet which language it will be in, let alone which command runs
its tests. So the wizard does not ask.

- Where there **is** a build file — `package.json`, `pom.xml`, `build.gradle`, `build.sbt`,
  `pyproject.toml`, `Cargo.toml`, `go.mod` — it reads the commands off it and shows you what it
  found.
- Where there is **not**, it writes `.claude/rules/checks.md` saying *not recorded yet*, and the
  agent fills it in the first time it learns the answer. A backlog created by this CLI also gets a
  ticket for exactly that, next to the framing ones.

That file is the project's from the moment it exists: the wizard never rewrites it.

## What it will not overwrite

Files come in three modes, declared per target in the module manifest:

- **`vendor`** — no placeholder, identical on every project. Overwritten on update, always.
- **`template`** — holds your values. The manifest records the hash of what was written; if the file
  no longer matches, you edited it, and the run reports it and leaves it alone.
- **`seed`** — written once, then **yours**. It is the mode for a file the project is meant to keep
  writing, like `.claude/rules/checks.md`; an update that refreshed it would throw away what the work
  put there.

`.claude/settings.json` is **merged, never written over**: arrays are unioned, unknown keys are kept,
and an existing value always wins. `settings.local.json` is never touched — it is yours.

`.claude/CLAUDE.md` gets a block between `<!-- arachnid:<module> -->` markers, replaced in place on
update. A block written at the project root by an earlier version is taken out on that same run —
whatever you wrote around it stays, and a root `CLAUDE.md` that held nothing else is removed rather
than left empty.

## The Notion pages it writes

Two components do not write files at all — they call Notion:

- **Create the Notion database** builds the backlog, its relations, its views (*Next tasks*, *Last
  done*, *Group by status*) and its first framing tickets, and hands back the `collection://…` URI
  the skills need. A view Notion refuses is reported and left to add by hand — the backlog is kept.
- **« Writing a ticket » page** creates the page the rules and the skills point at, from the markdown
  shipped in the module, and brings an existing one up to date.

A standalone Notion page has no properties beyond its title, so there is nowhere to hide metadata:
the page carries its own version, as the `arachnid-mesh:writing-a-ticket:vN` marker in its footer.
Every run reads that marker back and compares it with the version it ships.

| What it finds | What it does |
|---|---|
| the shipped version | nothing, and says so |
| an older version | asks, **yes by default**, then rewrites the page in place |
| a newer version | leaves it alone — this CLI is the old one |
| no marker at all | asks, **no by default**: that page is not one it wrote, and rewriting loses its content |

The rewrite appends the new content before deleting the old, so a call that fails in the middle
leaves a page holding both rather than an empty one. With `--yes`, each case takes the default above
without asking.

## Doctor

`doctor` is the completeness check. It reads the placeholders each module declares and looks for them
in every file that was actually written — including `.claude/CLAUDE.md` and `.claude/rules/`, which a
`grep '<your-'` over `.claude/skills/` would miss. It exits non-zero when something is unresolved, and
says so when a block is still sitting in a root `CLAUDE.md`.

## Secrets

A token is asked for only when the very next call needs it, and is **never written anywhere** — not
to the manifest, not to settings. The Notion access your agent uses is the claude.ai connector
(OAuth), which needs no token in the repository at all.

## Non-interactive

For CI, and for the agents that run this themselves:

```bash
npx @mara-tech/arachnid-mesh install --yes \
  --component notion-backlog/go,notion-backlog/go-auto \
  --set mainBranch=main \
  --set localChecks="npm run lint && npm test" \
  --set dataSourceUri="collection://…"
```

`--config <file>` takes the same answers as JSON. `doctor --yes` prints findings and exits 1 on error.

## Adding a module

A module is a folder at the repository root with a `module.json`. It declares its questions once, its
components (what they need, what they require, what they write, which permissions they want), and the
map from placeholder token to question. Adding one needs no change to this CLI.

A question carries more than its prompt:

| Field | What it does |
|---|---|
| `message` | the prompt, in the words of someone who has not read the skill |
| `why` | one line on what the answer is used for, printed above the prompt |
| `hint` | a second line of context, printed with it |
| `whenUnsure` | where to go and look, printed with it |
| `derived` | never asked — resolved from the project, and shown as what was found |
| `default` | a literal, or the name of a resolver (`git.baseBranch`, `stack.localChecks`, …) |

A template file can carry both wordings of a sentence and let the answer pick:

```md
<!-- arachnid:if coverageCmd -->
| coverage | `<your-coverage-command>` |
<!-- arachnid:else -->
| coverage | *not recorded yet* |
<!-- arachnid:end -->
```

The condition is a question key, never an expression — the manifest and the files it ships stay
data.

Run `npm test` for the unit suite.
