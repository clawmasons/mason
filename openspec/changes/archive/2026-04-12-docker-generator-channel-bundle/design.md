# Design: Docker Generator Copies Channel Bundle into Build Context

**Change:** CHANGE 5 from PRD `role-channels`
**Date:** 2026-04-12

## Overview

When a role has a `channel` field (e.g., `channel: slack`), the docker-generator must copy the channel MCP server bundle into the Docker build context's home directory so it ends up inside the container at `/home/mason/channels/{type}/server.js`.

The design follows existing patterns established by `copyAgentEntryBundle()` in `proxy-dependencies.ts`.

## Architecture

### Bundle Resolution Flow

```
Role.channel.type = "slack"
    |
    v
copyChannelBundle(dockerBuildDir, role, agentType)
    |
    v
createRequire(import.meta.url)
  .resolve(`@clawmasons/claude-code-agent/channels/slack`)
    |
    v (resolved path to .js bundle)
    |
    v
fs.cpSync(bundleSrc, {agentDir}/home/channels/slack/server.js)
```

### Docker Build Context Layout

After `copyChannelBundle()` runs:

```
.mason/docker/{role-name}/
  {agent-type}/
    home/
      channels/
        slack/
          server.js    <-- copied channel bundle
      .claude.json     <-- existing materialized config
    workspace/
      agent-launch.json
    Dockerfile
```

The existing Dockerfile line `COPY --chown=mason:mason {role}/{agent}/home/ /home/mason/` already handles this path, so no Dockerfile changes are needed.

### Container Result

```
/home/mason/
  channels/
    slack/
      server.js    <-- available to the channel MCP server config
  .claude.json     <-- mcpServers includes "slack-channel" entry (CHANGE 4)
```

## Implementation Details

### `copyChannelBundle()` Function

Location: `packages/cli/src/materializer/proxy-dependencies.ts`

```typescript
export function copyChannelBundle(
  dockerBuildDir: string,
  role: Role,
  agentType: string,
): void {
  if (!role.channel) return;

  const channelType = role.channel.type;
  const agentDir = path.join(dockerBuildDir, agentType);
  const dest = path.join(agentDir, "home", "channels", channelType, "server.js");

  if (fs.existsSync(dest)) return; // idempotent

  const require = createRequire(import.meta.url);
  let bundleSrc: string;
  try {
    bundleSrc = require.resolve(
      `@clawmasons/claude-code-agent/channels/${channelType}`
    );
  } catch {
    console.warn(
      `Warning: Channel bundle for "${channelType}" could not be resolved. ` +
      `The @clawmasons/claude-code-agent package may not include this channel yet.`
    );
    return;
  }

  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.cpSync(bundleSrc, dest);
}
```

Key decisions:
- Uses `createRequire` (same as `copyAgentEntryBundle`)
- Resolves from `@clawmasons/claude-code-agent/channels/{type}` -- maps to the `exports` field in the agent package (CHANGE 3 will add this)
- Warns and returns if resolution fails -- allows the build to succeed even before CHANGE 2+3 are done
- Idempotent -- skips copy if dest already exists

### Integration Points

**`build.ts`** -- called per-role in the build loop, after `generateRoleDockerBuildDir()`:
```typescript
const roleName = getAppShortName(role.metadata.name);
const dockerBuildDir = path.join(dockerDir, roleName);
copyChannelBundle(dockerBuildDir, role, agentType);
```

**`run-agent.ts`** -- called after `generateRoleDockerBuildDir()`:
```typescript
copyChannelBundle(dockerBuildDir, roleType, agentType);
```

### Test Coverage

Tests in `packages/cli/tests/materializer/docker-generator.test.ts`:

1. **Role with channel -- bundle copied**: Mock `createRequire` to return a resolvable path, verify `fs.cpSync` is called with the correct source/dest
2. **Role without channel -- no copy**: Verify `copyChannelBundle` returns early without any fs operations
3. **Missing bundle -- warning**: Mock `createRequire` to throw, verify warning is logged and function returns gracefully
4. **Idempotent**: When dest file exists, verify no copy is attempted

Since the function uses real `fs` and `createRequire`, tests will mock these dependencies. The test file for `copyChannelBundle` will be in a dedicated test block within `docker-generator.test.ts` (or a separate `proxy-dependencies.test.ts`).

## Impact Analysis

- No changes to the Dockerfile template (`agent-dockerfile.ts`)
- No changes to session compose generation
- No changes to the materializer
- The function is purely additive -- roles without channels are unaffected
- When CHANGE 2+3 deliver the actual bundle, this code will work without modification
