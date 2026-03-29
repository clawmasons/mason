## MODIFIED Requirements

### Requirement: ACP prompt handler automatically resumes sessions

When the ACP `prompt` handler fires for an existing session, it SHALL check `meta.json` for an `agentSessionId`. If present (non-null), it SHALL pass `masonSessionId` to `executePromptStreaming()`, which spawns `mason run --resume <masonSessionId> --json <text>` instead of `mason run --agent X --role Y --json <text>`.

The `executePromptStreaming()` function SHALL accept an optional `masonSessionId` field and an optional `source` field in its options. When `masonSessionId` is set, the args SHALL be constructed as:
```
["run", "--resume", masonSessionId, "--json", text]
```

When not set, the legacy args are used:
```
["run", "--agent", agent, "--role", role, "--json", text]
```

When `source` is provided, `--source <path>` SHALL be appended to the args in either case.

#### Scenario: First prompt creates session normally
- **WHEN** the first ACP `prompt` is sent for a new session
- **AND** `meta.json` has `agentSessionId: null`
- **THEN** the handler SHALL spawn `mason run --agent X --role Y --json <text>` (no resume)

#### Scenario: Second prompt resumes after agentSessionId captured
- **WHEN** a second ACP `prompt` is sent
- **AND** `meta.json` has `agentSessionId: "sess_abc123"` (captured by SessionStart hook after first prompt)
- **THEN** the handler SHALL spawn `mason run --resume <masonSessionId> --json <text>`
- **AND** the agent SHALL resume with context from the first turn

#### Scenario: Second prompt without agentSessionId uses normal path
- **WHEN** a second ACP `prompt` is sent
- **AND** `meta.json` still has `agentSessionId: null` (hook didn't fire or failed)
- **THEN** the handler SHALL spawn `mason run --agent X --role Y --json <text>` (no resume)

#### Scenario: Source is appended when pinned
- **WHEN** source is pinned to `/abs/path/src`
- **AND** a prompt is executed (new or resumed)
- **THEN** `--source /abs/path/src` SHALL be appended to the subprocess args
