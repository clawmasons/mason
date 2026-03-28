## Context

The `refreshAgentLaunchJson()` function in `run-agent.ts` currently writes `agent-launch.json` into the build workspace directory at `.mason/docker/<role>/<agent>/workspace/`. This directory is bind-mounted into the container at `/home/mason/workspace/`, where `agent-entry` loads it. Because this path is shared across all sessions for a given role/agent pair, every session gets identical launch args.

For the resume feature (PRD sections 4.2 and 4.3), each session needs its own `agent-launch.json` so the CLI can inject session-specific arguments (e.g., `--resume <agentSessionId>`). The session directory (`.mason/sessions/{id}/`) must also be mounted into the container so agents can read `meta.json` and `agent-launch.json` from a known path.

## Goals / Non-Goals

**Goals:**
- Write `agent-launch.json` to `.mason/sessions/{id}/` instead of `.mason/docker/{role}/{agent}/workspace/`
- Mount `.mason/sessions/{id}/` into the container at `/home/mason/.mason/session/`
- Update `agent-entry` to load from `/home/mason/.mason/session/agent-launch.json` first
- Maintain backward compatibility for containers without the session mount

**Non-Goals:**
- Adding the `--resume` CLI flag (CHANGE 6)
- Writing `agentSessionId` to `meta.json` via hooks (CHANGE 5)
- Modifying the `AgentPackage` resume config (CHANGE 4)

## Decisions

### 1. `refreshAgentLaunchJson()` writes to session dir

The function signature changes from `(roleType, agentType, dockerBuildDir, options)` to `(roleType, agentType, sessionDir, options)`. The write target becomes `{sessionDir}/agent-launch.json` instead of `{dockerBuildDir}/{agentType}/workspace/agent-launch.json`.

All four call sites (interactive, json, print, devcontainer modes) are updated. The calls are moved after `createSessionDirectory()` since the session directory must exist before writing.

### 2. Session directory mount in compose

`generateSessionComposeYml()` adds a new volume line:
```
- {sessionDir}:/home/mason/.mason/session:rw
```

This is unconditional -- every session gets its mount. The mount path `/home/mason/.mason/session/` (singular, not plural) distinguishes the container-visible single-session view from the host's multi-session `.mason/sessions/` directory.

The mount is added after the logs mount and before the workspace mount in the volume ordering.

### 3. `agent-entry` search path order

The `loadLaunchConfig()` function in `agent-entry/src/index.ts` gains a new primary search path:
```typescript
const searchPaths = [
  "/home/mason/.mason/session/agent-launch.json",   // Per-session (primary)
  "/home/mason/workspace/agent-launch.json",          // Legacy workspace
  path.join(process.cwd(), "agent-launch.json"),      // CWD fallback
];
```

The session path is checked first. If missing (e.g., older container without session mount), it falls through to the legacy path. This ensures backward compatibility during migration.

### 4. Build workspace still gets `agent-launch.json` during `generateRoleDockerBuildDir()`

The initial `generateRoleDockerBuildDir()` call still writes `agent-launch.json` to the build workspace directory. This file is used as a template/reference and ensures the workspace mount has valid content even if `refreshAgentLaunchJson()` fails. The per-session copy in the session directory takes precedence at runtime via `agent-entry`'s search order.

### 5. No changes to `createSessionDirectory()`

The `createSessionDirectory()` function in `docker-generator.ts` already receives `sessionDir` and passes it to `generateSessionComposeYml()`. The session mount is added purely in the compose generation -- no structural changes to directory creation.

## Test Coverage

### docker-generator.test.ts
- **Session mount in compose**: Verify `generateSessionComposeYml()` output includes `:/home/mason/.mason/session` volume mount
- **Session mount path is relative**: Verify the host path in the mount is computed relative to sessionDir (uses `rel()`)

### agent-entry launch-config.test.ts
- **Loads from session path first**: Write config to a path mimicking `/home/mason/.mason/session/agent-launch.json`, verify it's found
- **Falls back to legacy path**: When session path doesn't exist, verify fallback to `/home/mason/workspace/agent-launch.json`
- **Falls back to CWD**: When neither fixed path exists, verify CWD fallback still works

### run-agent.test.ts
- **`refreshAgentLaunchJson` writes to session dir**: Verify the function writes `agent-launch.json` to the session directory path, not the build workspace path
