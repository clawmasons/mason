## ADDED Requirements

### Requirement: Agent config entry supports home, mode, role, and credentials properties

Each agent entry in `.mason/config.json` SHALL support four optional launch-profile properties in addition to the existing `package` field: `home` (string), `mode` (one of `"terminal"`, `"acp"`, `"bash"`), `role` (string), and `credentials` (array of strings). These properties define per-agent invocation defaults for the current project.

#### Scenario: Agent entry with all optional properties
- **WHEN** `.mason/config.json` declares `"claude": { "package": "@clawmasons/claude-code", "home": "~/projects/claude-config", "mode": "terminal", "role": "writer", "credentials": ["MY_KEY"] }`
- **THEN** the CLI SHALL parse all five fields without error
- **AND** `home`, `mode`, `role`, and `credentials` SHALL be accessible when launching the `claude` agent

#### Scenario: Agent entry with only package (backward compatible)
- **WHEN** `.mason/config.json` declares `"claude": { "package": "@clawmasons/claude-code" }`
- **THEN** the CLI SHALL parse the entry without error
- **AND** `home`, `mode`, `role`, and `credentials` SHALL all be `undefined`

#### Scenario: Invalid mode value is rejected with warning
- **WHEN** `.mason/config.json` declares `"myagent": { "package": "@foo/bar", "mode": "interactive" }`
- **THEN** the CLI SHALL log a warning: `Agent "myagent" has invalid mode "interactive" (expected terminal, acp, or bash). Defaulting to terminal.`
- **AND** the agent SHALL still be registered, using `"terminal"` as its effective mode

### Requirement: home property is expanded and applied as a Docker volume mount

When an agent entry specifies `home`, the CLI SHALL expand `~` to the current user's home directory (`os.homedir()`) and bind-mount the resulting path into the agent container at `/home/mason/`.

#### Scenario: home with tilde expansion
- **WHEN** an agent config entry has `"home": "~/my-agent-config"`
- **AND** the user's home directory is `/Users/alice`
- **THEN** the Docker compose SHALL include a volume entry `"/Users/alice/my-agent-config:/home/mason/"`

#### Scenario: home path does not exist — warn and continue
- **WHEN** an agent config entry has `"home": "~/nonexistent"`
- **AND** that path does not exist on the host
- **THEN** the CLI SHALL log a warning: `Agent home path "~/nonexistent" does not exist. The mount will be empty.`
- **AND** the agent SHALL still start (Docker will create an empty directory at the mount point)

#### Scenario: --home flag overrides config home
- **WHEN** an agent config entry has `"home": "~/default-config"`
- **AND** the user runs `mason run --agent claude --home ~/override-config`
- **THEN** the Docker compose SHALL use `/home/mason/` mount from `~/override-config`, not `~/default-config`

### Requirement: mode property sets the default startup mode

When an agent entry specifies `mode`, the CLI SHALL use that mode as the default when launching the agent, equivalent to passing the corresponding flag.

#### Scenario: mode acp starts agent in ACP mode
- **WHEN** an agent config entry has `"mode": "acp"`
- **AND** no `--terminal`, `--acp`, or `--bash` flag is passed
- **THEN** the agent SHALL start in ACP mode (equivalent to `--acp`)

#### Scenario: mode bash starts agent in bash mode
- **WHEN** an agent config entry has `"mode": "bash"`
- **AND** no `--terminal`, `--acp`, or `--bash` flag is passed
- **THEN** the agent SHALL start in bash mode (equivalent to `--bash`)

#### Scenario: --terminal flag overrides config mode acp
- **WHEN** an agent config entry has `"mode": "acp"`
- **AND** the user passes `--terminal`
- **THEN** the agent SHALL start in terminal (interactive) mode

#### Scenario: --acp flag overrides config mode terminal
- **WHEN** an agent config entry has `"mode": "terminal"` (or mode is absent)
- **AND** the user passes `--acp`
- **THEN** the agent SHALL start in ACP mode

### Requirement: role property provides a default role name

When an agent entry specifies `role`, the CLI SHALL use that value as the role if `--role` is not provided on the command line.

#### Scenario: role from config used when --role is absent
- **WHEN** an agent config entry has `"role": "writer"`
- **AND** the user runs `mason claude` without `--role`
- **THEN** the CLI SHALL resolve the role named `"writer"`

#### Scenario: --role flag overrides config role
- **WHEN** an agent config entry has `"role": "writer"`
- **AND** the user runs `mason claude --role coder`
- **THEN** the CLI SHALL resolve the role named `"coder"`, ignoring the config default

#### Scenario: no role from config and no --role flag produces an error
- **WHEN** an agent config entry has no `role` property
- **AND** the user runs `mason claude` without `--role`
- **THEN** the CLI SHALL print an error: `--role <name> is required (or set "role" in .mason/config.json for this agent)`
- **AND** exit with code 1
