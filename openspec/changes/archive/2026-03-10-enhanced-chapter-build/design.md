# Design: Enhanced `chapter build` Command

**Date:** 2026-03-10

## Approach

The existing `build` command in `packages/cli/src/cli/commands/build.ts` is extended to run the full `build -> pack -> docker-init` pipeline. The command registration index is updated to remove `docker-init`, `run-init`, and `acp-proxy` as CLI entry points.

### Key Design Decisions

1. **Optional Agent Argument** -- The `<agent>` argument changes from required to optional. When omitted: if one agent exists, auto-detect it; if multiple exist, build all of them sequentially. This uses the same `resolveAgentName()` pattern from `acp-proxy.ts` for single-agent detection, extended for multi-agent discovery.

2. **Pipeline Composition** -- `runBuild()` calls `runPack()` and `runDockerInit()` as internal functions rather than duplicating their logic. This keeps the code DRY and ensures the individual functions remain testable independently.

3. **No `process.exit()` in Sub-Steps** -- The `pack` and `docker-init` functions currently call `process.exit(1)` on failure. The enhanced `runBuild()` orchestrates them and handles errors at the top level, re-throwing from sub-steps rather than exiting. To avoid changing the existing functions' signatures (which would affect their standalone usage), `runBuild` catches errors from each step.

4. **Completion Instructions** -- After successful build, the command prints:
   - How to run an agent interactively: `chapter run-agent <agent> <role>`
   - How to configure an ACP client with `run-acp-agent`
   - Example ACP client configuration JSON

5. **Command Removal** -- `docker-init`, `run-init`, and `acp-proxy` are removed from command registration only. Their source files and exported functions remain unchanged so internal imports and tests continue to work.

### Build Pipeline

```
chapter build [<agent>]
  |
  +-- 1. Discover packages
  +-- 2. Resolve agent(s) -- single auto-detect or all
  +-- 3. Validate agent graph
  +-- 4. Generate chapter.lock.json
  +-- 5. Pack workspace packages -> dist/*.tgz
  +-- 6. Docker-init: copy framework, extract tgz, generate Dockerfiles
  +-- 7. Display completion instructions
```

### Agent Resolution for Build

```typescript
// When agent argument provided: build that specific agent
// When omitted + 1 agent: auto-detect and build it
// When omitted + N agents: discover all and build each
```

### Completion Output Format

```
Build complete!

  Run an agent interactively:
    chapter run-agent <agent-name> <role-name>

  Configure an ACP client:
    chapter run-acp-agent --role <role-name>

  Example ACP client configuration:
    {
      "mcpServers": {
        "chapter": {
          "command": "chapter",
          "args": ["run-acp-agent", "--role", "<role-name>"]
        }
      }
    }
```

### Error Handling

| Scenario | Behavior |
|----------|----------|
| No packages found | Error: "No chapter packages found" |
| Agent not found | Error: "Agent <name> not found" |
| Validation fails | Error with validation details, exit 1 |
| Pack fails | Error: "Pack failed: <reason>" |
| Docker-init fails | Error: "Docker init failed: <reason>" |
| No .clawmasons/chapter.json | Error (from docker-init's readChapterConfig) |

### Backward Compatibility

- `chapter build <agent>` with explicit agent argument continues to work identically
- `--output` and `--json` options remain for the lock file step
- Internal imports of `runDockerInit()`, `runPack()`, etc. are unchanged
- The `docker-init`, `run-init`, and `acp-proxy` commands are fully removed (not deprecated)
