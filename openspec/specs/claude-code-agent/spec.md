## MODIFIED Requirements

### Requirement: RuntimeConfig renames supportsInitialPrompt to supportsAppendSystemPrompt

`RuntimeConfig` in `packages/agent-sdk/src/types.ts` SHALL rename the field `supportsInitialPrompt` to `supportsAppendSystemPrompt`. The doc comment SHALL describe it as indicating the runtime accepts role instructions via `--append-system-prompt <text>`.

#### Scenario: Field exists under new name
- **WHEN** `RuntimeConfig` is defined
- **THEN** the field SHALL be `supportsAppendSystemPrompt?: boolean`
- **AND** there SHALL be no field named `supportsInitialPrompt`

---

### Requirement: generateAgentLaunchJson injects instructions as --append-system-prompt flag pair

`generateAgentLaunchJson` in `packages/agent-sdk/src/helpers.ts` SHALL inject role instructions as the two-element sequence `["--append-system-prompt", instructions]` appended to `args`. The guard condition changes from `supportsInitialPrompt` to `supportsAppendSystemPrompt`.

#### Scenario: Instructions injected as flag pair
- **WHEN** `generateAgentLaunchJson` is called with `instructions = "Do the thing"`, `agentPkg.runtime.supportsAppendSystemPrompt = true`, and `acpMode = false`
- **THEN** the resulting `args` SHALL contain `"--append-system-prompt"` immediately followed by `"Do the thing"`
- **AND** `"Do the thing"` SHALL NOT appear as a bare positional argument without the flag preceding it

#### Scenario: agentArgs appended after flag pair
- **WHEN** `instructions` and `agentArgs` are both provided and `supportsAppendSystemPrompt = true`
- **THEN** `args` SHALL be `[...baseArgs, "--append-system-prompt", instructions, ...agentArgs]`

#### Scenario: Instructions not injected in ACP mode
- **WHEN** `acpMode = true`
- **THEN** `--append-system-prompt` SHALL NOT appear in `args`

#### Scenario: Instructions not injected when flag is false or absent
- **WHEN** `supportsAppendSystemPrompt` is `false` or not declared
- **THEN** `--append-system-prompt` SHALL NOT appear in `args`

#### Scenario: Instructions not injected when instructions is undefined
- **WHEN** `instructions = undefined` and `supportsAppendSystemPrompt = true`
- **THEN** `--append-system-prompt` SHALL NOT appear in `args`

---

### Requirement: claude-code-agent declares supportsAppendSystemPrompt

`packages/claude-code-agent/src/index.ts` SHALL declare `supportsAppendSystemPrompt: true` on its `runtime` config and SHALL NOT declare `supportsInitialPrompt`.

#### Scenario: Field present under new name
- **WHEN** the `claudeCodeAgent` package is loaded
- **THEN** `claudeCodeAgent.runtime.supportsAppendSystemPrompt` SHALL be `true`
- **AND** `claudeCodeAgent.runtime` SHALL NOT have a `supportsInitialPrompt` property

---

### Requirement: claude-code-agent declares resume configuration

The `claude-code-agent` `AgentPackage` SHALL declare a `resume` field:
```typescript
resume: {
  flag: "--resume",
  sessionIdField: "agentSessionId",
}
```

This tells the CLI to pass `--resume <agentSessionId>` to Claude Code when resuming a session. Claude Code uses its own `--resume` flag to restore conversation state.

#### Scenario: Resume field present
- **WHEN** the `claudeCodeAgent` package is loaded
- **THEN** `claudeCodeAgent.resume` SHALL be defined
- **AND** `claudeCodeAgent.resume.flag` SHALL equal `"--resume"`
- **AND** `claudeCodeAgent.resume.sessionIdField` SHALL equal `"agentSessionId"`

---

### Requirement: AgentPackage interface defines the contract for agent packages

The system SHALL define an `AgentPackage` interface that all agent packages MUST implement. The interface SHALL include:
- `name: string` — the primary agent type identifier used in `mason run --agent <name>`
- `aliases?: string[]` — optional alternative names for the agent
- `materializer: RuntimeMaterializer` — the workspace materialization implementation
- `dockerfile?: DockerfileConfig` — optional Dockerfile generation hooks
- `acp?: AcpConfig` — optional ACP mode configuration
- `runtime?: RuntimeConfig` — optional runtime command configuration
- `resume?: { flag: string; sessionIdField: string }` — optional session resume configuration
- `jsonMode?: { jsonStreamArgs, buildPromptArgs?, parseJsonStreamAsACP }` — optional JSON streaming mode for ACP session update streaming

