# materializer-interface Specification

## Purpose
TBD - created by archiving change claude-code-materializer. Update Purpose after archive.
## Requirements
### Requirement: RuntimeMaterializer interface defines the contract for all materializers

The system SHALL define a `RuntimeMaterializer` interface with the following properties and methods:
- `name: string` — the runtime identifier (e.g., `"claude-code"`, `"codex"`)
- `materializeWorkspace(agent: ResolvedMember, proxyEndpoint: string, proxyToken?: string): MaterializationResult` — generates workspace file content. When `proxyToken` is provided, the actual token value SHALL be baked into configuration files instead of using environment variable placeholders.
- `generateDockerfile(agent: ResolvedMember): string` — generates a Dockerfile string
- `generateComposeService(agent: ResolvedMember): ComposeServiceDef` — generates a docker-compose service definition

#### Scenario: Interface has correct shape
- **WHEN** a materializer implements the RuntimeMaterializer interface
- **THEN** it MUST provide `name`, `materializeWorkspace`, `generateDockerfile`, and `generateComposeService`

### Requirement: MaterializationResult is a map of relative paths to file content

The `materializeWorkspace` method SHALL return a `MaterializationResult` which is a `Map<string, string>` where keys are relative file paths (from the workspace root) and values are the file content as strings.

#### Scenario: Result contains workspace files
- **WHEN** `materializeWorkspace()` is called on a valid resolved agent
- **THEN** the result SHALL be a Map where each key is a relative path (e.g., `.claude/settings.json`) and each value is the string content of that file

### Requirement: ComposeServiceDef captures docker-compose service fields

The `ComposeServiceDef` type SHALL include fields for a docker-compose service: `build`, `restart`, `volumes`, `working_dir`, `environment`, `depends_on`, `stdin_open`, `tty`, and `networks`.

#### Scenario: ComposeServiceDef has required fields
- **WHEN** `generateComposeService()` is called
- **THEN** the result SHALL include `build`, `volumes`, `working_dir`, `depends_on`, and `networks` at minimum

