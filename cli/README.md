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
   all. Defaults come from the project (git branch, `package.json` scripts) and from your previous
   answers.
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

## What it will not overwrite

Files come in two modes, declared per target in the module manifest:

- **`vendor`** — no placeholder, identical on every project. Overwritten on update, always.
- **`template`** — holds your values. The manifest records the hash of what was written; if the file
  no longer matches, you edited it, and the run reports it and leaves it alone.

`.claude/settings.json` is **merged, never written over**: arrays are unioned, unknown keys are kept,
and an existing value always wins. `settings.local.json` is never touched — it is yours.

`CLAUDE.md` gets a block between `<!-- arachnid:<module> -->` markers, replaced in place on update.

## Doctor

`doctor` is the completeness check. It reads the placeholders each module declares and looks for them
in every file that was actually written — including `CLAUDE.md` and `.claude/rules/`, which a
`grep '<your-'` over `.claude/skills/` would miss. It exits non-zero when something is unresolved.

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

Run `npm test` for the unit suite.
