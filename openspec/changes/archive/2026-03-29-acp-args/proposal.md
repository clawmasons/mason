## Why

Most ACP clients (VS Code extensions, IDE integrations) don't support selecting agent/role/source via the ACP protocol's `setSessionConfigOption` method. Users need a way to pin these values at startup so the ACP server uses them directly without requiring client-side selection UI.

## What Changes

- Add `--agent <name>` option to `mason acp` command to pin the agent for all sessions on that connection
- Add `--role <name>` option to `mason acp` command to pin the role for all sessions on that connection
- Add `--source <path>` option to `mason acp` command to pin the agent source directory
- When `--agent` or `--role` are specified via CLI args, those config options are **not** sent to the client as selectable modes (they're removed from `config_option_update` session updates)
- Pinned values are used directly when spawning `mason run` subprocess, overriding any discovery defaults
- `setSessionConfigOption` calls for pinned options should be rejected or ignored

## Capabilities

### New Capabilities
- `acp-cli-args`: CLI argument handling for the `mason acp` command — parsing `--agent`, `--role`, and `--source` flags, storing them as pinned values, and filtering them from client-facing config options

### Modified Capabilities
- `acp-session`: Session creation and config option delivery must respect pinned values — skip discovery for pinned fields and exclude them from `config_option_update` payloads sent to the client

## Impact

- **CLI**: `packages/cli/src/acp/acp-command.ts` — add argument definitions
- **ACP agent handler**: `packages/cli/src/acp/acp-agent.ts` — consume pinned args in `newSession`, filter config options, reject `setSessionConfigOption` for pinned values
- **Prompt executor**: `packages/cli/src/acp/prompt-executor.ts` — pass pinned source to `mason run` args
- **Discovery cache**: May need to accept overrides for pinned agent/role instead of auto-discovering
