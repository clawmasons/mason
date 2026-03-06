# chapter-install-command Specification

## Purpose
Orchestrates the full member installation pipeline: discover, resolve, validate, generate, materialize, and write all deployment artifacts. Supports both agent and human member types with per-member directory isolation.

## Requirements

### Requirement: chapter install command is registered as a CLI command

The CLI SHALL register an `install` command that accepts a required `<member>` argument (member package name) and an optional `--output-dir <dir>` option.

#### Scenario: Command registration
- **WHEN** the CLI program is initialized
- **THEN** the `install` command SHALL be available with argument `<member>` and option `--output-dir`

### Requirement: chapter install orchestrates the full pipeline for agent members

When `chapter install <member>` is run for an agent member, the command SHALL execute the following stages in order:
1. Discover packages in the workspace via `discoverPackages()`
2. Resolve the member's dependency graph via `resolveMember()`
3. Validate the resolved graph via `validateMember()` -- abort with error if invalid
4. Determine output directory using `member.slug` (or `--output-dir` override)
5. Generate a random proxy auth token (before materialization so it can be baked into runtime configs)
6. For each declared runtime with a registered materializer: materialize workspace (passing the token), generate Dockerfile, generate config JSON (if supported), generate compose service
7. Generate proxy build context with Dockerfile and pre-built chapter artifacts in `proxy/`
8. Generate docker-compose.yml, .env template (with token injected), and chapter.lock.json
9. Write all artifacts to the output directory
10. Create empty `.claude/` directories for runtimes that support config JSON (for volume mount)
11. Create `log/` directory for activity tracking

#### Scenario: Successful agent install creates per-member directory structure
- **WHEN** `chapter install` is run with a valid agent member (slug: `note-taker`) that declares `claude-code` runtime
- **THEN** the output directory at `.chapter/members/note-taker/` SHALL contain:
  - `proxy/Dockerfile` (proxy build context)
  - `proxy/chapter/` (pre-built chapter artifacts)
  - `claude-code/Dockerfile`
  - `claude-code/.claude.json` (OOBE bypass, seeded at install time)
  - `claude-code/.claude/` (empty directory for volume mount)
  - `claude-code/workspace/.mcp.json`
  - `claude-code/workspace/.claude/settings.json`
  - `claude-code/workspace/.claude/commands/*.md` (one per task)
  - `claude-code/workspace/AGENTS.md`
  - `docker-compose.yml`
  - `.env`
  - `chapter.lock.json`
  - `log/` (activity log directory)

#### Scenario: Validation errors abort install
- **WHEN** `chapter install` is run with a member that fails validation
- **THEN** the command SHALL print validation errors and exit with non-zero status without writing any files

### Requirement: chapter install handles human members

When `chapter install <member>` is run for a human member (`memberType: "human"`), the command SHALL:
1. Discover, resolve, and validate the member graph
2. Create only the `log/` directory under the output directory
3. Skip all Docker artifact generation (no compose, env, lock, proxy, or runtime files)
4. Print a success message indicating the human member type

#### Scenario: Human member install creates only log directory
- **WHEN** `chapter install @acme/member-alice` is run where alice is a human member (slug: `alice`)
- **THEN** `.chapter/members/alice/log/` SHALL exist
- **AND** no `docker-compose.yml`, `.env`, `chapter.lock.json`, `proxy/`, or runtime directories SHALL exist

### Requirement: chapter install uses member slug for directory naming

The install command SHALL use `member.slug` from the resolved member for the default output directory name, instead of deriving from the package name.

#### Scenario: Default output directory uses slug
- **WHEN** `chapter install @acme/member-note-taker` is run where the member has `slug: "note-taker"`
- **THEN** files SHALL be written to `.chapter/members/note-taker/`

### Requirement: chapter install generates a proxy auth token and bakes it into runtime configs

The install command SHALL generate a cryptographically random token using `crypto.randomBytes(32)` before materialization. The token SHALL be:
- Injected into the `.env` file as the `CHAPTER_PROXY_TOKEN` value
- Passed to `materializeWorkspace()` so runtimes can bake the actual token value into their settings (e.g., Claude Code's `.mcp.json` Authorization header)

#### Scenario: Token is present in .env
- **WHEN** install completes successfully for an agent member
- **THEN** the `.env` file SHALL contain `CHAPTER_PROXY_TOKEN=<64-char-hex-string>` where the value is non-empty

#### Scenario: Token is baked into runtime settings
- **WHEN** install completes successfully for a claude-code runtime
- **THEN** `claude-code/workspace/.mcp.json` SHALL contain `Authorization: "Bearer <actual-token>"` with the real token, not an env var placeholder

### Requirement: chapter install uses a materializer registry

The install command SHALL maintain a registry mapping runtime names to `RuntimeMaterializer` instances. The `"claude-code"` materializer SHALL be pre-registered.

#### Scenario: Unknown runtime produces warning
- **WHEN** a member declares a runtime (e.g., `"codex"`) that has no registered materializer
- **THEN** the command SHALL log a warning mentioning the skipped runtime and continue installing the remaining runtimes

#### Scenario: Member with only known runtimes
- **WHEN** a member declares only `"claude-code"` as its runtime
- **THEN** the command SHALL materialize the claude-code workspace without warnings

### Requirement: chapter install supports custom output directory

The `--output-dir` option SHALL override the default output location. When not specified, the output directory SHALL default to `.chapter/members/{member-slug}/` relative to the working directory.

#### Scenario: Default output directory
- **WHEN** `chapter install @clawmasons/member-repo-ops` is run without `--output-dir` where the member has `slug: "repo-ops"`
- **THEN** files SHALL be written to `.chapter/members/repo-ops/`

#### Scenario: Custom output directory
- **WHEN** `chapter install @clawmasons/member-repo-ops --output-dir ./my-output` is run
- **THEN** files SHALL be written to `./my-output/`

### Requirement: chapter install is idempotent

Re-running `chapter install` for the same member SHALL overwrite all previously generated files. The command SHALL not fail if the output directory already exists. The `log/` directory SHALL persist across re-installs.

#### Scenario: Re-run overwrites files
- **WHEN** `chapter install` is run twice for the same member
- **THEN** the second run SHALL succeed and overwrite all files from the first run

### Requirement: chapter install prints progress and summary

The command SHALL print a success message listing:
- The output directory path
- For agent members: the number of generated files, the runtimes that were materialized, and next steps (fill in `.env` app credentials, run with `chapter run <member>`, authenticate with `/login`)
- For human members: the member type and directories created

#### Scenario: Agent success output
- **WHEN** install completes successfully for an agent member
- **THEN** the output SHALL contain the output directory path, mention `.env`, show `chapter run` as the primary command, and mention `/login` for first-run authentication

#### Scenario: Human success output
- **WHEN** install completes successfully for a human member
- **THEN** the output SHALL indicate the member type is `human` and list `log/` as the created directory

### Requirement: cli-framework registers the install command

The CLI command registration hub SHALL import and register the install command alongside init and validate.

#### Scenario: Install command available
- **WHEN** the CLI is initialized
- **THEN** `chapter install` SHALL be a recognized command
