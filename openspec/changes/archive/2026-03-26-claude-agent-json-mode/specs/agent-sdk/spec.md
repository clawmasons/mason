## MODIFIED Requirements

### Requirement: AgentPackage includes optional jsonMode config

The `AgentPackage` interface SHALL include an optional `jsonMode` field with the following shape:

- `jsonStreamArgs: string[]` — args appended to the agent command to enable JSON streaming output
- `buildPromptArgs?: (prompt: string) => string[]` — builds CLI args for the initial prompt (defaults to `["-p", prompt]`)
- `parseJsonStreamAsACP(line: string, previousLine?: string): AcpSessionUpdate | AcpSessionUpdate[] | null` — parses a JSON stream line into ACP session update(s), or returns null to skip

The return type of `parseJsonStreamAsACP` SHALL be widened from `AcpSessionUpdate | null` to `AcpSessionUpdate | AcpSessionUpdate[] | null` to support agents that produce multiple ACP updates from a single JSON stream line (e.g., Claude assistant events with mixed text + tool_use blocks).

When `jsonMode` is omitted, the agent does not support ACP JSON streaming mode.

#### Scenario: Agent package declares jsonMode with array return
- **WHEN** an agent package exports an `AgentPackage` with `jsonMode.parseJsonStreamAsACP` that returns an array of updates
- **THEN** the agent registry SHALL accept it
- **AND** the CLI caller SHALL handle the array by emitting each update as a separate NDJSON line

#### Scenario: Agent package declares jsonMode with single return
- **WHEN** an agent package exports an `AgentPackage` with `jsonMode.parseJsonStreamAsACP` that returns a single update
- **THEN** the CLI caller SHALL emit it as a single NDJSON line (backward-compatible)

#### Scenario: Agent package omits jsonMode
- **WHEN** an agent package exports an `AgentPackage` without `jsonMode`
- **THEN** the agent registry SHALL accept it
- **AND** attempting to use `--json` with this agent SHALL produce an error indicating JSON mode is not supported

## ADDED Requirements

### Requirement: CLI normalizes parseJsonStreamAsACP array results

The CLI caller in `run-agent.ts` SHALL normalize the result of `parseJsonStreamAsACP`. When the result is an array, each element SHALL be emitted as a separate NDJSON line. When the result is a single object, it SHALL be emitted as a single NDJSON line. When the result is null, no output SHALL be emitted.

The normalization SHALL use `Array.isArray()` to distinguish arrays from single objects.

#### Scenario: Parser returns array of updates
- **WHEN** `parseJsonStreamAsACP` returns `[update1, update2]`
- **THEN** the CLI SHALL emit two NDJSON lines, one for each update

#### Scenario: Parser returns single update
- **WHEN** `parseJsonStreamAsACP` returns a single `AcpSessionUpdate` object
- **THEN** the CLI SHALL emit one NDJSON line

#### Scenario: Parser returns null
- **WHEN** `parseJsonStreamAsACP` returns `null`
- **THEN** the CLI SHALL emit no NDJSON output for that line