The claude-code-agent SHALL declare a `jsonMode` property on its `AgentPackage` with:
- `jsonStreamArgs: ["--output-format", "stream-json", "--verbose"]` (identical to `printMode.jsonStreamArgs`)
- `buildPromptArgs: (prompt) => ["-p", prompt]`
- `parseJsonStreamAsACP`: a parser function mapping Claude's stream-json NDJSON events to ACP session updates

#### Scenario: claude-code-agent declares jsonMode
- **WHEN** the `claudeCodeAgent` package is loaded
- **THEN** `claudeCodeAgent.jsonMode` SHALL be defined
- **AND** `claudeCodeAgent.jsonMode.jsonStreamArgs` SHALL equal `["--output-format", "stream-json", "--verbose"]`
- **AND** `claudeCodeAgent.jsonMode.buildPromptArgs` SHALL be a function

#### Scenario: Agent package implements full interface
- **WHEN** an agent package exports an `AgentPackage` object with `name` and `materializer`
- **THEN** it SHALL be accepted by the agent registry

#### Scenario: Agent package with optional fields omitted
- **WHEN** an agent package exports an `AgentPackage` with only `name` and `materializer` (no `dockerfile`, `acp`, or `runtime`)
- **THEN** it SHALL be accepted and the CLI SHALL use default values for omitted fields

---

### Requirement: claude-code-agent materializer forwards initialPrompt to generateAgentLaunchJson

`packages/claude-code-agent/src/materializer.ts` SHALL forward `options?.initialPrompt` as the `initialPrompt` argument to `generateAgentLaunchJson` in both `materializeWorkspace` and `materializeSupervisor`. It SHALL also forward `options?.jsonMode` as the `jsonMode` argument to `generateAgentLaunchJson`.

#### Scenario: initialPrompt forwarded in workspace materialization

- **WHEN** `materializeWorkspace` is called with `options.initialPrompt = "do this task"`
- **THEN** the generated `agent-launch.json` SHALL include `"do this task"` as the final positional arg in `args`
- **AND** it SHALL appear after `--append-system-prompt` and `agentArgs` if those are present

#### Scenario: initialPrompt forwarded in supervisor materialization

- **WHEN** `materializeSupervisor` is called with `options.initialPrompt = "do this task"`
- **THEN** the generated `agent-launch.json` SHALL include `"do this task"` as the final positional arg in `args`

#### Scenario: No initialPrompt — agent-launch.json unchanged

- **WHEN** materializer is called with no `initialPrompt` in options
- **THEN** the generated `agent-launch.json` SHALL NOT include any bare positional string in `args`

#### Scenario: jsonMode forwarded in workspace materialization

- **WHEN** `materializeWorkspace` is called with `options.jsonMode = true`
- **THEN** the call to `generateAgentLaunchJson` SHALL include `jsonMode: true`
- **AND** the resulting `agent-launch.json` SHALL include the agent's JSON streaming args

#### Scenario: jsonMode forwarded in supervisor materialization

- **WHEN** `materializeSupervisor` is called with `options.jsonMode = true`
- **THEN** the call to `generateAgentLaunchJson` SHALL include `jsonMode: true`
- **AND** the resulting `agent-launch.json` SHALL include the agent's JSON streaming args

#### Scenario: jsonMode not set — no JSON streaming args

- **WHEN** materializer is called without `jsonMode` in options
- **THEN** the generated `agent-launch.json` SHALL NOT include JSON streaming args

---

### Requirement: parseJsonStreamAsACP maps Claude assistant text blocks to agent_message_chunk

The `parseJsonStreamAsACP` parser SHALL map Claude `type: "assistant"` events containing `text` content blocks to ACP `agent_message_chunk` session updates. Each text block's `block.text` SHALL be mapped to `content.text`.

#### Scenario: Assistant event with single text block
- **WHEN** a Claude stream-json line has `type: "assistant"` with a single `text` content block containing `"Hello world"`
- **THEN** the parser SHALL return an `agent_message_chunk` update with `content.text` equal to `"Hello world"`

#### Scenario: Assistant event with empty text block
- **WHEN** a Claude stream-json line has `type: "assistant"` with a `text` content block containing `""`
- **THEN** the parser SHALL return an `agent_message_chunk` update with `content.text` equal to `""`

