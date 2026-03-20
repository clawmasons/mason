## MODIFIED Requirements

### Requirement: configure delegates to run with the configure-project role

Running `mason configure [args]` SHALL be equivalent to running `mason run --role @clawmasons/role-configure-project [args]` with the initial prompt `"create and implement role plan"` always included.

The hardcoded initial prompt SHALL be passed to the underlying run action as the `initialPrompt` value. User-provided positional arguments to `mason configure` SHALL also be treated as the initial prompt and SHALL override the hardcoded default when provided.

#### Scenario: Basic invocation includes hardcoded initial prompt

- **WHEN** `mason configure --agent claude` is executed from a project directory
- **THEN** the agent SHALL start using the `@clawmasons/role-configure-project` role
- **AND** the initial prompt SHALL be `"create and implement role plan"`
- **AND** the behavior SHALL be equivalent to `mason run --role @clawmasons/role-configure-project --agent claude "create and implement role plan"`

#### Scenario: User-provided positional overrides default prompt

- **WHEN** `mason configure --agent claude "my custom prompt"` is executed
- **THEN** the initial prompt SHALL be `"my custom prompt"`

#### Scenario: All run options are forwarded

- **WHEN** `mason configure --agent claude --verbose --build` is executed
- **THEN** the underlying run action SHALL receive `verbose: true`, `build: true`, and `agent: "claude"`
- **AND** `role` SHALL be `"@clawmasons/role-configure-project"`
- **AND** `initialPrompt` SHALL be `"create and implement role plan"`

#### Scenario: ACP mode forwarding

- **WHEN** `mason configure --acp` is executed
- **THEN** the run action SHALL receive `acp: true` and `role: "@clawmasons/role-configure-project"`
- **AND** the initial prompt SHALL NOT be forwarded (ACP mode exclusion)
