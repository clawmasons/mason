# Role Channels — Product Requirements Document

**Version:** 0.1.0 · Draft
**Date:** April 2026
**Author:** ClawForge, Inc.

---

## 1. Problem Statement

Mason roles run inside Docker containers with no mechanism for receiving external messages during a session. An agent can interact with MCP servers and the project filesystem, but there is no way for a human on Slack (or another messaging platform) to send instructions, ask questions, or approve tool use while the agent is running.

This creates friction for teams that want:

- **Async oversight:** A team lead on Slack wants to guide or redirect an agent mid-session without terminal access.
- **Remote approval:** An on-call engineer wants to approve or deny tool-use permission prompts from their phone.
- **Event-driven workflows:** External events (CI failures, alerts, chat mentions) should be able to trigger agent action without polling.

Claude Code supports a **channels** protocol — MCP servers that push events into sessions and optionally expose reply tools. Mason needs to integrate this protocol into its role definition, materialization, and agent launch pipeline.

---

## 2. Goals

### User Goals
- A role author can declare a channel in ROLE.md frontmatter and have it automatically configured at runtime.
- A Slack user can send messages to a running agent and receive replies.
- A Slack user can approve or deny Claude Code permission prompts remotely.

### Technical Goals
- The `channel` field in ROLE.md is generic — any channel type string is accepted, enabling future channel implementations without schema changes.
- The Slack channel MCP server is packaged as a standalone JS bundle, included in the claude-code-agent npm package, and copied into Docker containers.
- The materializer and agent-runner automatically configure the channel MCP server and Claude Code launch flags when a role specifies a channel.

### Measurable Outcomes
- A role with a `channel` field (type `slack`) materializes and runs successfully with two-way Slack messaging.
- Permission relay works end-to-end: Claude Code forwards approval prompts to Slack, and Slack verdicts are applied.
- The channel MCP server builds as a standalone bundle in mason-extensions CI.

---

## 3. Non-Goals

- **Non-Claude agents:** Channel support is Claude Code-only for this PRD. Codex, Aider, and other runtimes are not in scope.
- **Non-Slack channels:** The schema supports arbitrary channel types, but only `slack` is implemented. Telegram, Discord, etc. are future work.
- **Channel authoring documentation:** No public guide for building custom channel servers. Internal implementation only.
- **Channel marketplace or plugin system:** Channels are bundled with the agent package, not dynamically installed.
- **Changes to Claude Code itself:** This PRD uses Claude Code's existing `--dangerously-load-development-channels` flag and MCP channel protocol as-is.

---

## 4. User Stories

**US-1:** As a role author, I want to add a `channel` section (with type `slack`) to my ROLE.md so that the agent can receive and reply to Slack messages during a session.

**US-2:** As a Slack user, I want to DM or mention the bot in a channel and have my message delivered to the running agent, so I can give instructions without terminal access.

**US-3:** As a Slack user, I want to approve or deny Claude's tool-use permission prompts from Slack, so I can supervise the agent from my phone.

**US-4:** As a mason maintainer, I want the Slack channel server packaged as a standalone JS file in the claude-code-agent npm package, so it is available in Docker containers without additional installs.

**US-5:** As a role author, I want channel credentials (SLACK_BOT_TOKEN, SLACK_APP_TOKEN) declared in the role's `credentials` field, so they are injected at runtime via the existing credential service.

---

## 5. Requirements

### P0 — Must-Have

**REQ-001: `channel` Field in ROLE.md Frontmatter**

Add a `channel` field to the ROLE.md frontmatter schema. The field is generic — it accepts any channel type string — but only `slack` is implemented in this PRD.

The field supports two forms:

```yaml
# Short form — just the channel type, no args
channel: slack

# Long form — channel type with additional args
channel:
  type: slack
  args: ["--some-flag", "value"]
```

The parser normalizes the short form `channel: slack` into `{ type: "slack", args: [] }` internally.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `channel` | string \| object | No | Channel configuration. A plain string is shorthand for `{ type: "<string>", args: [] }`. |
| `channel.type` | string | Yes (if object form) | Channel type identifier (e.g., `slack`). Maps to a bundled channel server. |
| `channel.args` | string[] | No | Additional arguments passed to the channel server process. |