### Requirement: parseJsonStreamAsACP maps Claude assistant tool_use blocks to tool_call

The `parseJsonStreamAsACP` parser SHALL map Claude `type: "assistant"` events containing `tool_use` content blocks to ACP `tool_call` session updates. Each `tool_use` block SHALL be mapped as:
- `block.id` → `toolCallId`
- `block.name` → `title`
- `kind` → `"other"` (Claude does not provide tool categories)
- `status` → `"in_progress"`

#### Scenario: Assistant event with tool_use block
- **WHEN** a Claude stream-json line has `type: "assistant"` with a `tool_use` content block with `id: "toolu_123"` and `name: "Read"`
- **THEN** the parser SHALL return a `tool_call` update with `toolCallId: "toolu_123"`, `title: "Read"`, `kind: "other"`, `status: "in_progress"`

### Requirement: parseJsonStreamAsACP maps Claude user tool_result blocks to tool_call_update

The `parseJsonStreamAsACP` parser SHALL map Claude `type: "user"` events containing `tool_result` content blocks to ACP `tool_call_update` session updates. Each `tool_result` block SHALL be mapped as:
- `block.tool_use_id` → `toolCallId`
- `status` → `"completed"` (or `"failed"` if `block.is_error` is true)
- Content handling:
  - If `block.content` is a string: wrap as `[{type: "content", content: {type: "text", text: block.content}}]`
  - If `block.content` is an array: extract text blocks, wrap each in the ACP content structure
  - If `block.content` is missing/null: omit `content` from the update

#### Scenario: User event with tool_result containing string content
- **WHEN** a Claude stream-json line has `type: "user"` with a `tool_result` block with `tool_use_id: "toolu_123"` and `content: "file contents here"`
- **THEN** the parser SHALL return a `tool_call_update` with `toolCallId: "toolu_123"`, `status: "completed"`, and `content` wrapped in ACP format

#### Scenario: User event with tool_result containing error
- **WHEN** a Claude stream-json line has `type: "user"` with a `tool_result` block with `is_error: true`
- **THEN** the parser SHALL return a `tool_call_update` with `status: "failed"`

#### Scenario: User event with tool_result with null content
- **WHEN** a Claude stream-json line has `type: "user"` with a `tool_result` block with `content: null`
- **THEN** the parser SHALL return a `tool_call_update` without a `content` field

### Requirement: parseJsonStreamAsACP maps Claude result events to agent_message_chunk

The `parseJsonStreamAsACP` parser SHALL map Claude `type: "result"` events to ACP `agent_message_chunk` session updates. The `event.result` field SHALL be mapped to `content.text`. The parser SHALL skip result events where `is_error` is true or `result` is null/empty.

#### Scenario: Result event with text result
- **WHEN** a Claude stream-json line has `type: "result"` with `result: "Task completed successfully"`
- **THEN** the parser SHALL return an `agent_message_chunk` update with `content.text` equal to `"Task completed successfully"`

#### Scenario: Result event with error
- **WHEN** a Claude stream-json line has `type: "result"` with `is_error: true`
- **THEN** the parser SHALL return `null`

#### Scenario: Result event with null result
- **WHEN** a Claude stream-json line has `type: "result"` with `result: null`
- **THEN** the parser SHALL return `null`

### Requirement: parseJsonStreamAsACP handles multi-block assistant events

The `parseJsonStreamAsACP` parser SHALL handle `assistant` events containing multiple content blocks (e.g., text + tool_use interleaved). When a single event produces multiple ACP updates, the parser SHALL return an array of `AcpSessionUpdate` objects.

#### Scenario: Assistant event with text and tool_use blocks
- **WHEN** a Claude stream-json line has `type: "assistant"` with content blocks `[{type: "text", text: "Let me read that"}, {type: "tool_use", id: "toolu_1", name: "Read"}]`
- **THEN** the parser SHALL return an array with two updates: an `agent_message_chunk` and a `tool_call`

### Requirement: parseJsonStreamAsACP skips system events

The `parseJsonStreamAsACP` parser SHALL return `null` for Claude `type: "system"` events (init, api_retry, compact_boundary). These are infrastructure events and do not map to ACP session updates.

#### Scenario: System init event
- **WHEN** a Claude stream-json line has `type: "system"` with `subtype: "init"`
- **THEN** the parser SHALL return `null`

#### Scenario: Invalid JSON line
- **WHEN** a Claude stream-json line contains invalid JSON
- **THEN** the parser SHALL return `null`
