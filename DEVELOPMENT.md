# Development

Developer guide for contributing to the clawmasons/chapter monorepo.

## Project Structure

```
chapter/
  packages/
    cli/                  # @clawmasons/chapter — CLI and library
    shared/               # @clawmasons/shared — schemas, types, utilities
    proxy/                # @clawmasons/proxy — MCP proxy server
    credential-service/   # @clawmasons/credential-service — credential resolver
    agent-entry/          # @clawmasons/agent-entry — agent bootstrap binary
    mcp-agent/            # MCP agent runtime (REPL + ACP modes)
    placeholders/         # Stub packages for testing
  e2e/                    # End-to-end test suite
  bin/                    # CLI entry point
  dist/                   # Packed .tgz files (generated)
  docker/                 # Docker artifacts (generated)
  skills/                 # Built-in skills (e.g., mason)
```

## Architecture

### ROLE_TYPES Pipeline

The core architecture follows a transformation pipeline:

```
ROLE.md (agent-specific dialect)
    ↓ readMaterializedRole()
ROLE_TYPES (generic in-memory representation)
    ↓ materializeForAgent()
Docker build directory (agent-native workspace)
```

Key components:

- **Dialect Registry** (`packages/shared/src/role/dialect-registry.ts`) — Maps agent-specific field names (e.g., Claude's `commands`, Codex's `instructions`) to generic ROLE_TYPES names (`tasks`, `apps`, `skills`).
- **ROLE.md Parser** (`packages/shared/src/role/parser.ts`) — Parses YAML frontmatter + markdown body, normalizes via dialect registry.
- **Package Reader** (`packages/shared/src/role/package-reader.ts`) — Loads NPM role packages into the same ROLE_TYPES representation.
- **Role Discovery** (`packages/shared/src/role/discovery.ts`) — Finds roles from all sources (local ROLE.md + installed NPM packages) with local-over-package precedence.
- **Adapter** (`packages/shared/src/role/adapter.ts`) — Bridges ROLE_TYPES to the existing materializer interface.
- **Materializer** (`packages/cli/src/materializer/`) — Generates Docker build directories from ROLE_TYPES input.

### Package Types

| Type | `chapter.type` | Purpose |
|------|---------------|---------|
| **Role** | `role` | Deployable unit — tasks, tools, permissions, system prompt |
| **App** | `app` | MCP server providing tools |
| **Skill** | `skill` | Knowledge artifacts (prompts, conventions) |
| **Task** | `task` | Unit of work for the agent |

Each package has a `chapter` field in its `package.json` that declares its type and configuration.

## Setup

```bash
npm install          # install dependencies
npm run build        # compile TypeScript
npm run typecheck    # type-check without emitting
npm run lint         # run ESLint
npm test             # run unit tests
```

## Using a Local Build

```bash
# Build from source
npm install && npm run build

# Link globally, then use in a consuming project
cd packages/cli && npm link
cd /path/to/project && npm link @clawmasons/chapter
```

## E2E Tests

End-to-end tests are in the `e2e/` directory and require Docker:

```bash
cd e2e
npm run setup        # initialize test fixtures
npx vitest run --config vitest.config.ts
npm run teardown     # clean up
```

Some tests require API keys and will skip gracefully if unavailable. See [e2e/README.md](e2e/README.md) for details on individual test suites.

## Verification Checklist

Before submitting changes:

```bash
npx tsc --noEmit                    # type-check
npx eslint src/ tests/              # lint
npx vitest run                      # unit tests
cd e2e && npx vitest run --config vitest.config.ts  # e2e tests
```

## Programmatic API

Chapter exports its core modules for use as a library:

```ts
import {
  discoverPackages,
  discoverRoles,
  resolveRole,
  materializeForAgent,
  claudeCodeMaterializer,
} from "@clawmasons/chapter";

import {
  parseChapterField,
  computeToolFilters,
  readMaterializedRole,
  readPackagedRole,
  type RoleType,
  type ChapterField,
} from "@clawmasons/shared";
```

## Adding a New Agent Dialect

To add support for a new agent runtime:

1. Add an entry to the dialect registry in `packages/shared/src/role/dialect-registry.ts` mapping the runtime's directory name and field names.
2. Implement a materializer in `packages/cli/src/materializer/` that generates the runtime's native workspace format from ROLE_TYPES.
3. Register the agent type in the CLI's agent type registry.
4. Add e2e tests exercising the new runtime.

## License

MIT