Acceptance criteria:
- Given a ROLE.md with a `channel` field, when parsed by `readMaterializedRole()`, then the channel config is present in the resolved `Role` object.
- Given a ROLE.md without a `channel` field, when parsed, then the role has no channel config (backward compatible).
- Given an unknown channel type (e.g., `telegram`), when parsed, then parsing succeeds (schema does not restrict type values) but materialization fails with a clear error listing supported types.

**REQ-002: Schema Changes in `@clawmasons/shared`**

Add the `channel` field to the role type schema in `packages/shared/src/schemas/role-types.ts`:

```typescript
const channelConfigSchema = z.object({
  type: z.string(),
  args: z.array(z.string()).optional(),
});

// Accepts both short form (string) and long form (object)
const channelFieldSchema = z.union([z.string(), channelConfigSchema]);

// Add to roleSchema:
channel: channelFieldSchema.optional(),
```

The parser normalizes the string form: if `channel` is a plain string, it is converted to `{ type: "<string>", args: [] }` before validation continues.

Update the `Role` type to include `channel?: ChannelConfig`.

Update the role parser (`packages/shared/src/role/parser.ts`) to extract the `channel` field from frontmatter and include it in the normalized role output.

Acceptance criteria:
- Given the shared package, when `roleSchema` is used to validate a role with a `channel` field, then validation passes.
- Given the shared package, when `roleSchema` is used to validate a role without a `channel` field, then validation passes (optional field).
- Given the `Role` TypeScript type, when accessed, then `channel` is available as an optional property with `type` and `args` fields.

**REQ-003: mason-extensions `mcp/` Directory**

Add a new `mcp/` top-level directory to the mason-extensions monorepo for MCP server packages. Update the workspace configuration to include `mcp/*` packages.

```
mason-extensions/
├── package.json          # workspaces: ["agents/*", "roles/*", "skills/*", "mcp/*"]
├── agents/
├── roles/
├── skills/
└── mcp/
    └── claude-slack-channel/
        ├── package.json
        ├── src/
        │   └── server.ts
        ├── tests/
        └── dist/
            └── server.js    # standalone esbuild bundle
```

Acceptance criteria:
- Given `mason-extensions/`, when `npm install` is run, then the `mcp/claude-slack-channel` workspace installs correctly.
- Given `mason-extensions/`, when `npm run build` is run, then the channel server compiles and bundles.

**REQ-004: `claude-slack-channel` MCP Server Package**

Create `mcp/claude-slack-channel/` in mason-extensions containing the Slack channel MCP server. This server implements the Claude Code channel protocol:

- Declares `claude/channel` and `claude/channel/permission` capabilities.
- Connects to Slack via Socket Mode (`@slack/socket-mode`).
- Forwards Slack messages to Claude Code as `notifications/claude/channel` events.
- Exposes MCP tools for replying, reacting, editing messages, fetching history, and downloading attachments.
- Implements permission relay: forwards tool-approval prompts to Slack and parses verdicts.
- Gates inbound messages on a sender allowlist.

Dependencies:
```json
{
  "dependencies": {
    "@modelcontextprotocol/sdk": "^1.27.1",
    "@slack/socket-mode": "^2.0.6",
    "@slack/web-api": "^7.15.0",
    "zod": "^3.25.0"
  }
}
```

The server source is based on the reference implementation at `github.com/jeremylongshore/claude-code-slack-channel`.

Acceptance criteria:
- Given the channel server source, when compiled, then it produces valid JavaScript with no type errors.
- Given unit tests, when run, then MCP notification formatting, sender gating, and permission verdict parsing pass.
- Given a running Slack workspace with valid tokens, when the server starts, then it connects via Socket Mode and begins receiving events.

**REQ-005: Standalone JS Bundle via esbuild**

Build the channel server as a standalone JavaScript file using esbuild, following the same pattern as the proxy bundle in `packages/cli/esbuild.proxy.ts`.

