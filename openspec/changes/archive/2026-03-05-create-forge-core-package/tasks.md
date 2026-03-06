## 1. Create forge-core directory structure

- [x] 1.1 Create `forge-core/` directory with subdirectories: `apps/filesystem/`, `tasks/take-notes/prompts/`, `skills/markdown-conventions/`, `roles/writer/`, `agents/note-taker/`
- [x] 1.2 Create `forge-core/package.json` with name `@clawforge/forge-core`, version `0.1.0`, and `files` array listing all component directories

## 2. Copy and rename component definitions

- [x] 2.1 Copy `example/apps/filesystem/package.json` to `forge-core/apps/filesystem/package.json`, rename `@example/app-filesystem` → `@clawforge/app-filesystem`
- [x] 2.2 Copy `example/tasks/take-notes/` (package.json + prompts/) to `forge-core/tasks/take-notes/`, rename `@example/task-take-notes` → `@clawforge/task-take-notes`, update forge-field references to `@clawforge/*`
- [x] 2.3 Copy `example/skills/markdown-conventions/` (package.json + SKILL.md) to `forge-core/skills/markdown-conventions/`, rename `@example/skill-markdown-conventions` → `@clawforge/skill-markdown-conventions`
- [x] 2.4 Copy `example/roles/writer/package.json` to `forge-core/roles/writer/package.json`, rename `@example/role-writer` → `@clawforge/role-writer`, update all forge-field references to `@clawforge/*`
- [x] 2.5 Copy `example/agents/note-taker/package.json` to `forge-core/agents/note-taker/package.json`, rename `@example/agent-note-taker` → `@clawforge/agent-note-taker`, update forge-field references to `@clawforge/*`

## 3. Update root package.json

- [x] 3.1 Add `"workspaces": ["forge-core"]` to root `package.json`

## 4. Verify

- [x] 4.1 Run `npm install` at root and confirm it succeeds
- [x] 4.2 Verify all forge-core package.json files parse correctly and contain no `@example/*` references
