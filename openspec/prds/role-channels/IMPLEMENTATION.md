# Role Channels — Implementation Plan

**PRD:** [openspec/prds/role-channels/PRD.md](./PRD.md)

---

## Key Design Decisions

1. **Channel field is a new top-level field on `roleSchema`.** The `channel` field accepts both short form (`channel: slack`) and long form (`channel: { type: slack, args: ["--flag"] }`). The parser normalizes string to `{ type, args: [] }` before schema validation.

2. **Channel flows through `Role.channel` → adapter → `ResolvedRole.channel`.** The adapter maps the parsed channel config to the ResolvedRole, making it available to materializers via the existing `ResolvedAgent.roles[]` path.

3. **Channel bundle resolution uses the home/ directory pattern.** The docker-generator copies the channel server bundle into `{agentDir}/home/channels/{type}/server.js`. The existing `COPY --chown=mason:mason {role}/{agent}/home/ /home/mason/` Dockerfile instruction picks it up without Dockerfile changes.

4. **Channel MCP config and launch args are materializer concerns.** The `claude-code-agent` materializer adds the channel MCP server entry to `.claude.json` `mcpServers` and appends `--dangerously-load-development-channels server:{type}-channel` to the agent launch args.

5. **Channel bundle path is resolved from the agent package.** The docker-generator finds the bundle via `require.resolve()` against the agent package's `exports` field, same pattern as the agent-entry bundle.

---

## Implementation Steps

### CHANGE 1: `channel` Field in Role Schema + Parser + Adapter

Add the `channel` field to the Zod schema, extract it from ROLE.md frontmatter in the parser, propagate through the adapter to `ResolvedRole`, and add `channelConfig` to `MaterializeOptions`.

**PRD refs:** REQ-001, REQ-002

**Summary:** Add `channelConfigSchema` (object with `type: string`, `args: z.array(z.string()).optional().default([])`) and `channelFieldSchema` (union of `z.string()` and `channelConfigSchema`) to `role-types.ts`. Add `channel: channelFieldSchema.optional()` to `roleSchema`. In `parser.ts`, extract `frontmatter.channel` and normalize string form to `{ type, args: [] }` before including in `roleData`. In `adapter.ts`, map `role.channel` to `resolvedRole.channel`. Add `channel?: { type: string; args: string[] }` to `ResolvedRole` in `types.ts`. Add `channelConfig?: { type: string; args: string[] }` to `MaterializeOptions` in `agent-sdk/types.ts`.

**User Story (US-1):** As a role author, I add `channel: slack` to my ROLE.md frontmatter. The parser accepts it and produces a Role with `channel: { type: "slack", args: [] }`. This flows through the adapter to `ResolvedRole.channel`.

**Scope:**
- Modify: `packages/shared/src/schemas/role-types.ts` — Add `channelConfigSchema`, `channelFieldSchema`, add `channel` to `roleSchema`
- Modify: `packages/shared/src/role/parser.ts` — Extract `frontmatter.channel`, normalize string→object, include in `roleData`
- Modify: `packages/shared/src/types/role.ts` — Export `ChannelConfig` type
- Modify: `packages/shared/src/types.ts` — Add `channel` to `ResolvedRole`
- Modify: `packages/shared/src/role/adapter.ts` — Map `role.channel` to `resolvedRole.channel` in `buildResolvedRole()`
- Modify: `packages/shared/src/role/merge.ts` — Preserve channel in merge (current wins, scalar semantics)
- Modify: `packages/agent-sdk/src/types.ts` — Add `channelConfig` to `MaterializeOptions`
- Add tests: `packages/shared/tests/role-parser.test.ts`
- Add tests: `packages/shared/tests/role-adapter.test.ts`

**Test cases:**
- `channel: slack` parsed to `{ type: "slack", args: [] }`
- `channel: { type: slack, args: ["--flag"] }` parsed to `{ type: "slack", args: ["--flag"] }`
- No `channel` field — role parses successfully, `channel` is undefined
- `channel: telegram` — parsing succeeds (schema accepts any type string)
- Adapter: Role with channel produces ResolvedRole with matching channel
- Adapter: Role without channel produces ResolvedRole with no channel field

**Testable output:** Unit tests pass. ROLE.md with `channel` field produces correct Role and ResolvedRole objects.

**Tests to run:**
- `npm run lint`
- `npm run build`
- `npx vitest run packages/shared/tests/`
- `npx vitest run packages/agent-sdk/tests/`
- In `../mason-extensions`: `npm run lint && npm run build && npm run test`

** Not Implemented Yet**

---

### CHANGE 2: `mcp/` Workspace and `claude-slack-channel` MCP Server Package

Add `mcp/*` to mason-extensions workspaces and create the `claude-slack-channel` MCP server package implementing the Claude Code channel protocol for Slack.

**PRD refs:** REQ-003, REQ-004

**Summary:** Add `"mcp/*"` to the `workspaces` array in mason-extensions root `package.json`. Create `mcp/claude-slack-channel/` with a Slack channel MCP server implementing `claude/channel` and `claude/channel/permission` capabilities. The server connects to Slack via Socket Mode, forwards messages as `notifications/claude/channel` events, exposes MCP tools for reply/react/edit/history/download, implements permission relay, and gates inbound messages on a sender allowlist. Dependencies: `@modelcontextprotocol/sdk`, `@slack/socket-mode`, `@slack/web-api`, `zod`.

