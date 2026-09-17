# Local checks

What has to pass before a push, and what reports coverage. **This file is the project's, not the
installer's**: it starts with whatever the setup could read off the build files, and it is filled in
by the work itself — a ticket that adds a linter adds its line here, in the same pass.

| What | Command |
|---|---|
<!-- arachnid:if localChecks -->
| before a push | `<your-local-checks>` |
<!-- arachnid:else -->
| before a push | *not recorded yet* |
<!-- arachnid:end -->
<!-- arachnid:if coverageCmd -->
| coverage | `<your-coverage-command>` |
<!-- arachnid:else -->
| coverage | *not recorded yet* |
<!-- arachnid:end -->

## How to use it

**Run what the table names, before every push.** Finding a failure here costs one minute; finding it
in CI costs a round trip.

**A line that says *not recorded yet* is a question, not a permission to skip.** Look for the answer
where it is written down — the build file (`package.json`, `pom.xml`, `build.sbt`, `pyproject.toml`,
`Makefile`…), the CI workflow, the README — run what you find, and **write it into the table in the
same pass**. Nothing to find, because the project has no tests yet? Say so in the report and leave
the line as it is: the ticket that brings the first test is the one that fills it.

**A command that no longer works is a bug in this file.** Fix the line rather than working around it,
and say in the report that you changed it.

Coverage has no line when the project measures none. That is a stated absence, and the report says
so — an absent section reads like an oversight.

## Beyond the table

Anything else the project needs run or checked by hand — a database to start, a fixture to generate,
an environment variable to export — belongs here too, under a heading of its own. A convention that
lives only in someone's memory is one that the next iteration will break.