```typescript
// mcp/claude-slack-channel/esbuild.config.ts
import { build } from "esbuild";

await build({
  entryPoints: ["src/server.ts"],
  bundle: true,
  outfile: "dist/server.js",
  platform: "node",
  target: "node22",
  format: "cjs",
  sourcemap: true,
  minify: false,
});
```

Add build script to `mcp/claude-slack-channel/package.json`:
```json
{
  "scripts": {
    "build": "tsx esbuild.config.ts",
    "build:bundle": "tsx esbuild.config.ts"
  }
}
```

Acceptance criteria:
- Given `npm run build` in `mcp/claude-slack-channel/`, when esbuild runs, then `dist/server.js` is produced as a self-contained file.
- Given `dist/server.js`, when run with `node dist/server.js`, then the server starts without requiring external `node_modules`.

**REQ-006: Include Channel in claude-code-agent Package**

Update the `@clawmasons/claude-code-agent` package to include the Slack channel server bundle in its published files.

The build process copies `mcp/claude-slack-channel/dist/server.js` to `agents/claude-code-agent/dist/channels/slack/server.js`.

Update `agents/claude-code-agent/package.json`:
```json
{
  "files": ["dist"]
}
```

The `dist/` directory structure after build:
```
agents/claude-code-agent/dist/
├── index.js
├── materializer.js
└── channels/
    └── slack/
        └── server.js
```

Acceptance criteria:
- Given `npm run build` in mason-extensions, when the claude-code-agent package is built, then `dist/channels/slack/server.js` exists.
- Given the published `@clawmasons/claude-code-agent` package, when installed, then `channels/slack/server.js` is present in the package's `dist/` directory.

**REQ-007: Dockerfile Copies Channels Directory**

When a role specifies a channel, the materializer copies the channel server bundle into the Docker build context directory and adds a `COPY` line to the generated Dockerfile. This follows the same pattern as workspace files — the materializer writes files into the build context at `<role>/<runtime>/build/`, and the Dockerfile `COPY`s them into the image.

The materializer:
1. Resolves the channel server bundle path from the installed `@clawmasons/claude-code-agent` package (e.g., `dist/channels/slack/server.js`).
2. Copies it into the build context at `<role>/<runtime>/channels/slack/server.js`.
3. Adds a `COPY` line to the generated Dockerfile:

```dockerfile
# Copy channel server(s) into container
COPY --chown=mason:mason <role>/<runtime>/channels/ /home/mason/channels/
```

Result in container:
```
/home/mason/channels/
└── slack/
    └── server.js
```

Acceptance criteria:
- Given a materialized Docker build directory for a role with a channel, when the build context is inspected, then the channel server bundle exists in the build context.
- Given the generated Dockerfile, when inspected, then it includes a `COPY` instruction for the channels directory.
- Given a built Docker image, when inspected, then `/home/mason/channels/slack/server.js` exists.
- Given a role without a channel, when materialized, then no channels directory or `COPY` line is added.

**REQ-008: Materializer Injects Channel MCP Server Config**

When a role specifies a `channel`, the materializer adds an MCP server entry to `.claude.json` — the same file where the proxy MCP server is already configured. The server name follows the pattern `{channel-type}-channel`.

The materializer's `materializeWorkspace()` already merges MCP server entries into `.claude.json` via the `mcpServers` field. The channel entry is added alongside the existing proxy entry:

```json
{
  "mcpServers": {
    "mason": { "type": "http", "url": "..." },
    "slack-channel": {
      "command": "node",
      "args": ["/home/mason/channels/slack/server.js", ...channelArgs]
    }
  }
}
```

Where `channelArgs` are the `args` from the role's `channel` config, appended after the server path.

Acceptance criteria:
- Given a role with `channel.type: slack` and `channel.args: ["--flag"]`, when materialized, then the MCP config includes a `slack-channel` server entry with args `["/home/mason/channels/slack/server.js", "--flag"]`.
- Given a role without a `channel` field, when materialized, then no channel MCP server entry is added.
- Given the materializer, when a role specifies an unsupported channel type, then materialization fails with a clear error message.

**REQ-009: Agent Runner Adds Channel Launch Flag**

When a role has a channel configured, the agent launch configuration must include the `--dangerously-load-development-channels` flag so Claude Code registers the channel MCP server's notification listener.

