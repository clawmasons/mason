---
# .claude/commands/opsx/prd-implement-all.md
---

Implement ALL changes from a PRD's IMPLEMENTATION.md sequentially, one change per branch, with PRs targeting the PRD feature branch.

## Pre-flight Checks

Before doing anything else, run these checks and **stop immediately** if any fail:

1. **Check for uncommitted changes** — Run `git status --porcelain`. If there is any output, stop and tell the user: "You have uncommitted changes. Please commit or stash them before running the full flow."

2. **Check branch name** — Run `git branch --show-current`. The current branch should be a PRD feature branch (NOT `main` or `master`). This branch is the **PRD branch** — all change PRs will target it. Save this branch name for the entire flow.

3. **Find the PRD** — Look in `openspec/prds/` for a PRD whose name matches or relates to the current branch name. Read its `IMPLEMENTATION.md` and identify all changes. List them with their implementation status.

4. **Identify unimplemented changes** — Filter to only changes that are NOT marked as `**Implemented**`. If all changes are already implemented, tell the user and stop.

If checks pass, present the list of unimplemented changes and confirm with the user before starting.

## Per-Change Loop

For each unimplemented change, in order:

### 1. Create Change Branch

From the PRD feature branch, create a new branch for this change:

```
git checkout <prd-branch>
git pull origin <prd-branch> --ff-only   # (if remote exists, otherwise skip)
git checkout -b <change-branch-name>
```

The change branch name should be a kebab-case summary of the change (e.g., `sqlite-database-module`, `tool-router`, `proxy-cli`).

### 2. Tell User to /clear and Invoke the Change Command

Tell the user:

> **Ready to implement Change N: <change-title>**
>
> To keep the context window clean, please run:
> 1. `/clear`
> 2. `/opsx:prd-implement-change`
>
> The change command will detect the current branch and PRD automatically.
> When the change PR is created, come back and run `/opsx:prd-implement-all` to continue.

**STOP HERE and wait for the user to complete the change.**

Do NOT attempt to run `/opsx:prd-implement-change` inline — the whole point is to `/clear` context between changes to keep the context window clean.

### 3. Resume After Change (when user re-invokes this command)

When the user re-invokes `/opsx:prd-implement-all` after completing a change:

1. **Detect state** — Check `git branch --show-current`. If on a change branch (not the PRD branch), check if there's an open PR for it.

2. **Prompt to merge** — Ask the user:
   > "Change N: <title> has a PR. Merge into the PRD branch and continue to the next change?"

   Options:
   - **Yes, merge and continue** — Merge the PR into the PRD branch using `gh pr merge --squash --delete-branch`, then `git checkout <prd-branch> && git pull origin <prd-branch>`.  Continue to the next unimplemented change (go to step 1 of Per-Change Loop).
   - **Skip this change** — Switch back to the PRD branch without merging. Continue to the next change.
   - **Stop here** — Halt the flow and report status.

3. **If already on the PRD branch** — The user may have already merged manually. Check IMPLEMENTATION.md for the next unimplemented change and proceed from step 1.

## Completion

When all changes are implemented:

1. Report summary: list all changes, their PRs, and merge status.
2. Tell the user:
   > "All PRD changes have been implemented on the `<prd-branch>` branch. You can now create a PR from `<prd-branch>` to `main` to merge the entire feature."

## Notes

- Each change gets its own branch and PR targeting the PRD feature branch (not `main`)
- The `/opsx:prd-implement-change` command will automatically detect the base branch for its PR
- Context is cleared between changes via `/clear` to prevent context window overflow
- This command is **re-entrant** — you can re-invoke it at any point and it will detect where you left off
