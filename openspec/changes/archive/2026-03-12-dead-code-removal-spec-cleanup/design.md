# Design: Dead Code Removal and Spec Cleanup

## Architecture Decisions

### AD-1: Remove `agent` from `chapter.type` enum

The `chapter.type` enum in `chapter-field.ts` currently allows `["app", "skill", "task", "role", "agent"]`. Per PRD §9.3, the `agent` type is removed. The new valid types are `["app", "skill", "task", "role"]`.

**Impact:** Any existing `package.json` with `chapter.type = "agent"` will fail schema validation. This is intentional — users should migrate to role-based definitions.

### AD-2: Remove `agent.ts` schema entirely

The `AgentChapterField` type and `agentChapterFieldSchema` are only used for validating agent packages. Since agent packages are deprecated, the schema file is deleted.

**Impact:** All imports of `AgentChapterField` and `agentChapterFieldSchema` must be removed from the codebase.

### AD-3: Keep `ResolvedAgent` type but remove `resolveAgent` function

The `ResolvedAgent` interface in `types.ts` is still used throughout the codebase as the data structure that the materializer, proxy, and session management consume. It stays.

The `resolveAgent` function in `resolve.ts` (which discovers `chapter.type === "agent"` packages and builds a `ResolvedAgent` from the dependency graph) is removed. Commands that need a `ResolvedAgent` should use the role-based adapter (`adaptRoleToResolvedAgent`) instead.

### AD-4: Update commands to use role-based discovery

Commands that scan for `chapter.type === "agent"` packages are updated:

- **`build`**: Already has role materializer support. Remove agent package scanning. Use role discovery to find roles and materialize them.
- **`proxy`**: The proxy command takes `--agent <name>` to specify an agent package. Since agent packages are removed, the proxy should accept a role reference and construct a ResolvedAgent via the adapter.
- **`docker-init`**: Similarly updated to use role discovery.
- **`run-agent` (ACP mode)**: Already has the role-based pipeline from Changes 1-10. Remove the agent package fallback.
- **`validate`**: Already has role-first validation. Remove the agent fallback path.
- **`permissions`**: Updated to accept role names and use the adapter.
- **`init-role`**: The `resolveAgentsForRole` function scans for agent packages. Updated to work without agent packages.

### AD-5: Remove hidden `agent` command alias

The hidden `agent` command in `run-agent.ts` (backward compatibility alias) is removed. Users must use `clawmasons run <agent-type> --role <name>`.

### AD-6: Update spec files

Nine spec files reference `agent` package type or `clawmasons agent` command. These are updated to use role-centric terminology.

## Detailed Changes

### 1. Schema Changes (`packages/shared/`)

```
DELETE: src/schemas/agent.ts
MODIFY: src/schemas/chapter-field.ts
  - Remove import of agentChapterFieldSchema, AgentChapterField
  - Remove "agent" from chapterTypeValues
  - Remove "agent" from schemasByType
  - Remove AgentChapterField from ChapterField union type
MODIFY: src/schemas/index.ts
  - Remove agent exports
MODIFY: src/index.ts
  - Remove agent schema and type exports
```

### 2. CLI Changes (`packages/cli/`)

```
MODIFY: src/index.ts
  - Remove agentChapterFieldSchema and AgentChapterField exports
  - Remove resolveAgent export
MODIFY: src/resolver/resolve.ts
  - Remove resolveAgent function
  - Remove AgentChapterField import
  - Keep other resolve functions (resolveApp, resolveSkill, resolveTask, resolveRole)
MODIFY: src/resolver/index.ts
  - Remove resolveAgent export
MODIFY: src/cli/commands/build.ts
  - Remove agent package scanning, update to use role-based pipeline
MODIFY: src/cli/commands/proxy.ts
  - Remove agent package auto-detect, accept role-based input
MODIFY: src/cli/commands/run-agent.ts
  - Remove resolveAgentName (agent package scanner)
  - Remove hidden `agent` command alias
  - Remove resolveAgent import and usage in ACP mode
MODIFY: src/cli/commands/docker-init.ts
  - Remove agent package scanning
MODIFY: src/cli/commands/init-role.ts
  - Remove resolveAgentsForRole and agent-based resolution
MODIFY: src/cli/commands/validate.ts
  - Remove agent fallback path
MODIFY: src/cli/commands/permissions.ts
  - Update to accept role-based input
```

### 3. Test Changes

```
DELETE: tests/schemas/member.test.ts (tests agent schema)
MODIFY: tests/schemas/chapter-field.test.ts
  - Replace agent test with test verifying agent type is rejected
MODIFY: tests/resolver/resolve.test.ts
  - Remove resolveAgent tests (function removed)
MODIFY: tests/cli/build.test.ts
  - Update to not reference agent packages
MODIFY: tests/cli/proxy.test.ts
  - Update to not use resolveAgent mock
MODIFY: tests/cli/run-agent.test.ts
  - Remove resolveAgentName tests, update for role-based flow
MODIFY: tests/cli/run-acp-agent.test.ts
  - Update for role-based flow
MODIFY: tests/cli/init-role.test.ts
  - Remove resolveAgentsForRole tests
MODIFY: tests/cli/validate.test.ts
  - Remove agent validation tests
MODIFY: tests/cli/permissions.test.ts
  - Update for role-based input
ADD: tests/schemas/dead-code-removal.test.ts
  - Verify chapter.type = "agent" is rejected
  - Verify no dead imports remain
```

### 4. Spec File Updates

Update the following spec files to replace agent package references:
- `openspec/specs/cli-command-refactor/spec.md`
- `openspec/specs/acp-session/spec.md`
- `openspec/specs/mcp-agent-package/spec.md`
- `openspec/specs/agent-schema-acp-extension/spec.md`
- `openspec/specs/acp-proxy-cli-command/spec.md`
- `openspec/specs/mcp-test-agent/spec.md`
- `openspec/specs/workspace-init/spec.md`
- `openspec/specs/package-schema-validation/spec.md`
- `openspec/specs/docker-install-pipeline/spec.md`
