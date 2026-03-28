---
# .claude/commands/opsx/prd-implement-all.md
---

Implement ALL changes from a PRD's IMPLEMENTATION.md sequentially, one change per branch, with PRs targeting the PRD feature branch. Each change is executed by a sub-agent to keep context isolated.

## Pre-flight Checks

Before doing anything else, run these checks and **stop immediately** if any fail:

1. **Check for uncommitted changes** — Run `git status --porcelain`. If there is any output, stop and tell the user: "You have uncommitted changes. Please commit or stash them before running the full flow."

2. **Check branch name** — Run `git branch --show-current`. The current branch should be a PRD feature branch (NOT `main` or `master`). This branch is the **PRD branch** — all change PRs will target it. Save this branch name for the entire flow.

3. **Verify lint and tests ware working before starting**
   - npm run lint
   - npm run build
   - npm run test
   - npm run test:e2e
   - in ../mason-extensions, run `npm run lint`
   - ../mason-extensions, run `npm run build`
   - in ../mason-extensions `npm run test`
   - in ../mason-extensions `npm run test:e2e`

If tests fail, make a plan to fix them and present it to the user

4. **Find the PRD** — The branch name IS the PRD directory name. Look up `openspec/prds/<branch-name>/IMPLEMENTATION.md` directly. If it doesn't exist, stop with an error: "No PRD found at `openspec/prds/<branch-name>/`. The branch name must match the PRD directory."

5. **Identify unimplemented changes** — Read IMPLEMENTATION.md and list all changes with their implementation status. Filter to only changes that are NOT marked as `**Implemented**`. If all changes are already implemented, tell the user and stop.

If checks pass, present the list of unimplemented changes and confirm with the user before starting.

## Per-Change Loop

For each unimplemented change, in order:

### 1. Prepare the PRD Branch

Ensure you're on the PRD branch with the latest changes:

```
git checkout <prd-branch>
git pull origin <prd-branch> --ff-only   # (if remote exists, otherwise skip)
```

### 2. Create Change Branch

From the PRD feature branch, create a new branch for this change:

```
git checkout -b <change-branch-name>
```

The change branch name should be a kebab-case summary of the change (e.g., `sqlite-database-module`, `tool-router`, `proxy-cli`).

### 3. Spawn Sub-Agent for the Change

Use the `Task` tool to spawn a sub-agent that implements the change. The sub-agent prompt should be:

```
You are on branch `<change-branch-name>`, which targets PRD branch `<prd-branch>`.

Execute `/opsx:prd-implement-change` for the following:
- PRD: `<prd-name>` (at `openspec/prds/<prd-name>/`)
- Change: #<change-number> — <change-title>
- Base branch for PR: `<prd-branch>`

Run the full lifecycle: new → ff → apply → test → verify → sync → archive → commit → PR.
```

Use `subagent_type: "general-purpose"` for the sub-agent.

**Wait for the sub-agent to complete.** Check the result:
- If successful (PR created), report the PR URL and continue.
- If the sub-agent fails, report the error and ask the user whether to retry, skip, or stop.

### 4. Merge the PR

After the sub-agent completes successfully:

1. Merge the PR into the PRD branch: `gh pr merge --squash --delete-branch`
2. Return to the PRD branch: `git checkout <prd-branch> && git pull origin <prd-branch> --ff-only`
3. Continue to the next unimplemented change (back to step 1).

## Final Testing

When all changes are implemented:

1. Ensure PRD branch is clean
  - npm run lint
   - npm run build
   - npm run test
   - npm run test:e2e
   - in ../mason-extensions, run `npm run lint`
   - ../mason-extensions, run `npm run build`
   - in ../mason-extensions `npm run test`
   - in ../mason-extensions `npm run test:e2e`
- 
## Completion

When final Testing is complete:

1. Report summary: list all changes, their PRs, and merge status.
2. Tell the user:
   > "All PRD changes have been implemented on the `<prd-branch>` branch. You can now create a PR from `<prd-branch>` to `main` to merge the entire feature."

## Notes

- Each change gets its own branch and PR targeting the PRD feature branch (not `main`)
- Context isolation is handled by sub-agents — each change runs in its own context window
- This command is **re-entrant** — if re-invoked, it re-reads IMPLEMENTATION.md and skips changes already marked as `**Implemented**`
- The branch name must match the PRD directory name exactly (e.g., branch `forge-packaging` → `openspec/prds/forge-packaging/`)