Update `generateAgentLaunchJson()` in `packages/agent-sdk/src/helpers.ts` (or the claude-code-agent materializer) to append:

```
--dangerously-load-development-channels server:{channel-type}-channel
```

For example, a role with `channel: { type: slack }` produces:
```json
{
  "command": "claude",
  "args": [
    ...existingArgs,
    "--dangerously-load-development-channels",
    "server:slack-channel"
  ]
}
```

Acceptance criteria:
- Given a role with `channel.type: slack`, when `generateAgentLaunchJson()` is called, then the args include `--dangerously-load-development-channels server:slack-channel`.
- Given a role without a channel, when `generateAgentLaunchJson()` is called, then no channel-related args are added.

---

### P1 — Nice-to-Have

**REQ-010: Channel Credential Validation**

When a role specifies a channel type, validate that the required credentials for that channel type are declared in the role's `credentials` field. For `slack`, require `SLACK_BOT_TOKEN` and `SLACK_APP_TOKEN`.

```
Error: Role "my-role" declares channel type "slack" but is missing required credentials.
  Add to your ROLE.md credentials field: SLACK_BOT_TOKEN, SLACK_APP_TOKEN
```

Acceptance criteria:
- Given a role with `channel.type: slack` but no Slack credentials in `credentials`, when validated, then a clear error message is shown.
- Given a role with `channel.type: slack` and both Slack credentials declared, when validated, then no error.

---

### P2 — Future Consideration

**REQ-011: Multiple Channels per Role**

Support an array of channels in a single role, allowing an agent to be connected to multiple messaging platforms simultaneously.

**REQ-012: Additional Channel Types**

Implement channel servers for Telegram, Discord, and other platforms following the same packaging pattern.

**REQ-013: Channel Plugin Marketplace Integration**

Once Claude Code channels move out of research preview, replace `--dangerously-load-development-channels` with the official channel plugin registration mechanism.

---

## 6. Use Cases

### UC-1: Define and Run a Role with Slack Channel

**Actor:** Role author / developer.
**Goal:** Create a role that connects to Slack for two-way messaging.

**Flow:**
1. Developer creates a Slack app with Socket Mode enabled, obtains `SLACK_BOT_TOKEN` and `SLACK_APP_TOKEN`.
2. Developer creates `.claude/roles/slack-assistant/ROLE.md` with:
   ```yaml
   ---
   name: slack-assistant
   description: An assistant reachable via Slack
   credentials: ['SLACK_BOT_TOKEN', 'SLACK_APP_TOKEN']
   channel: slack
   ---
   You are an assistant. Respond to Slack messages helpfully.
   ```
3. Developer runs `mason run claude --role slack-assistant`.
4. Mason parses ROLE.md, detects channel config, materializes Docker build directory with:
   - Channel MCP server config in `.claude.json` (alongside proxy config)
   - Channels directory copied into container
   - Agent launch args include `--dangerously-load-development-channels server:slack-channel`
5. Docker container starts. Claude Code launches with the channel flag.
6. The Slack channel MCP server connects via Socket Mode.
7. A Slack user DMs the bot. The message arrives in Claude's context as a `<channel>` tag.
8. Claude processes the message and replies via the `reply` MCP tool.

**Acceptance Criteria:**
- End-to-end: Slack message in → Claude processes → reply appears in Slack.
- Channel credentials are injected via the credential service, never baked into images.
- No changes to ROLE.md are needed beyond adding the `channel` field and credentials.

### UC-2: Permission Relay via Slack

**Actor:** On-call engineer monitoring an agent from Slack.
**Goal:** Approve or deny Claude's tool-use requests from Slack.

**Flow:**
1. Agent is running with a Slack channel (UC-1 setup).
2. Claude wants to run a Bash command and triggers a permission prompt.
3. Claude Code forwards the prompt to the Slack channel MCP server.
4. The Slack channel server posts the prompt to the configured Slack channel with approve/deny buttons.
5. The engineer taps "Approve" (or replies `yes <id>`).
6. The verdict is sent back to Claude Code, which proceeds with the tool call.

