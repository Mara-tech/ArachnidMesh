# Branch, push, checks, review, merge

The GitHub half of a `/go` iteration — and the only half that is the same on every project.
**Nothing in this file is filled in.** It is copied as it is, next to [SKILL.md](../SKILL.md), which
carries the values a project has to provide. Two of them are named here in words rather than spelled
out:

- **the base branch** — the branch pull requests target, written `<base-branch>` in the commands
  below;
- **the local checks** — the commands that must pass before a push.

[SKILL.md](../SKILL.md) decides *what* happens and when; this file says *how*. Each section carries
the number of the step that sends you here.

## Step 5: cutting the branch

The branch is cut from the base branch, and cut **`--no-track`**, so its upstream is *not* set to
`origin/<base-branch>`:

```
git fetch origin && git switch -c <prefix>/<slug> --no-track origin/<base-branch>
```

Why `--no-track` is not optional: a branch cut from `origin/<base-branch>` normally takes it as its
upstream, and a repository set to `push.default = upstream` then resolves a bare `git push` to **the
base branch** and pushes straight onto it — no branch, no pull request, the base branch moved. It has
happened. `--no-track` leaves the branch with no upstream, so the same slip fails loudly (`fatal: no
upstream configured`) instead of landing silently; step 7 sets the upstream, once, to the right
branch. `git config push.default` says whether this repository is exposed — but keep `--no-track`
either way, it costs nothing on one that never was.

## Step 7: pushing without landing on the base branch

Push with an **explicit destination refspec** — never a bare `git push`, whose destination
`push.default = upstream` can resolve to the base branch:

```
git push -u origin HEAD:refs/heads/<prefix>/<slug>
```

`HEAD:refs/heads/<prefix>/<slug>` names the destination branch outright, so it is immune to
`push.default` and to whatever upstream the branch carries; `-u` then sets that branch as the
upstream.

**Read the push summary before doing anything else**: it must end in `-> <prefix>/<slug>`, never in
the base branch. If it names the base branch, you have pushed onto it — stop and tell the user; do
not try to rewind it yourself, since that needs a force-push to the base branch, which the
authorization of step 7 forbids.

## Step 8: waiting for every check

`gh pr checks` fails while **no** check has registered yet, which is the normal state for a few
seconds after `gh pr create`. Retry a bounded number of times until one appears — that failure is
expected, not an incident. It is also what a repository without CI looks like, so bound the retries
and conclude "no check is configured" rather than waiting forever. Then block until they all finish,
and read them:

```
gh pr checks <number> --watch --interval 30
gh pr checks <number> --json name,workflow,bucket,link
```

`--watch` returns when every check is done. Do **not** add `--fail-fast`: it exits on the first
failure, and the point here is to collect every result in one pass. `bucket` is
`pass`/`fail`/`pending`/`skipping`/`cancel`; exit code 8 means checks are still pending.

**Checks do not all carry the same weight**, and confusing the two kinds stalls iterations that
should proceed:

| Kind | Red means |
|---|---|
| **It judges** — tests, build, type check, linter: anything whose verdict is mechanical | the iteration does not advance. Fix the cause and push again — never work around it, never hand over on a red one |
| **It advises** — an automated code reviewer: its output is an opinion on the diff, and it is the input to step 9 | you are deprived of an opinion, nothing more. Say so in the report and carry on |

When a check's kind is not obvious from its name, **treat it as one that judges**. Mistaking an
advisory check for a blocking one costs one question to the user; the reverse merges on a red build.

A red check that judges sends you back to the code, then through the local checks again, then to the
push above — a failure found locally costs one minute, the same failure found here costs a round
trip.

## Step 9: collecting what the review left

Reviewers that post on lines leave *review comments*, not issue comments, and the two are read
separately — a triage that only reads one of them silently drops half the remarks:

```
gh api repos/{owner}/{repo}/pulls/<number>/comments    # inline, line by line
gh pr view <number> --json reviews,comments            # pull-request level
```

*One thing to expect.* Some automated reviewers skip a pull request they have already commented on,
so the second pass may get no new review at all — note its absence, do not wait for it as a
condition for going on.

## Step 13: reading the state, merging, cleaning up

The state of the pull request, and the verdict it carries:

```
gh pr view <number> --json state,reviewDecision,url
gh pr view <number> --json mergeable,mergeStateStatus
```

`reviewDecision` is empty until someone reviews; `APPROVED` and `CHANGES_REQUESTED` are the two
verdicts. `mergeable`/`mergeStateStatus` is where a conflict shows up — and a conflict is never
resolved unattended.

The merge, and the cleanup that comes with it:

```
gh pr merge <number> --merge --delete-branch
git switch <base-branch> && git pull
```

`--delete-branch` deletes the merged branch on `origin` **and** locally, and checks you out onto the
base branch; the `pull` fast-forwards it onto the merge commit. **Deleting the branch is the
default** — keep it only if the user asks, by dropping `--delete-branch`. Never force-merge, and
never touch a branch other than the one under review.

When the user merged externally instead, nothing above ran: `git switch <base-branch> && git pull` is
then the last act of closing, so that the next `/go` starts on a fresh base branch either way.
