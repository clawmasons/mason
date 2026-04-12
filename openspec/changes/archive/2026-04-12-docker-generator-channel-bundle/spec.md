# Spec: Docker Generator Copies Channel Bundle into Build Context

**Change:** CHANGE 5 from PRD `role-channels`
**Date:** 2026-04-12

## Summary

When a role specifies a `channel` field, the docker-generator copies the channel MCP server bundle into the build context's home directory at `{agentDir}/home/channels/{type}/server.js`. The existing Dockerfile `COPY` instruction for the home directory picks it up without modifications.

## Specification

### `copyChannelBundle(dockerBuildDir, role, agentType)`

**Location:** `packages/cli/src/materializer/proxy-dependencies.ts`

**Parameters:**
- `dockerBuildDir: string` -- Absolute path to the role's build directory (e.g., `.mason/docker/{role-name}`)
- `role: Role` -- The parsed Role object (may or may not have `channel`)
- `agentType: string` -- The agent type (e.g., `"claude-code-agent"`)

**Behavior:**
1. If `role.channel` is undefined, return immediately (no-op for roles without channels)
2. Compute destination: `{dockerBuildDir}/{agentType}/home/channels/{role.channel.type}/server.js`
3. If destination already exists, return (idempotent)
4. Use `createRequire(import.meta.url)` to resolve `@clawmasons/claude-code-agent/channels/{role.channel.type}`
5. If resolution fails, log a warning and return (graceful degradation)
6. Create the destination directory with `fs.mkdirSync(..., { recursive: true })`
7. Copy the bundle with `fs.cpSync(source, dest)`

**Exports:** The function is exported from the module.

### Integration: `build.ts`

After `generateRoleDockerBuildDir()` in the per-role loop, call:
```typescript
copyChannelBundle(
  path.join(dockerDir, getAppShortName(role.metadata.name)),
  role,
  agentType,
);
```

### Integration: `run-agent.ts`

After `generateRoleDockerBuildDir()`, call:
```typescript
copyChannelBundle(dockerBuildDir, roleType, agentType);
```

### Acceptance Criteria

1. Given a role with `channel: { type: "slack", args: [] }`, when the build runs and the channel bundle is resolvable, then `{agentDir}/home/channels/slack/server.js` exists in the build context
2. Given a role without a `channel` field, when the build runs, then no `channels/` directory is created
3. Given a role with a channel but the bundle cannot be resolved (CHANGE 2+3 not done), when the build runs, then a warning is logged and the build continues
4. Given the function is called twice, the second call is a no-op (idempotent)
