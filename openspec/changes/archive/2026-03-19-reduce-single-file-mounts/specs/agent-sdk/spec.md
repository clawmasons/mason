## REMOVED Requirements

### Requirement: SDK exports generateAgentsMd helper

**Reason**: `AGENTS.md` generation is removed from all agents (see `claude-code-materializer` delta). The helper has no remaining callers and retaining it invites accidental use.

**Migration**: Remove `generateAgentsMd` from `agent-sdk/src/helpers.ts`. Remove its export from `agent-sdk/src/index.ts`. Remove any re-export in `cli/src/materializer/common.ts`. Remove test cases for `generateAgentsMd` in `agent-sdk/tests/helpers.test.ts`.
