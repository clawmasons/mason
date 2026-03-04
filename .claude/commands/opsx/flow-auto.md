---
# .claude/commands/opsx/flow.md
---

Run the full OpenSpec lifecycle: new → ff → apply -> test -> verify sync → archive → commit → PR

## Pre-flight Checks

Before doing anything else, run these checks and **stop immediately** if any fail:

1. **Check for uncommitted changes** — Run `git status --porcelain`. If there is any output, stop and tell the user: "You have uncommitted changes. Please commit or stash them before running the full flow."

2. **Check branch name** — Run `git branch --show-current`. If the result is `main` or `master`, stop and tell the user: "You're on the main branch. Please create and checkout a feature branch first (e.g. `git checkout -b opsx/my-feature`)."

If both checks pass, proceed.

## Steps

Execute each step in order, completing each fully before moving to the next:

1. **New** — Execute the instructions from `/opsx:new`. Create the new spec document and continue without stopping.  

2. **Fast-Forward** — Execute the instructions from `/opsx:ff`. Flesh out and refine the spec. Confirm completion before proceeding but do not ask user.  check yourself.

3. **Apply** — Execute the instructions from `/opsx:apply`. Synchronize the spec with the codebase. Confirm completion before proceeding but do not ask user.  check yourself.

4. **Test** - Run all tests (run-tests.sh) for the project to make sure there were no unexpected regressions with the change. Include unit and UI tests. Fix the tests.  Confirm completion before proceeding but do not ask user.  check yourself.

5. **Verify** — Execute the instructions from `/opsx:verify`. To verify new requirements were implemented. Confirm completion before proceeding but do not ask user.  check yourself.

6. **Sync** — Execute the instructions from `/opsx:sync`. Synchronize the spec with the codebase. Confirm completion before proceeding but do not ask user.  check yourself.

7. **Archive** — Execute the instructions from `/opsx:archive`. Archive the completed spec.

After each step, briefly summarize what was done before moving to the next. If any step fails or the user wants to stop, halt the flow and report status.

## Commit & PR

After all four steps complete successfully:

1. Run `git add -A`
2. Write a concise, descriptive commit message summarizing the spec and the code changes made. Use conventional commit format (e.g. `feat: implement user role provisioning per spec opsx-042`). Run `git commit -m "<message>"`.
3. Push the branch: `git push -u origin HEAD`
4. Create a pull request using `gh pr create`. For the PR:
   - **Title**: A clear one-liner describing the feature/change
   - **Body**: A well-formatted summary including:
     - What the spec addressed (problem/goal)
     - Key changes made during sync
     - Files/areas affected
     - Any follow-up items or known limitations
   - Use `--fill` only as a fallback. Prefer explicit `--title` and `--body` flags.

Example:
```
gh pr create --title "feat: minimal credential provisioning for task agents" --body "## Summary
Implemented spec opsx-042 covering minimal credential provisioning...

## Changes
- Added role scoping logic in ...
- Updated agent config to ...

## Follow-up
- [ ] Add integration tests for ..."
```

Present the PR URL to the user when done.