## Architecture

### Dialect Registry

A simple lookup table with two access patterns:
1. **By directory name** — given a parent directory (e.g., `.claude`), return the dialect.
2. **By dialect name** — given a dialect (e.g., `claude-code`), return field mappings.

```typescript
interface DialectFieldMapping {
  tasks: string;      // e.g., "commands" for Claude Code
  apps: string;       // e.g., "mcp_servers" for Claude Code
  skills: string;     // e.g., "skills" for Claude Code
}

interface DialectEntry {
  name: string;              // e.g., "claude-code"
  directory: string;         // e.g., ".claude"
  fieldMapping: DialectFieldMapping;
}
```

Per PRD Appendix B:
| Runtime      | Directory  | tasks       | apps          | skills   |
|-------------|-----------|-------------|--------------|----------|
| Claude Code | `.claude`  | `commands`  | `mcp_servers` | `skills` |
| Codex       | `.codex`   | `instructions` | `mcp_servers` | `skills` |
| Aider       | `.aider`   | `conventions` | `mcp_servers` | `skills` |

The registry is extensible — new entries can be registered at runtime.

### YAML Frontmatter Parsing

The parser splits on `---` delimiters:
1. Line 1 must be `---`
2. Everything until the next `---` is YAML
3. Everything after is the markdown body (instructions)

Uses `js-yaml` for YAML parsing. On malformed YAML, throws a descriptive error.

### Field Normalization

After parsing frontmatter:
1. Detect dialect from the role path (walk up to find `.claude/`, `.codex/`, `.aider/`)
2. Look up field mapping from registry
3. Rename agent-specific fields to generic names:
   - `frontmatter[dialect.fieldMapping.tasks]` → `tasks` (as `TaskRef[]`)
   - `frontmatter[dialect.fieldMapping.apps]` → `apps` (as `AppConfig[]`)
   - `frontmatter[dialect.fieldMapping.skills]` → `skills` (as `SkillRef[]`)
4. Pass-through fields that don't need mapping: `container`, `risk`, `credentials`, `constraints`

### Dependency Resolution

- **Skills**: String entries. If starts with `./` or `../`, resolve relative to project root → `SkillRef` with name derived from path. Otherwise treat as package reference.
- **Tasks/commands**: String entries → `TaskRef` with the string as `name`.
- **Apps/mcp_servers**: Object entries → `AppConfig` directly (already structured).

### Resource Scanner

Recursively walks the role directory. For each file (excluding `ROLE.md`):
- `relativePath` = path relative to role directory
- `absolutePath` = resolved absolute path
- `permissions` = file mode from `fs.stat()`

### Design Decisions

- **Async API**: `readMaterializedRole` is async because it reads filesystem. All I/O is async.
- **Dialect detection from path**: Walk up from ROLE.md to find the agent directory. The pattern is `.<agent>/roles/<name>/ROLE.md`. If the path doesn't match any known dialect, the parser throws.
- **No content loading**: ResourceFile stores paths only, per PRD §5.1.
- **Zod validation**: After field normalization, the result is validated through `roleTypeSchema.parse()` for runtime safety.
