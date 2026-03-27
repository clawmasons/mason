## MODIFIED Requirements

### Requirement: Print mode uses JSON streaming to capture agent output

In print mode, the agent SHALL be launched with its JSON streaming args (from `AgentPackage.printMode.jsonStreamArgs`) appended to the command in `agent-launch.json`. The host process SHALL pipe stdout from `docker compose run` instead of inheriting it, read each line, log it to the session logger, and call `AgentPackage.printMode.parseJsonStreamFinalResult(line, previousLine)` to detect the final result.

The SDK SHALL track the most recent JSON-looking line as `previousLine`. A line is considered JSON-looking if its trimmed content starts with `{` or `[`. The `previousLine` SHALL be passed as the second argument to `parseJsonStreamFinalResult`. If no previous JSON line has been seen, `previousLine` SHALL be `undefined`.

The SDK SHALL NOT store `finalResult` on the first non-null return and stop. Instead, the SDK SHALL continue calling `parseJsonStreamFinalResult` for every JSON-looking line until the stream ends, and the last non-null return SHALL be the final result.

#### Scenario: Claude agent launched with streaming args

- **WHEN** print mode is active for the claude agent
- **THEN** `agent-launch.json` SHALL include `["--output-format", "stream-json"]` in the args array
- **AND** the prompt SHALL be passed as `["-p", "the prompt text"]`

#### Scenario: Pi agent launched with streaming args

- **WHEN** print mode is active for the pi agent
- **THEN** `agent-launch.json` SHALL include `["--mode", "json"]` in the args array
- **AND** the prompt SHALL be passed as `["-p", "the prompt text"]`

#### Scenario: All stream lines logged

- **WHEN** the agent emits JSON stream lines during print mode
- **THEN** every line SHALL be appended to `.mason/logs/session.log`
- **AND** lines that do not contain the final result SHALL NOT appear on stdout

#### Scenario: Final result extracted using previousLine context

- **WHEN** the agent emits a multi-step JSON stream with multiple `agent_message` events followed by `turn.completed`
- **AND** `parseJsonStreamFinalResult(turnCompletedLine, lastAgentMessageLine)` returns a non-null string
- **THEN** that string SHALL be written to the terminal stdout after the agent process completes
- **AND** it SHALL be the only agent output on stdout

#### Scenario: previousLine tracks only JSON-looking lines

- **WHEN** the stream contains a non-JSON line (e.g., plain text log output) between two JSON lines
- **THEN** the non-JSON line SHALL NOT replace the tracked `previousLine`
- **AND** the previous JSON line SHALL remain as `previousLine` for the next parser call

#### Scenario: Parse errors handled gracefully

- **WHEN** `parseJsonStreamFinalResult(line, previousLine)` throws an exception (e.g., invalid JSON)
- **THEN** the exception SHALL be logged to the session logger
- **AND** the line SHALL be treated as not containing the final result (continue reading)