The server source is based on the reference implementation at `github.com/jeremylongshore/claude-code-slack-channel`.

**User Story (US-4):** As a mason maintainer, I can develop and test the Slack channel MCP server as part of the mason-extensions monorepo.

**Scope:**
- Modify: `package.json` (root of mason-extensions) — Add `"mcp/*"` to workspaces
- Create: `mcp/claude-slack-channel/package.json` — Package definition with deps
- Create: `mcp/claude-slack-channel/tsconfig.json`
- Create: `mcp/claude-slack-channel/src/server.ts` — Main server (Socket Mode, MCP tools, channel/permission capabilities)
- Create: `mcp/claude-slack-channel/src/lib.ts` — Security helpers (sender gating, message formatting)
- Create: `mcp/claude-slack-channel/tests/server.test.ts` — Unit tests

**Test cases:**
- Message formatting produces correct `notifications/claude/channel` structure
- Sender gating: allowed sender passes, disallowed sender blocked
- Permission verdict parsing: `yes <id>` accepted, `no <id>` denied, garbage ignored
- MCP tool schemas validate (reply, react, edit_message, get_history, download_attachment)

**Testable output:** Package installs. TypeScript compiles. Unit tests pass.

**Tests to run:**
- `npm install` (to discover new workspace)
- In `../mason-extensions`: `npm run lint`
- In `../mason-extensions`: `npx tsc --noEmit`
- In `../mason-extensions`: `npm run test`
- `npm run lint` (in mason)
- `npm run build` (in mason)

** Not Implemented Yet**

---

### CHANGE 3: esbuild Bundle and Distribution in claude-code-agent

Bundle the channel server as a standalone JS file via esbuild and copy it into the claude-code-agent package's `dist/channels/slack/` directory.

**PRD refs:** REQ-005, REQ-006

**Summary:** Create `mcp/claude-slack-channel/esbuild.config.ts` (CJS bundle, node22 target, platform node, bundle true) to produce `dist/server.js`. Update the root build script to include the channel bundle step. Update `agents/claude-code-agent/package.json` to add a postbuild copy script that copies the bundle to `dist/channels/slack/server.js` and add an `exports` entry `"./channels/slack"` pointing to `"./dist/channels/slack/server.js"` so it can be resolved by `require.resolve()` from mason's docker-generator.

**User Story (US-4, UC-3):** As a mason maintainer, `npm run build` in mason-extensions produces `agents/claude-code-agent/dist/channels/slack/server.js` as a self-contained Node.js script that can run without `node_modules`.

**Scope:**
- Create: `mcp/claude-slack-channel/esbuild.config.ts` — Standalone bundle config
- Modify: `mcp/claude-slack-channel/package.json` — Add `build:bundle` script, add esbuild dev dep
- Modify: `agents/claude-code-agent/package.json` — Add postbuild copy, add `exports` entry
- Modify: `package.json` (root) — Update `build` script to include channel bundle step

**Test cases:**
- `npm run build` produces `mcp/claude-slack-channel/dist/server.js`
- `agents/claude-code-agent/dist/channels/slack/server.js` exists after root build
- Bundle is self-contained (can be invoked with `node dist/server.js` without external deps)

**Testable output:** Build produces the bundle at expected paths.

**Tests to run:**
- In `../mason-extensions`: `npm run build`
- In `../mason-extensions`: `ls agents/claude-code-agent/dist/channels/slack/server.js`
- In `../mason-extensions`: `npm run lint`
- In `../mason-extensions`: `npm run test`

** Not Implemented Yet**

---

### CHANGE 4: Materializer Injects Channel MCP Config and Launch Args

Update the claude-code-agent materializer to add the channel MCP server entry to `.claude.json` and the `--dangerously-load-development-channels` flag to `agent-launch.json` when a role has a channel configured.

**PRD refs:** REQ-008, REQ-009

**Summary:** In `materializeWorkspace()` (and `materializeSupervisor()`), read `agent.roles[0]?.channel`. If present:
1. Add `{type}-channel` MCP server entry to `.claude.json` `mcpServers`: `{ command: "node", args: ["/home/mason/channels/{type}/server.js", ...channelArgs] }`
2. Add `mcp__{type}-channel__*` to `.claude/settings.json` permissions allow list
3. Append `--dangerously-load-development-channels server:{type}-channel` to the agent args passed to `generateAgentLaunchJson()` via the `agentArgs` parameter

Validate channel type: check that `dist/channels/{type}/server.js` exists relative to the agent package. If not found, throw with clear error listing supported types.

**User Story (US-1, UC-1):** As a role with `channel: slack`, when materialized, my `.claude.json` has a `slack-channel` MCP server and my `agent-launch.json` includes the `--dangerously-load-development-channels server:slack-channel` flag.

