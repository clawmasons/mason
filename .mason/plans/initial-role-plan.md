# Chapter (Mason) Role Plan

## Overview

**Project:** `@clawmasons/chapter-monorepo` — Mason, a tool that runs AI agents in secure Docker containers scoped to roles.

**Scanned:**
- **Skills** (10): openspec-apply-change, openspec-explore, openspec-verify-change, openspec-new-change, openspec-archive-change, openspec-onboard, openspec-bulk-archive-change, openspec-continue-change, openspec-sync-specs, openspec-ff-change
- **Commands** (21): opsx/apply, opsx/verify, opsx/new, opsx/explore, opsx/continue, opsx/ff, opsx/archive, opsx/bulk-archive, opsx/sync, opsx/onboard, opsx/prd-create, opsx/prd-modify, opsx/prd-refine, opsx/prd-plan-implementation, opsx/prd-implement-change, opsx/prd-implement-all, opsx/prd-review-pr, opsx/flow-auto, doc-cleanup, prd-todos
- **MCP Servers:** None configured
- **System Prompt:** CLAUDE.md — workflow orchestration, verification, task management
- **Credentials:** None (CLAUDE_CODE_OAUTH_TOKEN is used by the configure-project supervisor role)

**Proposed roles:** `developer` and `lead` — two project roles that partition the openspec workflow by blast radius and responsibility.

---

## Proposed Roles

### developer (type: project, risk: LOW)

**Rationale:** Implements features and fixes from openspec specs. Has access only to implementation and verification skills — no ability to create or archive specs. Kept LOW risk since this is pure TypeScript development within the monorepo.

**Skills:**
- `openspec-apply-change` — implements tasks from a spec change
- `openspec-verify-change` — verifies implementation matches spec artifacts

**Commands:**
- `opsx/apply` — run apply-change workflow
- `opsx/verify` — run verify-change workflow

**MCP Servers:** None

**Credentials:** None

**Container ignore paths:** `.mason/`, `.claude/`, `.env`, `node_modules`, `dist`

---

### lead (type: project, risk: MEDIUM)

**Rationale:** Drives the full spec-driven development lifecycle — creates new changes, refines specs, plans implementation, reviews PRs, and archives completed work. Also owns documentation. MEDIUM risk because it can modify specs and drive architectural decisions.

**Skills:**
- `openspec-new-change` — start a new spec change
- `openspec-explore` — thinking-partner mode for requirements
- `openspec-continue-change` — create the next artifact in a change
- `openspec-ff-change` — fast-forward through all artifacts
- `openspec-verify-change` — verify implementation before archiving
- `openspec-archive-change` — archive a completed change
- `openspec-bulk-archive-change` — archive multiple changes at once
- `openspec-sync-specs` — sync delta specs to main specs
- `openspec-onboard` — guided onboarding walkthrough

**Commands:**
- All `opsx/*` commands (apply, verify, new, explore, continue, ff, archive, bulk-archive, sync, onboard, prd-create, prd-modify, prd-refine, prd-plan-implementation, prd-implement-change, prd-implement-all, prd-review-pr, flow-auto)
- `doc-cleanup`
- `prd-todos`

**MCP Servers:** None

**Credentials:** None

**Container ignore paths:** `.mason/`, `.claude/`, `.env`

---

## developer Implementation Steps

- [x] Create `/home/mason/workspace/project/.mason/roles/developer/ROLE.md`
- [x] Set frontmatter: name, description, version, type=project, risk=LOW
- [x] Add skills: openspec-apply-change, openspec-verify-change
- [x] Add commands: opsx/apply, opsx/verify
- [x] Add container ignore paths
- [x] Write system prompt body

## lead Implementation Steps

- [x] Create `/home/mason/workspace/project/.mason/roles/lead/ROLE.md`
- [x] Set frontmatter: name, description, version, type=project, risk=MEDIUM
- [x] Add all openspec skills
- [x] Add all opsx/* commands plus doc-cleanup and prd-todos
- [x] Add container ignore paths
- [x] Write system prompt body

## Shared Steps

- [x] Create/update `.mason/config.json` with aliases for both roles
- [ ] Verify openspec CLI is available in container (`npm` package dependency check)

---

## Testing

### Launch a role

```bash
# Developer role
mason run --agent claude --role developer --verbose

# Lead role
mason run --agent claude --role lead --verbose
```

### Smoke test checklist

**developer role:**
- [ ] Role loads without credential errors
- [ ] Skills resolve: openspec-apply-change, openspec-verify-change visible
- [ ] Commands available: opsx/apply, opsx/verify
- [ ] Container ignore paths confirmed: .mason/, .claude/, .env, node_modules, dist not visible
- [ ] Can run `openspec list` (openspec CLI available)

**lead role:**
- [ ] Role loads without credential errors
- [ ] All openspec skills resolve
- [ ] All opsx/* commands available
- [ ] Container ignore paths confirmed: .mason/, .claude/, .env not visible
- [ ] Can run `openspec list` and `openspec new`

### Integration test

1. **developer**: Run `/opsx:apply` on an existing change, confirm it reads context files and begins implementing tasks
2. **lead**: Run `/opsx:new` to start a new change, confirm full artifact creation workflow works
