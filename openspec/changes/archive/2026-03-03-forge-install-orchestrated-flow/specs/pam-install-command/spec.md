## ADDED Requirements

### Requirement: forge install command is registered as a CLI command

The CLI SHALL register an `install` command that accepts a required `<agent>` argument (agent package name) and an optional `--output-dir <dir>` option.

#### Scenario: Command registration
- **WHEN** the CLI program is initialized
- **THEN** the `install` command SHALL be available with argument `<agent>` and option `--output-dir`

### Requirement: forge install orchestrates the full pipeline

When `forge install <agent>` is run, the command SHALL execute the following stages in order:
1. Discover packages in the workspace via `discoverPackages()`
2. Resolve the agent's dependency graph via `resolveAgent()`
3. Validate the resolved graph via `validateAgent()` — abort with error if invalid
4. Generate the mcp-proxy config via `generateProxyConfig()`
5. For each declared runtime with a registered materializer: materialize workspace, generate Dockerfile, generate compose service
6. Generate docker-compose.yml, .env template, and forge.lock.json
7. Generate a random proxy auth token
8. Write all artifacts to the output directory

#### Scenario: Successful install creates complete directory structure
- **WHEN** `forge install` is run with a valid agent that declares `claude-code` runtime
- **THEN** the output directory SHALL contain:
  - `mcp-proxy/config.json`
  - `claude-code/Dockerfile`
  - `claude-code/workspace/.claude/settings.json`
  - `claude-code/workspace/.claude/commands/*.md` (one per task)
  - `claude-code/workspace/AGENTS.md`
  - `docker-compose.yml`
  - `.env`
  - `forge.lock.json`

#### Scenario: Validation errors abort install
- **WHEN** `forge install` is run with an agent that fails validation
- **THEN** the command SHALL print validation errors and exit with non-zero status without writing any files

### Requirement: forge install generates a proxy auth token

The install command SHALL generate a cryptographically random token using `crypto.randomBytes(32)` and inject it into the `.env` file as the `FORGE_PROXY_TOKEN` value.

#### Scenario: Token is present in .env
- **WHEN** install completes successfully
- **THEN** the `.env` file SHALL contain `FORGE_PROXY_TOKEN=<64-char-hex-string>` where the value is non-empty

### Requirement: forge install uses a materializer registry

The install command SHALL maintain a registry mapping runtime names to `RuntimeMaterializer` instances. The `"claude-code"` materializer SHALL be pre-registered.

#### Scenario: Unknown runtime produces warning
- **WHEN** an agent declares a runtime (e.g., `"codex"`) that has no registered materializer
- **THEN** the command SHALL log a warning mentioning the skipped runtime and continue installing the remaining runtimes

#### Scenario: Agent with only known runtimes
- **WHEN** an agent declares only `"claude-code"` as its runtime
- **THEN** the command SHALL materialize the claude-code workspace without warnings

### Requirement: forge install supports custom output directory

The `--output-dir` option SHALL override the default output location. When not specified, the output directory SHALL default to `.forge/agents/{agent-short-name}/` relative to the working directory.

#### Scenario: Default output directory
- **WHEN** `forge install @clawforge/agent-repo-ops` is run without `--output-dir`
- **THEN** files SHALL be written to `.forge/agents/repo-ops/`

#### Scenario: Custom output directory
- **WHEN** `forge install @clawforge/agent-repo-ops --output-dir ./my-output` is run
- **THEN** files SHALL be written to `./my-output/`

### Requirement: forge install is idempotent

Re-running `forge install` for the same agent SHALL overwrite all previously generated files. The command SHALL not fail if the output directory already exists.

#### Scenario: Re-run overwrites files
- **WHEN** `forge install` is run twice for the same agent
- **THEN** the second run SHALL succeed and overwrite all files from the first run

### Requirement: forge install prints progress and summary

The command SHALL print a success message listing:
- The output directory path
- The number of generated files
- The runtimes that were materialized
- A reminder to fill in `.env` credentials

#### Scenario: Success output
- **WHEN** install completes successfully
- **THEN** the output SHALL contain the output directory path and mention `.env`

## MODIFIED Requirements

### Requirement: cli-framework registers the install command

The CLI command registration hub SHALL import and register the install command alongside init and validate.

#### Scenario: Install command available
- **WHEN** the CLI is initialized
- **THEN** `forge install` SHALL be a recognized command
