## Purpose

Zod-based schema definitions and TypeScript types for the ROLE_TYPES in-memory type system — the canonical intermediate representation between ROLE.md files, NPM packages, and agent materializations. All role sources normalize into these types. Types are agent-agnostic, using generic names (`tasks`, `apps`, `skills`) not tied to any runtime. `ResourceFile` tracks absolute filesystem paths but never loads file content into memory. All types support bidirectional construction (from local ROLE.md and from NPM packages).

## Requirements

### Requirement: RoleMetadata schema
The system SHALL define a `roleMetadataSchema` Zod schema with required fields `name` (string) and `description` (string), and optional fields `version` (string) and `scope` (string).

#### Scenario: Valid metadata with all fields
- **WHEN** a metadata object with `name: "create-prd"`, `description: "Creates PRDs"`, `version: "1.0.0"`, `scope: "acme.engineering"` is validated
- **THEN** validation succeeds and returns a typed `RoleMetadata` object

#### Scenario: Valid metadata with required fields only
- **WHEN** a metadata object with only `name: "create-prd"` and `description: "Creates PRDs"` is validated
- **THEN** validation succeeds with `version` and `scope` as undefined

#### Scenario: Missing required name
- **WHEN** a metadata object without `name` is validated
- **THEN** validation fails with a Zod error

### Requirement: ToolPermissions schema
The system SHALL define a `toolPermissionsSchema` Zod schema with optional `allow` (string array, defaults to empty) and optional `deny` (string array, defaults to empty).

#### Scenario: Valid tool permissions
- **WHEN** a tool permissions object with `allow: ["create_issue"]` and `deny: ["delete_repo"]` is validated
- **THEN** validation succeeds and returns a typed `ToolPermissions` object

#### Scenario: Default empty arrays
- **WHEN** an empty object `{}` is validated against `toolPermissionsSchema`
- **THEN** validation succeeds with `allow: []` and `deny: []`

### Requirement: TaskRef schema
The system SHALL define a `taskRefSchema` Zod schema with required `name` (string) and optional `ref` (string for package/path reference).

#### Scenario: Valid task ref
- **WHEN** a task ref with `name: "define-change"` and `ref: "@acme/task-define-change"` is validated
- **THEN** validation succeeds

#### Scenario: Task ref with name only
- **WHEN** a task ref with only `name: "define-change"` is validated
- **THEN** validation succeeds with `ref` as undefined

### Requirement: AppConfig schema
The system SHALL define an `appConfigSchema` Zod schema with required `name` (string), and optional fields: `package` (string), `transport` (enum: "stdio" | "sse" | "streamable-http"), `command` (string), `args` (string array), `url` (string), `env` (Record<string, string>, defaults to empty), `tools` (ToolPermissions, defaults to empty allow/deny), `credentials` (string array, defaults to empty).

#### Scenario: Valid stdio app config
- **WHEN** an app config with `name: "github"`, `transport: "stdio"`, `command: "npx"`, `args: ["-y", "server-github"]`, `tools: {allow: ["create_issue"]}` is validated
- **THEN** validation succeeds

#### Scenario: Valid remote app config
- **WHEN** an app config with `name: "remote-api"`, `transport: "streamable-http"`, `url: "https://api.example.com"` is validated
- **THEN** validation succeeds

#### Scenario: App config defaults
- **WHEN** an app config with only `name: "minimal"` is validated
- **THEN** `env` defaults to `{}`, `tools` defaults to `{allow: [], deny: []}`, `credentials` defaults to `[]`

#### Scenario: Invalid transport type
- **WHEN** an app config with `transport: "websocket"` is validated
- **THEN** validation fails

### Requirement: SkillRef schema
The system SHALL define a `skillRefSchema` Zod schema with required `name` (string) and optional `ref` (string for package/path reference).

#### Scenario: Valid skill ref
- **WHEN** a skill ref with `name: "prd-writing"` and `ref: "@acme/skill-prd-writing"` is validated
- **THEN** validation succeeds

### Requirement: MountConfig schema
The system SHALL define a `mountConfigSchema` Zod schema with required `source` (string) and `target` (string), and optional `readonly` (boolean, defaults to false).

#### Scenario: Valid mount config
- **WHEN** a mount config with `source: "./data"`, `target: "/workspace/data"`, `readonly: true` is validated
- **THEN** validation succeeds

#### Scenario: Mount config defaults
- **WHEN** a mount config with `source: "./data"` and `target: "/workspace/data"` is validated
- **THEN** `readonly` defaults to `false`

### Requirement: ContainerRequirements schema
The system SHALL define a `containerRequirementsSchema` Zod schema with optional `packages` object (containing optional `apt`, `npm`, `pip` string arrays, all defaulting to empty), optional `ignore` object (containing optional `paths` string array, defaulting to empty), optional `mounts` (MountConfig array, defaults to empty), and optional `baseImage` (string).

