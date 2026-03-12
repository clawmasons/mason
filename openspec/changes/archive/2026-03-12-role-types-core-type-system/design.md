## Architecture

The ROLE_TYPES type system follows the existing codebase patterns in `packages/shared/`:

1. **Zod schemas** (`schemas/role-types.ts`) define runtime validation with defaults
2. **TypeScript types** (`types/role-types.ts`) are inferred from schemas via `z.infer<>`
3. **Barrel exports** make everything available from `@clawmasons/shared`

### Type Hierarchy

```
RoleType (top-level)
├── metadata: RoleMetadata {name, description, version?, scope?}
├── instructions: string
├── tasks: TaskRef[] {name, ref?}
├── apps: AppConfig[] {name, package?, transport?, command?, args?, url?, env, tools: ToolPermissions, credentials}
├── skills: SkillRef[] {name, ref?}
├── container: ContainerRequirements {packages: {apt, npm, pip}, ignore: {paths}, mounts: MountConfig[], baseImage?}
├── governance: GovernanceConfig {risk, credentials, constraints?}
├── resources: ResourceFile[] {relativePath, absolutePath, permissions?}
└── source: RoleSource {type: 'local'|'package', agentDialect?, path?, packageName?}
```

### Design Decisions

- **Zod + infer pattern**: Matches existing schema pattern (see `schemas/role.ts`, `schemas/app.ts`). Single source of truth for runtime validation and static types.
- **Defaults at schema level**: Optional arrays default to `[]`, risk defaults to `"LOW"`, env defaults to `{}`. Consumers never need null checks on optional collections.
- **ResourceFile tracks paths only**: `absolutePath` and `relativePath` stored, file content never loaded. This supports large bundled resources without memory pressure.
- **RoleSource discriminates local vs package**: Enables bidirectional construction. `agentDialect` only meaningful for local sources; `packageName` only for packages.
- **Agent-agnostic naming**: `tasks` (not `commands`), `apps` (not `mcp_servers`), `skills` (not dialect-specific). The dialect mapping happens in the parser layer (Change 2), not in the type system.