**Acceptance Criteria:**
- Permission prompts appear in Slack with tool name, description, and request ID.
- Both button interactions and text replies (`yes/no <id>`) work.
- The local terminal permission dialog also remains active (first response wins).

### UC-3: Channel Server Packaging and Distribution

**Actor:** Mason maintainer.
**Goal:** The Slack channel server is bundled and distributed with the claude-code-agent package.

**Flow:**
1. In mason-extensions, `mcp/claude-slack-channel/` contains the server source.
2. `npm run build` bundles it to `dist/server.js` via esbuild.
3. The claude-code-agent build copies `dist/server.js` to `dist/channels/slack/server.js`.
4. `npm publish` of `@clawmasons/claude-code-agent` includes the channel bundle.
5. When mason installs the agent package, the channel server is available in `node_modules/`.
6. The materializer references the channel server path in the Dockerfile COPY instruction.

**Acceptance Criteria:**
- `dist/channels/slack/server.js` is a self-contained Node.js script with no external dependencies.
- The published npm package includes the channel server.
- The Docker image contains the channel server at `/home/mason/channels/slack/server.js`.

---

## 7. Architecture

### 7.1 Component Flow

```
ROLE.md (channel.type: slack)
    ↓ readMaterializedRole()
Role (with channel config)
    ↓ materializeForAgent()
    ├── .claude.json mcpServers: { "slack-channel": { command: "node", args: ["/home/mason/channels/slack/server.js"] } }
    ├── Dockerfile: COPY channels/ → /home/mason/channels/
    └── agent-launch.json: args include --dangerously-load-development-channels server:slack-channel
    ↓ docker compose up
Container
    ├── Claude Code (with channel flag)
    │   └── Spawns /home/mason/channels/slack/server.js as MCP subprocess
    │       └── Connects to Slack via Socket Mode
    └── MCP Proxy (existing, unchanged)
```

### 7.2 File Changes by Repository

**mason (this repo):**
```
packages/shared/src/schemas/role-types.ts    — Add channelConfigSchema
packages/shared/src/role/parser.ts           — Extract channel from frontmatter
packages/agent-sdk/src/helpers.ts            — Add channel args to launch config
```

**mason-extensions:**
```
package.json                                  — Add "mcp/*" to workspaces
mcp/claude-slack-channel/
├── package.json                              — Package with esbuild + deps
├── esbuild.config.ts                         — Standalone bundle config
├── src/server.ts                             — Slack channel MCP server
├── src/lib.ts                                — Security helpers
├── tests/                                    — Unit tests
└── dist/server.js                            — Built bundle

agents/claude-code-agent/
├── src/materializer.ts                       — Add channel MCP config + Dockerfile COPY + launch args
└── dist/channels/slack/server.js             — Copied from mcp/ at build time
```

### 7.3 Credential Flow

```
ROLE.md credentials: ['SLACK_BOT_TOKEN', 'SLACK_APP_TOKEN']
    ↓
Credential service (host process, existing)
    ↓
Docker Compose environment variables
    ↓
Channel server process env (inherited from Claude Code process)
    ↓
Slack Socket Mode connection
```

Credentials are never embedded in Docker images or workspace files. They flow through the existing credential service at session start.

---

## 8. Open Questions

| # | Question | Owner | Blocking? |
|---|----------|-------|-----------|
| Q1 | ~~Should the channel MCP server config go in `.claude/settings.json` or a separate `.mcp.json`?~~ **Resolved:** Goes in `.claude.json` `mcpServers`, same as the proxy entry. | Engineering | No |
| Q2 | When Claude Code channels exit research preview, how do we migrate from `--dangerously-load-development-channels` to the official mechanism? | Engineering | No |
| Q3 | Should the channel server's Slack access control (pairing, allowlists) be configurable via ROLE.md or only via the server's own config files? | Engineering | No |
| Q4 | Should the esbuild bundle for the channel server be built as CJS (like proxy) or ESM? | Engineering | No |
| Q5 | Does the channel server need to be copied into Docker at build time, or can it be mounted from the host? Build-time copy is simpler and matches the proxy pattern. | Engineering | No |