#### Scenario: Valid full container requirements
- **WHEN** a container requirements object with `packages: {apt: ["jq"], npm: ["typescript"], pip: ["pdfkit"]}`, `ignore: {paths: [".env"]}`, `mounts: [{source: "./data", target: "/data"}]`, `baseImage: "node:22"` is validated
- **THEN** validation succeeds

#### Scenario: Container defaults
- **WHEN** an empty object `{}` is validated against `containerRequirementsSchema`
- **THEN** `packages` defaults to `{apt: [], npm: [], pip: []}`, `ignore` defaults to `{paths: []}`, `mounts` defaults to `[]`

### Requirement: GovernanceConfig schema
The system SHALL define a `governanceConfigSchema` Zod schema with optional `risk` (enum: "HIGH" | "MEDIUM" | "LOW", defaults to "LOW"), optional `credentials` (string array, defaults to empty), and optional `constraints` object (with optional `maxConcurrentTasks` positive integer and optional `requireApprovalFor` string array).

#### Scenario: Valid governance config
- **WHEN** a governance config with `risk: "HIGH"`, `credentials: ["GITHUB_TOKEN"]`, `constraints: {maxConcurrentTasks: 3, requireApprovalFor: ["create_pr"]}` is validated
- **THEN** validation succeeds

#### Scenario: Governance defaults
- **WHEN** an empty object `{}` is validated against `governanceConfigSchema`
- **THEN** `risk` defaults to `"LOW"`, `credentials` defaults to `[]`

### Requirement: ResourceFile schema
The system SHALL define a `resourceFileSchema` Zod schema with required `relativePath` (string) and `absolutePath` (string), and optional `permissions` (number).

#### Scenario: Valid resource file
- **WHEN** a resource file with `relativePath: "templates/prd.md"`, `absolutePath: "/home/user/project/.claude/roles/x/templates/prd.md"`, `permissions: 0o644` is validated
- **THEN** validation succeeds

#### Scenario: Resource file without permissions
- **WHEN** a resource file with only `relativePath` and `absolutePath` is validated
- **THEN** validation succeeds with `permissions` as undefined

### Requirement: RoleSource schema
The system SHALL define a `roleSourceSchema` Zod schema with required `type` (enum: "local" | "package"), and optional `agentDialect` (string), `path` (string for local roles), and `packageName` (string for packaged roles).

#### Scenario: Valid local source
- **WHEN** a role source with `type: "local"`, `agentDialect: "claude-code"`, `path: "/home/user/project/.claude/roles/create-prd"` is validated
- **THEN** validation succeeds

#### Scenario: Valid package source
- **WHEN** a role source with `type: "package"`, `packageName: "@acme/role-create-prd"` is validated
- **THEN** validation succeeds

### Requirement: RoleType top-level schema
The system SHALL define a `roleTypeSchema` Zod schema composing all sub-schemas: required `metadata` (RoleMetadata), required `instructions` (string, the markdown body), and optional fields: `tasks` (TaskRef array, defaults to empty), `apps` (AppConfig array, defaults to empty), `skills` (SkillRef array, defaults to empty), `container` (ContainerRequirements, with defaults), `governance` (GovernanceConfig, with defaults), `resources` (ResourceFile array, defaults to empty), `source` (RoleSource).

#### Scenario: Valid full RoleType
- **WHEN** a complete RoleType with metadata, instructions, tasks, apps, skills, container, governance, resources, and source is validated
- **THEN** validation succeeds and all fields are typed correctly

#### Scenario: Minimal RoleType
- **WHEN** a RoleType with only `metadata: {name: "test", description: "Test role"}` and `instructions: "You are a test agent."` and `source: {type: "local"}` is validated
- **THEN** validation succeeds with all optional arrays defaulting to empty, governance risk defaulting to "LOW"

#### Scenario: RoleType missing metadata
- **WHEN** a RoleType without `metadata` is validated
- **THEN** validation fails

#### Scenario: RoleType missing instructions
- **WHEN** a RoleType without `instructions` is validated
- **THEN** validation fails

### Requirement: TypeScript type exports
The system SHALL export TypeScript types inferred from all Zod schemas: `RoleType`, `RoleMetadata`, `TaskRef`, `AppConfig`, `SkillRef`, `ContainerRequirements`, `GovernanceConfig`, `ResourceFile`, `RoleSource`, `MountConfig`, `ToolPermissions`.

### Requirement: Barrel exports
The system SHALL export all schemas and types from `packages/shared/src/index.ts` so consumers can import them from `@clawmasons/shared`.
