---
# .claude/commands/opsx/prd-implement-change.md
---

Run the full OpenSpec lifecycle based on a PRD IMPLEMENTATION planned change change: new → ff → apply -> test -> verify sync → archive → commit → PR

## Pre-flight Checks

Before doing anything else, run these checks and **stop immediately** if any fail:

1. **Check for uncommitted changes** — Run `git status --porcelain`. If there is any output, stop and tell the user: "You have uncommitted changes. Please commit or stash them before running the full flow."

2. **Check branch name** — Run `git branch --show-current`. If the result is `main` or `master`, stop and tell the user: "You're on the main branch. Please create and checkout a feature branch first (e.g. `git checkout -b opsx/my-feature`)."

3. **Determine the PR base branch** — Run `git log --oneline --decorate --all --graph` or `git config branch.<current>.merge` to determine what branch this was created from. The **base branch** is the branch this change PR should target:
   - If the current branch was created from a PRD feature branch (not `main`/`master`), the base branch is that PRD feature branch.
   - If the current branch was created from `main`/`master`, the base branch is `main`.
   - Heuristic: run `git merge-base --fork-point <candidate> HEAD` for likely parent branches, or check `git log --oneline main..HEAD` vs `git log --oneline <prd-branch>..HEAD` — the base with fewer commits ahead is the parent.
   - Save this base branch name for the PR step.

4. **Find the Change to Implement** Find the relevant PRD.md and IMPLEMENTATION.md in the openspec/prds/ directory.  If no change was specified, find the first unimplemented change.  The branch name should be a short summary of the change.

If checks pass, proceed.

Confirm the change to implement.

## Steps

Execute each step in order, completing each fully before moving to the next:

1. **New** — Execute the instructions from `/opsx:new`. Create the new spec document and continue without stopping.  

2. **Fast-Forward** — Execute the instructions from `/opsx:ff`. Flesh out and refine the spec. Confirm completion before proceeding but do not ask user.  check yourself.

3. **Apply** — Execute the instructions from `/opsx:apply`. Synchronize the spec with the codebase. Confirm completion before proceeding but do not ask user.  check yourself.

4. **Test** - Run all tests (run-tests.sh) for the project to make sure there were no unexpected regressions with the change. Include unit and UI tests. Fix the tests.  Confirm completion before proceeding but do not ask user.  check yourself.

5. **Verify** — Execute the instructions from `/opsx:verify`. To verify new requirements were implemented and check that implementation will work with future changes planned for the PRD. Check for coding best practices.  Confirm completion before proceeding but do not ask user.  check yourself.

6. **Sync** — Execute the instructions from `/opsx:sync`. Synchronize the spec with the codebase. Confirm completion before proceeding but do not ask user.  check yourself.

7. **Archive** — Execute the instructions from `/opsx:archive`. Archive the completed spec.

8. **Update Change** - Update the change in IMPLEMENTATION.md with relative links to the archived proposal, design, tasks, and specs implemented with the change.  Also make any changes to the PRD.md and IMPLEMENTATION to match was was done in the change.

After each step, briefly summarize what was done before moving to the next. If any step fails or the user wants to stop, halt the flow and report status.

## Commit & PR

After all steps complete successfully:

1. Run `git add -A`
2. Write a concise, descriptive commit message summarizing the spec and the code changes made. Use conventional commit format (e.g. `feat: implement user role provisioning per spec opsx-042`). Run `git commit -m "<message>"`.
3. Push the branch: `git push -u origin HEAD`
4. Create a pull request using `gh pr create` **targeting the correct base branch**:
   - Use the **base branch** determined in pre-flight step 3.
   - If the base branch is NOT `main`/`master` (i.e., a PRD feature branch), use `--base <prd-branch>` to target it.
   - If the base branch is `main`, no `--base` flag is needed (it's the default).
   - **Title**: A clear one-liner describing the feature/change
   - **Body**: A well-formatted summary including:
     - What the spec addressed (problem/goal)
     - Key changes made during sync
     - Files/areas affected
     - Any follow-up items or known limitations
   - Use `--fill` only as a fallback. Prefer explicit `--title` and `--body` flags.

Example (PR targeting a PRD feature branch):
```
gh pr create --base forge-proxy --title "feat: minimal credential provisioning for task agents" --body "## Summary
Implemented spec opsx-042 covering minimal credential provisioning...

## Changes
- Added role scoping logic in ...
- Updated agent config to ...

## Follow-up
- [ ] Add integration tests for ..."
```

Example (PR targeting main — no --base needed):
```
gh pr create --title "feat: minimal credential provisioning for task agents" --body "## Summary
..."
```

Present the PR URL to the user when done.