## Why

The agent-roles PRD (Change 2) requires a parser that reads local ROLE.md files and produces ROLE_TYPES objects. Without this, roles cannot be loaded from the filesystem. The dialect registry enables agent-native authoring — users write Claude-dialect frontmatter (`commands`, `mcp_servers`) and the parser normalizes to generic names (`tasks`, `apps`). This is the entry point for the local-first workflow: ROLE.md → ROLE_TYPES.

## What Changes

- `packages/shared/src/role/dialect-registry.ts`: Dialect field mappings per Appendix B. Maps directory names (`.claude/`, `.codex/`, `.aider/`) to dialect names and field name translations (e.g., `commands` → `tasks`, `mcp_servers` → `apps`). Extensible — new runtimes add entries.
- `packages/shared/src/role/parser.ts`: `readMaterializedRole(rolePath: string): Promise<RoleType>` — reads a ROLE.md, detects dialect from parent directory, parses YAML frontmatter, extracts markdown body as `instructions`, normalizes field names via dialect registry, resolves bundled resources and dependencies.
- `packages/shared/src/role/resource-scanner.ts`: `scanBundledResources(roleDir: string): Promise<ResourceFile[]>` — recursively scans the role directory for sibling files/directories (excluding ROLE.md itself), returns `ResourceFile` entries with absolute and relative paths.
- `packages/shared/src/role/index.ts`: Barrel exports for the role module.
- `packages/shared/src/index.ts`: Re-export role module functions.
- `packages/shared/tests/role-parser.test.ts`: Tests for all three dialects, field normalization, resource discovery, malformed frontmatter rejection.
- `packages/shared/package.json`: Add `js-yaml` dependency.

## How to Verify

```bash
npx tsc --noEmit          # TypeScript compiles
npx vitest run             # All tests pass
npx eslint packages/shared/src/ packages/shared/tests/  # Lint passes
```
