## Context

PRD Section 4.3 requires the scanner to use `AgentTaskConfig` and `AgentSkillConfig` to determine directory structure per agent type. Currently the scanner hardcodes `commands/` and `skills/` directories. The scanner also needs a dialect filter so the project role generator (Change 5) can scan specific source directories.

Agent packages already declare their configs:
- Claude: `{ projectFolder: ".claude/commands", scopeFormat: "path", nameFormat: "{scopePath}/{taskName}.md" }`
- Pi: `{ projectFolder: ".pi/prompts", scopeFormat: "kebab-case-prefix", nameFormat: "{scopeKebab}-{taskName}.md" }`
- Mason: `{ projectFolder: ".mason/tasks", scopeFormat: "path" }` (implied from dialect)

The scanner runs in the shared package which does not depend on agent packages. The dialect registry is the bridge — it already stores per-dialect metadata (directory, field mappings). Adding optional task/skill config to the registry lets the scanner access agent-specific layout without importing agent packages.

## Goals / Non-Goals

**Goals:**
- Scanner uses agent task/skill config to determine directories and scoping
- Add dialect filtering to `scanProject()` for scanning specific sources
- Maintain backward compatibility for existing `scanProject(dir)` calls
- Register task/skill configs in the dialect registry for scanner access
- Handle agents without configs gracefully (fall back to conventions)