**Scope:**
- Modify: `agents/claude-code-agent/src/materializer.ts` — Add channel MCP server to `.claude.json`, add channel args to launch, add permissions, validate channel type
- Add tests: `agents/claude-code-agent/tests/materializer.test.ts`

**Test cases:**
- Role with `channel.type: slack` → `slack-channel` MCP server in `.claude.json` with args `["/home/mason/channels/slack/server.js"]`
- Role with `channel.args: ["--flag"]` → args include `--flag` after server path
- `agent-launch.json` args include `--dangerously-load-development-channels server:slack-channel`
- `.claude/settings.json` permissions include `mcp__slack-channel__*`
- Role without channel → no channel artifacts
- Unknown channel type → clear error

**Testable output:** Unit tests pass. Materialization with channel produces correct config files.

**Tests to run:**
- In `../mason-extensions`: `npm run lint`
- In `../mason-extensions`: `npm run build`
- In `../mason-extensions`: `npm run test`

** Not Implemented Yet**

---

### CHANGE 5: Docker Generator Copies Channel Bundle into Build Context

Update the docker-generator to copy the channel server bundle into the home directory in the build context when a role specifies a channel.

**PRD refs:** REQ-007

**Summary:** In `generateRoleDockerBuildDir()`, after the materializer runs, check if `role.channel` is defined. If so:
1. Resolve the channel bundle path: use `createRequire(import.meta.url).resolve(`@clawmasons/claude-code-agent/channels/${role.channel.type}`)` — same pattern as `copyAgentEntryBundle()`.
2. Copy the bundle into `{agentDir}/home/channels/{type}/server.js`.
3. No Dockerfile changes needed — the existing `COPY --chown=mason:mason {role}/{agent}/home/ /home/mason/` instruction in `agent-dockerfile.ts` already covers this path.

If the agent package doesn't export the channel type (resolve fails), warn and continue (the materializer already validates this, so this is a safety net).

**User Story (UC-3):** As a role with `channel: slack`, when the Docker image is built, `/home/mason/channels/slack/server.js` exists inside the container.

**Scope:**
- Modify: `packages/cli/src/materializer/docker-generator.ts` — After materializer runs, if `role.channel` exists, resolve and copy channel bundle to `{agentDir}/home/channels/{type}/server.js`
- Add tests: `packages/cli/tests/materializer/docker-generator.test.ts` (or existing test file)

**Test cases:**
- Role with `channel.type: slack` → build context contains `{role}/{agent}/home/channels/slack/server.js`
- Role without channel → no `channels/` directory in build context
- Missing channel bundle → warning, build continues

**Testable output:** Unit tests pass. Build context contains channel bundle when role has channel.

**Tests to run:**
- `npm run lint`
- `npm run build`
- `npx vitest run packages/cli/tests/`
- In `../mason-extensions`: `npm run lint && npm run build && npm run test`

** Not Implemented Yet**

---

### CHANGE 6: End-to-End Integration Tests

Validate the full channel pipeline end-to-end across both repos.

**PRD refs:** All REQs (integration validation)

**Summary:** Add E2E tests validating:
1. A ROLE.md fixture with `channel: slack` and `credentials: ['SLACK_BOT_TOKEN', 'SLACK_APP_TOKEN']` materializes correctly with all channel artifacts
2. A ROLE.md without `channel` produces no channel artifacts (regression guard)
3. Long-form `channel: { type: slack, args: ["--debug"] }` passes args through correctly
4. Unknown channel type produces clear error

**User Story:** As a maintainer, E2E tests prove the full channel pipeline works from ROLE.md to Docker build artifacts.

**Scope:**
- In mason: extend or add tests in `packages/cli/tests/` for channel materialization
- In mason-extensions: extend `agents/claude-code-agent/tests/` for materializer channel behavior
- Create fixture ROLE.md with channel configuration

**Test cases:**
- ROLE.md with `channel: slack` → `.claude.json` has `slack-channel` MCP server, `agent-launch.json` has channel flag, build context has channel bundle
- ROLE.md without `channel` → none of the above
- ROLE.md with `channel: { type: slack, args: ["--debug"] }` → args passed through
- ROLE.md with `channel: telegram` → clear error about unsupported type

**Testable output:** All E2E tests pass in both repos.

**Tests to run:**
- `npm run lint`
- `npm run build`
- `npm run test`
- `npm run test:e2e`
- In `../mason-extensions`: `npm run lint`
- In `../mason-extensions`: `npm run build`
- In `../mason-extensions`: `npm run test`
- In `../mason-extensions`: `npm run test:e2e`

** Not Implemented Yet**

---

## Dependency Order

```
CHANGE 1 (schema + parser + adapter — mason)
    ↓          ↘
CHANGE 2        CHANGE 5
(MCP server     (docker-generator — mason)
 — extensions)
    ↓
CHANGE 3
(esbuild + dist
 — extensions)
    ↓
CHANGE 4
(materializer
 — extensions)
    ↓
CHANGE 6
(E2E tests — both repos)
```

CHANGE 1 is the foundation. CHANGE 2 and CHANGE 5 can be done in parallel after CHANGE 1. CHANGES 3 and 4 are sequential (packaging before materializer integration). CHANGE 6 validates everything.
