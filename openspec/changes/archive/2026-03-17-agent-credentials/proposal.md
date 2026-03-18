## Why

Roles contain agent-specific credentials (e.g., `CLAUDE_CODE_OAUTH_TOKEN`) in their `governance.credentials` field, but roles are meant to be agent-agnostic. Agent-specific credentials (like an OAuth token for Claude Code) should have a better default home — the agent itself — so roles don't need to declare them at all unless they want to add extras. The `AgentPackage.runtime.credentials` field in the SDK already declares agent-specific credentials; agent config entries in `.mason/config.json` should also support this for per-project configuration.

## What Changes

- Agent packages implementing the SDK already declare required credentials via `runtime.credentials` — this serves as the default credential source for that agent
- Agent entries in `.mason/config.json` gain an optional `credentials` field to allow per-project credential additions beyond what the SDK declares
- Roles retain the ability to specify `governance.credentials` for role-specific additions (e.g., extra API keys a particular role needs)
- Final credential list is a merge of: agent SDK defaults + agent config credentials + role credentials (deduped)

## Capabilities

### New Capabilities
- `agent-config-credentials`: Agent entries in `.mason/config.json` support a `credentials` field (array of env var name strings) that merges with the agent SDK's `runtime.credentials` and any role-declared credentials

### Modified Capabilities
- `agent-config-extended-properties`: Agent config entries gain the new `credentials` field alongside existing `home`, `mode`, `role`, and `package` properties

## Impact

- Existing agent config schema: Add `credentials?: string[]` to agent entry schema in `packages/shared/src/schemas/`
- `packages/cli/src/cli/commands/run-agent.ts`: Merge agent config credentials into the credential resolution pipeline alongside SDK and role credentials
- `packages/agent-sdk/src/helpers.ts`: `generateAgentLaunchJson` accepts agent-config credentials as an additional merge source
- No changes to role schema — roles keep `governance.credentials` as-is
