# Initiate Chapter Template

**Change:** CHANGE 6 from [clawmasons-cli IMPLEMENTATION.md](../../prds/clawmasons-cli/IMPLEMENTATION.md)
**PRD refs:** REQ-008 (Initiate Chapter Template)
**Status:** complete

---

## Summary

Create the `initiate` chapter template at `packages/cli/templates/initiate/` containing a complete chapter workspace for the chapter-creator bootstrap agent. The template includes the `pi` agent, `chapter-creator` role (with mounts, baseImage, aptPackages), `create-chapter` task and skill, and `filesystem` app. All package.json files use `{{projectScope}}` placeholder for template substitution.

Register `initiate` as a discoverable template in the chapter init command (auto-discovered via directory listing).

## Motivation

The initiate template is the bootstrap entry point for clawmasons. When a user runs `clawmasons chapter init --name acme.initiate --template initiate`, it scaffolds a complete workspace with the chapter-creator role ready to analyze projects and create new chapters. This is the foundation for the single-command bootstrap flow in CHANGE 7.

## Design

### Template Directory Structure

```
packages/cli/templates/initiate/
  package.json                           # Root workspace package.json
  agents/pi/package.json                 # pi agent (chapter-creator bootstrap agent)
  roles/chapter-creator/package.json     # chapter-creator role with mounts/baseImage/aptPackages
  tasks/create-chapter/package.json      # create-chapter task definition
  tasks/create-chapter/prompts/create-chapter.md  # Task prompt
  skills/create-chapter/package.json     # create-chapter skill definition
  skills/create-chapter/SKILL.md         # Skill artifact (chapter creation knowledge)
  apps/filesystem/package.json           # Filesystem MCP server app
```

### Template Registration

The existing `init.ts` command auto-discovers templates by listing subdirectories of `packages/cli/templates/`. Creating the `initiate/` directory is sufficient to register it — no code changes needed to `init.ts`.

### Key Design Decisions

1. **Agent runtime `pi-coding-agent`**: The pi agent uses the `pi-coding-agent` runtime (not `claude-code`), matching the PRD specification for the bootstrap agent.
2. **Filesystem root `/home/mason`**: The filesystem app targets `/home/mason` (agent home dir) instead of a specific subdirectory, giving the agent access to both workspace and lodge mount.
3. **Role mounts**: The chapter-creator role mounts `${LODGE_HOME}` at `/home/mason/${LODGE}` so the agent can write new chapters to the lodge.
4. **Heavy base image**: Uses `node:22-bookworm` with build tools (python3, rustc, cargo, gcc, g++, make, git, curl) since the chapter-creator may need to analyze and build projects.

## Tasks

- [x] Create `packages/cli/templates/initiate/package.json`
- [x] Create `packages/cli/templates/initiate/agents/pi/package.json`
- [x] Create `packages/cli/templates/initiate/roles/chapter-creator/package.json`
- [x] Create `packages/cli/templates/initiate/tasks/create-chapter/package.json`
- [x] Create `packages/cli/templates/initiate/tasks/create-chapter/prompts/create-chapter.md`
- [x] Create `packages/cli/templates/initiate/skills/create-chapter/package.json`
- [x] Create `packages/cli/templates/initiate/skills/create-chapter/SKILL.md`
- [x] Create `packages/cli/templates/initiate/apps/filesystem/package.json`
- [x] Add tests for initiate template scaffolding
- [x] Verify template validation against schemas

## Files Changed

- **New:** `packages/cli/templates/initiate/package.json`
- **New:** `packages/cli/templates/initiate/agents/pi/package.json`
- **New:** `packages/cli/templates/initiate/roles/chapter-creator/package.json`
- **New:** `packages/cli/templates/initiate/tasks/create-chapter/package.json`
- **New:** `packages/cli/templates/initiate/tasks/create-chapter/prompts/create-chapter.md`
- **New:** `packages/cli/templates/initiate/skills/create-chapter/package.json`
- **New:** `packages/cli/templates/initiate/skills/create-chapter/SKILL.md`
- **New:** `packages/cli/templates/initiate/apps/filesystem/package.json`

No existing files were modified. The `initiate` template is auto-discovered by the existing `listTemplates()` function in `init.ts` which scans subdirectories of `templates/`.

## Acceptance Criteria

1. `clawmasons chapter init --name acme.initiate --template initiate` scaffolds a complete chapter workspace
2. All `{{projectScope}}` placeholders are correctly substituted
3. All package.json chapter fields validate against their respective schemas
4. The chapter-creator role has mounts, baseImage, and aptPackages configured
5. The create-chapter task prompt is comprehensive for LLM execution
6. The create-chapter skill SKILL.md provides chapter creation knowledge
