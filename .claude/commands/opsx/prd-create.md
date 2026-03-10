
---
# .claude/commands/opsx/prd-create.md
---

1. **Check for uncommitted changes** — Run `git status --porcelain`. If there is any output, stop and tell the user: "You have uncommitted changes. Please commit or stash them before running the full flow."

2. **Check branch name** — Run `git branch --show-current`. The current branch should be a PRD feature branch (NOT `main` or `master`). This branch is the **PRD branch** — all change PRs will target it. Save this branch name for the entire flow.

3. **Confirm PRD name** - confirm branch name for PRD name

Verify the user wants the prd named after the branch name

We are goint to create a PRD to track this change to openspec/prds/<prd-name/PRD.md


1. Switch to Plan mode
2. **Find format by looking at other prds** openspec/prds/**/PRD.md
3. Design the PRD.
4. PRD not have the implementation plan.  should be focused on requirements and usecases and anything else to make the requirements clear.
5. This is an interactive session, ask user to confirm major use cases and requirements.

Create a summary of the changes you plan to make to the PRD.md

create the PRD




