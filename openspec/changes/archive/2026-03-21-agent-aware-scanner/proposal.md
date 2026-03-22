## Why

The project scanner (`scanProject()` in `packages/shared/src/mason/scanner.ts`) currently hardcodes directory names for tasks and skills:

1. **Tasks always scan `commands/`** — `scanCommands()` hardcodes `join(agentDir, "commands")`, but different agents store tasks in different directories (Claude: `commands/`, Mason: `tasks/`, Pi: `prompts/`).
2. **Skills always scan `skills/`** — `scanSkills()` hardcodes `join(agentDir, "skills")`, but agents may use different skill directories (Pi uses a root-level `skills/` folder, not `.pi/skills/`).
3. **Command names always use path-based scoping** — `walkCommands()` joins subdirectory paths into the command name (e.g., `opsx/deploy`), but agents with `kebab-case-prefix` scope format cannot distinguish scope boundaries from task name parts. For those agents, tasks should have no scope.
4. **No dialect filtering** — `scanProject()` iterates all registered dialects. Callers like the project role generator (Change 5) need to scan only specific source directories.

Each agent package already declares `AgentTaskConfig` and `AgentSkillConfig` on its `AgentPackage` export, specifying directory names, scope format, and name format. The scanner should use these configs instead of hardcoding paths.

## What Changes

- `packages/shared/src/role/dialect-registry.ts`:
  - Add optional `taskConfig` and `skillConfig` fields to `DialectEntry` so the registry can expose agent task/skill configs per dialect.
  - Add `registerDialectConfigs()` function for agent packages to register their configs after dialect registration.
  - The built-in dialect registrations remain unchanged — configs are registered separately by agent packages or by the scanner's fallback logic.

- `packages/shared/src/mason/scanner.ts`:
  - Add `ScanOptions` interface with optional `dialects` filter (array of dialect names).
  - Update `scanProject()` signature to accept `ScanOptions`. When `dialects` is provided, only those dialects are scanned; otherwise all registered dialects are scanned (backward compatible).
  - Update `scanCommands()` → `scanTasks()`: Use `DialectEntry.taskConfig` to determine the tasks directory and scoping rules. Fall back to current hardcoded behavior when no config is registered.
  - Update `scanSkills()`: Use `DialectEntry.skillConfig` to determine the skills directory. Fall back to current behavior when no config is registered.
  - Rename `DiscoveredCommand` to keep backward compatibility via re-export, but internally use task config terminology.

- `packages/shared/src/index.ts`:
  - Export new types and functions (`ScanOptions`, `registerDialectConfigs`).

- `packages/shared/tests/mason-scanner.test.ts`:
  - Add tests for dialect filtering: `scanProject(dir, { dialects: ["claude-code-agent"] })` returns only `.claude/` items.
  - Add tests verifying task names respect agent scoping rules when config is registered.
  - Add tests for fallback behavior when no task/skill config is registered.

## Capabilities

### Modified Capabilities
- `scanProject`: Now accepts optional `ScanOptions` with dialect filter. Uses agent task/skill configs for directory resolution and scoping.
- `dialect-registry`: Now stores optional task/skill config per dialect entry.

### New Capabilities
- `registerDialectConfigs()`: Allows agent packages to register their task/skill configs in the dialect registry.

## Impact

- Modified file: `packages/shared/src/mason/scanner.ts` (use agent configs, add dialect filter)
- Modified file: `packages/shared/src/role/dialect-registry.ts` (add task/skill config storage)
- Modified file: `packages/shared/src/index.ts` (export new types)
- Modified file: `packages/shared/tests/mason-scanner.test.ts` (add new test cases)
- No breaking changes — existing `scanProject(dir)` calls continue to work unchanged.
