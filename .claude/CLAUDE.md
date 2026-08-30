# ArachnidMesh

A place to collect general tooling for developing projects with coding agents — skills, rules, and
the setup that makes them work. Not a library: a set of things you install into *another* project.

Documentation and code are in English; see `notion-backlog/rules/language.md` for the convention this
repository ships.

## Layout

Everything is **modular**. A module is a folder at the root with a `module.json`:

```
notion-backlog/     the only module today — Notion as a backlog, /go, /go-auto
  module.json       questions, components, targets, placeholders
cli/                the wizard that installs modules into a project
```

`module.json` declares its questions once, then components that reference them by `needs`. Adding a
module (code review is the next one) means adding a folder — no change to the CLI.

## The CLI

`npx @mara-tech/arachnid-mesh`, run from the project being equipped. Screens: state → verb
(Install / Update / Configure / Remove / Doctor) → multi-select of components → questions → diff →
apply. It is a work in progress and not yet published.

Test it locally with `node cli/src/index.js --project <dir>`; `npm test` in `cli/` runs the unit
suite. See `cli/README.md`.

## Invariants worth not breaking

- **Two families of `<…>`.** Setup placeholders (`<your-notion-database>`, `<Backlog Name>`) are
  filled at install; runtime ones (`<prefix>`, `<slug>`, `<number>`, `<url>`, `<base-branch>`) belong
  to the agent and must survive. Substitution is driven by the declared `placeholders` map — never by
  a pattern over `<…>`.
- **Modules stay at the root**, browsable, and every module documents a manual install that must keep
  working. The wizard automates that procedure; it does not replace it.
- **`.claude/settings.json` is merged, never written over**, and `settings.local.json` is never
  touched. Files marked `template` that the user edited are reported, not overwritten.
- **No secret is ever written** — not to the manifest, not to settings. A token is asked for only when
  the very next call needs it.
- **`language.md` is the only place a language is named.** Skills say "the repository language" and
  "the conversation language".

## Stay generic — and when you need a name, it is Dharma

Nothing committed here may name a real project, workspace, database, branch or npm script: this
repository ships templates that other people install into their own projects. A real Notion URL or id
in a committed file is a leak, not an example.

When an example, a default, a sample ticket or a test needs a concrete project, it is **Dharma**:

| | |
|---|---|
| project | `Dharma` |
| backlog | `Backlog Dharma Project` |
| ticket prefix | `DHA` |

One invented name used everywhere is what makes a real one visible the day it slips in — anything in
an example that is not Dharma is worth a second look.