**Non-Goals:**
- Changing how agent packages define their configs (they already have `AgentTaskConfig`/`AgentSkillConfig`)
- Modifying the `readTasks()`/`readSkills()` functions in `agent-sdk/helpers.ts` (those work with `ResolvedTask`, the scanner produces `DiscoveredCommand`)
- Full integration with project role generation (that's Change 5)

## Decisions

### D1: Store configs in DialectEntry, not a separate registry

**Choice:** Add optional `taskConfig` and `skillConfig` fields directly to `DialectEntry`.

**Rationale:** The dialect registry already maps dialect names to directory/field info. Adding config fields keeps all per-dialect metadata in one place. A separate config registry would require a second lookup and add indirection. The fields are optional so existing `registerDialect()` calls don't need to change.

### D2: Derive task directory from `AgentTaskConfig.projectFolder` relative to agent dir

**Choice:** When `taskConfig` is present, extract the subdirectory from `projectFolder` by removing the leading `.{directory}/` prefix. For example, `".claude/commands"` → `"commands"`. When no config exists, fall back to the dialect's `fieldMapping.tasks` value (e.g., `"commands"` for Claude).

**Rationale:** `AgentTaskConfig.projectFolder` is an absolute path relative to project root (e.g., `.claude/commands`). The scanner already has the agent directory path, so it needs just the subdirectory portion. Using `fieldMapping.tasks` as fallback provides reasonable defaults without requiring every dialect to register a full config.

### D3: Kebab-case scope means no scoped tasks for scanner

**Choice:** When `taskConfig.scopeFormat` is `"kebab-case-prefix"`, scan only flat files (no recursion into subdirectories) and set command names without scope disambiguation.

**Rationale:** Per PRD Section 4.3, "If the agent uses kebab-case for scopes, assume no scoped tasks (impossible to distinguish scope boundary from task name)." The scanner cannot reliably split `ops-triage-deploy` into scope and name. Flat scanning avoids the ambiguity.

### D4: Backward-compatible `scanProject()` signature using optional options object

**Choice:** `scanProject(projectDir: string, options?: ScanOptions)` where `ScanOptions = { dialects?: string[] }`.

**Rationale:** Adding a second optional parameter preserves all existing call sites. The options pattern is extensible for future filtering (e.g., `{ includeSystemPrompt: false }`).

### D5: Register configs at dialect registration time via extended `registerDialect()`

**Choice:** Extend `DialectEntry` with optional `taskConfig` and `skillConfig` fields. Update built-in dialect registrations to include configs where known. Agent packages that register custom dialects include their configs in the same call.

**Rationale:** This avoids a separate registration step. The dialect entry is the single source of truth for per-dialect metadata. Built-in dialects can include default configs matching the known agent package layouts. If an agent package later re-registers with different configs, the overwrite behavior already works.

## Implementation

### Type Changes

**`dialect-registry.ts` — Extend DialectEntry:**
```typescript
import type { AgentSkillConfig } from "../types.js";
import type { AgentTaskConfig } from "@clawmasons/agent-sdk";

export interface DialectEntry {
  name: string;
  directory: string;
  fieldMapping: DialectFieldMapping;
  /** Optional task file layout config for this dialect's agent. */
  taskConfig?: AgentTaskConfig;
  /** Optional skill file layout config for this dialect's agent. */
  skillConfig?: AgentSkillConfig;
}
```

Note: `AgentTaskConfig` is defined in `@clawmasons/agent-sdk`, but `packages/shared` cannot depend on `agent-sdk`. So we duplicate/re-export the `AgentTaskConfig` interface in `packages/shared/src/types.ts` (it's already re-exported from shared as `AgentSkillConfig` is). Actually, checking the imports — `AgentTaskConfig` is defined in `packages/agent-sdk/src/types.ts` and imported from `@clawmasons/shared` for `AgentSkillConfig`. We need to check the dependency direction.

**Correction:** `AgentSkillConfig` is defined in `packages/shared/src/types.ts`. `AgentTaskConfig` is defined in `packages/agent-sdk/src/types.ts`. The shared package cannot import from agent-sdk. So we must define `AgentTaskConfig` (or a compatible subset) in shared/types.ts and have agent-sdk re-export it.

Actually, looking more carefully: `packages/agent-sdk/src/types.ts` line 1 says `import type { ResolvedAgent, AgentSkillConfig } from "@clawmasons/shared"`. So agent-sdk depends on shared, not vice versa. We need to move `AgentTaskConfig` to shared/types.ts (or define a scanner-compatible subset there).

**Decision: Move `AgentTaskConfig` to `packages/shared/src/types.ts`** alongside `AgentSkillConfig`. Update `agent-sdk/src/types.ts` to re-export it from shared. This preserves the dependency direction.

### Scanner Changes

**`scanner.ts` — New types and updated functions:**

```typescript
export interface ScanOptions {
  /** When provided, only scan these dialect names. Otherwise scan all registered dialects. */
  dialects?: string[];
}

export async function scanProject(
  projectDir: string,
  options?: ScanOptions,
): Promise<ScanResult> {
  let dialects = getAllDialects();
  if (options?.dialects) {
    const filterSet = new Set(options.dialects);
    dialects = dialects.filter((d) => filterSet.has(d.name));
  }
  // ... rest unchanged
}
```

**`scanTasks()` (renamed from `scanCommands()`):**
```typescript
async function scanTasks(
  agentDir: string,
  dialect: DialectEntry,
): Promise<DiscoveredCommand[]> {
  // Determine task subdirectory from config or fallback
  const taskSubdir = getTaskSubdir(dialect);
  const tasksDir = join(agentDir, taskSubdir);
  if (!(await dirExists(tasksDir))) return [];

  // Determine scoping behavior
  const usePathScoping = dialect.taskConfig
    ? dialect.taskConfig.scopeFormat === "path"
    : true; // default: assume path-based scoping (current behavior)

  if (usePathScoping) {
    const results: DiscoveredCommand[] = [];
    await walkCommands(tasksDir, tasksDir, dialect, results);
    return results;
  } else {
    // Flat scan — no recursion, no scope
    return flatScanTasks(tasksDir, dialect);
  }
}

function getTaskSubdir(dialect: DialectEntry): string {
  if (dialect.taskConfig) {
    // Extract subdir from projectFolder: ".claude/commands" → "commands"
    const prefix = `.${dialect.directory}/`;
    if (dialect.taskConfig.projectFolder.startsWith(prefix)) {
      return dialect.taskConfig.projectFolder.slice(prefix.length);
    }
    // If projectFolder doesn't start with the agent dir, use it as-is
    return dialect.taskConfig.projectFolder;
  }
  // Fallback: use field mapping name (e.g., "commands", "instructions", "conventions")
  return dialect.fieldMapping.tasks;
}
```

**`scanSkills()` — use config:**
```typescript
async function scanSkills(
  agentDir: string,
  dialect: DialectEntry,
): Promise<DiscoveredSkill[]> {
  const skillSubdir = getSkillSubdir(dialect);
  const skillsDir = join(agentDir, skillSubdir);
  // ... rest unchanged
}

function getSkillSubdir(dialect: DialectEntry): string {
  if (dialect.skillConfig) {
    const prefix = `.${dialect.directory}/`;
    if (dialect.skillConfig.projectFolder.startsWith(prefix)) {
      return dialect.skillConfig.projectFolder.slice(prefix.length);
    }
    return dialect.skillConfig.projectFolder;
  }
  return "skills"; // default fallback
}
```

### Built-in Dialect Config Registration

Update the built-in dialect registrations in `dialect-registry.ts` to include task/skill configs:

```typescript
registerDialect({
  name: "claude-code-agent",
  directory: "claude",
  fieldMapping: { tasks: "commands", apps: "mcp_servers", skills: "skills" },
  taskConfig: {
    projectFolder: ".claude/commands",
    nameFormat: "{scopePath}/{taskName}.md",
    scopeFormat: "path",
    supportedFields: ["name->displayName", "description", "category", "tags"],
    prompt: "markdown-body",
  },
  skillConfig: { projectFolder: ".claude/skills" },
});
```

### Test Coverage

1. **Dialect filtering**: `scanProject(dir, { dialects: ["claude-code-agent"] })` with both `.claude/` and `.codex/` directories — returns only Claude items.
2. **Empty dialect filter**: `scanProject(dir, { dialects: [] })` returns no items.
3. **Unknown dialect in filter**: `scanProject(dir, { dialects: ["nonexistent"] })` returns no items (graceful).
4. **Path-scoped tasks**: Claude-style scanning with subdirectories as scopes — unchanged behavior.
5. **Flat (kebab-case) tasks**: Register a dialect with `scopeFormat: "kebab-case-prefix"` — scanner finds flat files only, no recursion.
6. **Custom task directory**: Register a dialect with a non-default task directory — scanner reads from the correct path.
7. **Fallback without config**: Dialects without `taskConfig`/`skillConfig` use field mapping fallback.
8. **Backward compatibility**: All existing tests pass unchanged.
