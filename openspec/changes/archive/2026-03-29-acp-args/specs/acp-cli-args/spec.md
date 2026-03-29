## ADDED Requirements

### Requirement: mason acp command accepts --agent, --role, and --source options

The `mason acp` command SHALL accept three optional CLI options: `--agent <name>`, `--role <name>`, and `--source <path>`. These options pin the respective values for the lifetime of the ACP connection.

#### Scenario: --agent option is accepted
- **WHEN** the user runs `mason acp --agent claude-code-agent`
- **THEN** the command starts successfully
- **AND** all sessions on this connection use agent `claude-code-agent`

#### Scenario: --role option is accepted
- **WHEN** the user runs `mason acp --role writer`
- **THEN** the command starts successfully
- **AND** all sessions on this connection use role `writer`

#### Scenario: --source option is accepted
- **WHEN** the user runs `mason acp --source ./my-source`
- **THEN** the command starts successfully
- **AND** the source path is resolved to an absolute path relative to process.cwd()

#### Scenario: All options combined
- **WHEN** the user runs `mason acp --agent claude --role writer --source ./src`
- **THEN** the command starts with all three values pinned

#### Scenario: No options provided (backward compatible)
- **WHEN** the user runs `mason acp` with no options
- **THEN** the command starts as before with no pinned values
- **AND** discovery defaults are used for all sessions

### Requirement: Pinned args are stored as connection-scoped state

Pinned argument values SHALL be stored as module-level state via a `setPinnedArgs()` function, called once from the command action before the ACP connection is created. A `getPinnedArgs()` function SHALL expose the current pinned values. A `clearPinnedArgs()` function SHALL reset state for testing.

#### Scenario: setPinnedArgs stores values
- **WHEN** `setPinnedArgs({ agent: "claude", role: "writer" })` is called
- **THEN** `getPinnedArgs()` returns `{ agent: "claude", role: "writer" }`

#### Scenario: clearPinnedArgs resets state
- **WHEN** `clearPinnedArgs()` is called
- **THEN** `getPinnedArgs()` returns `{}`

#### Scenario: Unset fields are undefined
- **WHEN** `setPinnedArgs({ agent: "claude" })` is called
- **THEN** `getPinnedArgs().agent` is `"claude"`
- **AND** `getPinnedArgs().role` is `undefined`
- **AND** `getPinnedArgs().source` is `undefined`

### Requirement: Pinned config options are excluded from client-facing configOptions

When `--agent` or `--role` is pinned, the corresponding config option SHALL NOT be included in `configOptions` arrays sent to the client in `session/new`, `session/load`, or `config_option_update` responses.

#### Scenario: Agent pinned — agent config option excluded
- **WHEN** `--agent claude` is pinned
- **AND** a `session/new` response is built
- **THEN** the `configOptions` array SHALL NOT contain an option with `id: "agent"`
- **AND** the `configOptions` array SHALL contain the `id: "role"` option (since role is not pinned)

#### Scenario: Role pinned — role config option excluded
- **WHEN** `--role writer` is pinned
- **AND** a `session/new` response is built
- **THEN** the `configOptions` array SHALL NOT contain an option with `id: "role"`
- **AND** the `configOptions` array SHALL contain the `id: "agent"` option

#### Scenario: Both pinned — no config options
- **WHEN** `--agent claude` and `--role writer` are both pinned
- **AND** a `session/new` response is built
- **THEN** the `configOptions` array SHALL be empty

#### Scenario: Nothing pinned — all config options present
- **WHEN** no args are pinned
- **AND** a `session/new` response is built
- **THEN** the `configOptions` array SHALL contain both `id: "agent"` and `id: "role"` options

### Requirement: setSessionConfigOption rejects changes to pinned fields

When a client calls `setSessionConfigOption` for a config ID that is pinned via CLI args, the handler SHALL throw a `RequestError.invalidParams` with a message indicating the field is pinned.

#### Scenario: Reject agent change when agent is pinned
- **WHEN** `--agent claude` is pinned
- **AND** the client sends `setSessionConfigOption({ configId: "agent", value: "mcp-agent" })`
- **THEN** the handler SHALL throw `RequestError.invalidParams`
- **AND** the error message SHALL contain "pinned"

#### Scenario: Allow role change when only agent is pinned
- **WHEN** `--agent claude` is pinned but role is NOT pinned
- **AND** the client sends `setSessionConfigOption({ configId: "role", value: "editor" })`
- **THEN** the handler SHALL process the change normally

### Requirement: Pinned source is forwarded to mason run subprocess

When `--source <path>` is pinned, the prompt executor SHALL include `--source <path>` in the `mason run` subprocess arguments. The source SHALL be included for both new prompts and resumed sessions.

#### Scenario: Source included in new prompt args
- **WHEN** source is pinned to `/abs/path/src`
- **AND** a new prompt is executed (no resume)
- **THEN** the subprocess args SHALL be `["run", "--agent", agent, "--role", role, "--source", "/abs/path/src", "--json", text]`

#### Scenario: Source included in resumed prompt args
- **WHEN** source is pinned to `/abs/path/src`
- **AND** a prompt is resumed with masonSessionId
- **THEN** the subprocess args SHALL be `["run", "--resume", masonSessionId, "--source", "/abs/path/src", "--json", text]`

#### Scenario: No source when not pinned
- **WHEN** source is NOT pinned
- **AND** a prompt is executed
- **THEN** the subprocess args SHALL NOT contain `--source`
