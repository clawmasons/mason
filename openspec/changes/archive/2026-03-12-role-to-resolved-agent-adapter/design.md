# Design: RoleType-to-ResolvedAgent Adapter

## Architecture

The adapter is a pure, stateless function with no side effects. It lives in `packages/shared/src/role/adapter.ts` alongside the parser and dialect registry it depends on.

### Function Signature

```typescript
export function adaptRoleToResolvedAgent(
  role: RoleType,
  agentType: string,
): ResolvedAgent
```

### Field Mapping

#### RoleType → ResolvedAgent (top level)

| RoleType field | ResolvedAgent field | Transformation |
|---|---|---|
| `metadata.name` | `name`, `agentName`, `slug` | Direct copy; slug = name |
| `metadata.version` | `version` | Direct copy, default `"0.0.0"` |
| `metadata.description` | `description` | Direct copy |
| `agentType` param | `runtimes` | `[agentType]` |
| `governance.credentials` | `credentials` | Direct copy |
| — | `proxy` | `{ port: 9090, type: "streamable-http" }` default |
| — | `roles` | Single `ResolvedRole` wrapping all role content |

#### RoleType → ResolvedRole (single role)

| RoleType field | ResolvedRole field | Transformation |
|---|---|---|
| `metadata.name` | `name` | Direct copy |
| `metadata.version` | `version` | Direct copy, default `"0.0.0"` |
| `metadata.description` | `description` | Direct copy |
| `governance.risk` | `risk` | Direct copy, default `"LOW"` |
| `governance.constraints` | `constraints` | Direct copy |
| `apps[].tools` | `permissions` | Aggregate: `{ [appName]: { allow, deny } }` |
| `container.mounts` | `mounts` | Map `MountConfig` → `{ source, target, readonly }` |
| `container.baseImage` | `baseImage` | Direct copy |
| `container.packages.apt` | `aptPackages` | Direct copy |
| `tasks` | `tasks` | Map `TaskRef` → `ResolvedTask` |
| `apps` | `apps` | Map `AppConfig` → `ResolvedApp` |
| `skills` | `skills` | Map `SkillRef` → `ResolvedSkill` |

#### TaskRef → ResolvedTask

| TaskRef field | ResolvedTask field | Transformation |
|---|---|---|
| `name` | `name` | Direct copy |
| — | `version` | `"0.0.0"` |
| — | `taskType` | `"subagent"` (default for role-defined tasks) |
| `RoleType.instructions` | `prompt` | Role instructions become the prompt |
| — | `apps`, `skills`, `subTasks` | Empty arrays |

#### AppConfig → ResolvedApp

| AppConfig field | ResolvedApp field | Transformation |
|---|---|---|
| `name` | `name` | Direct copy |
| — | `version` | `"0.0.0"` |
| `transport` | `transport` | Direct copy, default `"stdio"` |
| `command` | `command` | Direct copy |
| `args` | `args` | Direct copy |
| `url` | `url` | Direct copy |
| `env` | `env` | Direct copy |
| `tools.allow` | `tools` | Copy allow list |
| — | `capabilities` | Empty array |
| `credentials` | `credentials` | Direct copy |

#### SkillRef → ResolvedSkill

| SkillRef field | ResolvedSkill field | Transformation |
|---|---|---|
| `name` | `name` | Direct copy |
| — | `version` | `"0.0.0"` |
| — | `artifacts` | Empty array (resources tracked separately) |
| — | `description` | Name used as description |

### Dialect Awareness

The `agentType` parameter is used to:
1. Validate that the agent type has a registered dialect (via `getDialect()`)
2. Set the `runtimes` array on the output `ResolvedAgent`

The adapter does NOT re-translate field names — it produces the generic `ResolvedAgent` shape that materializers consume. The materializer itself handles agent-native output.

### Error Handling

- Throws `AdapterError` if `agentType` does not match a registered dialect
- All other validation is handled by the RoleType Zod schema (input is already validated)

## Dependencies

- `@clawmasons/shared` types: `RoleType`, `ResolvedAgent`, `ResolvedRole`, `ResolvedTask`, `ResolvedApp`, `ResolvedSkill`
- Dialect registry: `getDialect()` from `./dialect-registry.ts`

## Test Plan

1. **Basic adaptation** — Create a minimal `RoleType`, adapt to `ResolvedAgent`, verify all fields
2. **Round-trip per dialect** — Parse a ROLE.md for claude-code, codex, aider → adapt → verify
3. **App permissions mapping** — Verify `apps[].tools` → `role.permissions` aggregation
4. **Container requirements** — Verify apt packages, mounts, baseImage carry through
5. **Governance** — Verify risk, constraints, credentials
6. **Invalid agent type** — Verify error thrown for unknown dialect
7. **Empty/minimal role** — Verify defaults work for a role with only required fields
