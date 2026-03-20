# Development

Developer guide for contributing to the mason monorepo.

## Project Structure

```
mason/
  packages/
    cli/                  # @clawmasons/mason — CLI and library
    shared/               # @clawmasons/shared — schemas, types, utilities
    proxy/                # @clawmasons/proxy — MCP proxy server
    credential-service/   # @clawmasons/credential-service — credential resolver
    agent-entry/          # @clawmasons/agent-entry — agent bootstrap binary
    mcp-agent/            # MCP agent runtime (REPL + ACP modes)
    placeholders/         # Stub packages for testing
    tests/                # End-to-end test suite
  scripts/                # CLI entry point and dev scripts
```

## Quickstart

1. Install prerequisites

  - Docker
  - Node/NPM
  - Vscode
  - Claude Code with 

2. Clone, build and laucnh a dev-container with the the "lead" role

```bash
git clone git@github.com:clawmasons/mason.git
npm install          # install dependencies
npm run build        # compile TypeScript
./scripts/mason.js lead-dev-container

```
Select "y" to launch vscode

## Next Steps

Op


## E2E Tests

End-to-end tests are in the `packages/tests/` directory and require Docker:

```bash
cd packages/tests
npm run setup        # initialize test fixtures
npx vitest run --config vitest.config.ts
npm run teardown     # clean up
```

Some tests require API keys and will skip gracefully if unavailable. See [packages/tests/README.md](packages/tests/README.md) for details on individual test suites.

## Verification Checklist

Before submitting changes:

```bash
npx tsc --noEmit                    # type-check
npx eslint src/ tests/              # lint
npx vitest run                      # unit tests
cd packages/tests && npx vitest run --config vitest.config.ts  # e2e tests
```

## Programmatic API

Mason exports its core modules for use as a library:

```ts
import {
  discoverPackages,
  discoverRoles,
  resolveRole,
  materializeForAgent,
  claudeCodeMaterializer,
} from "@clawmasons/mason";

import {
  parseField,
  computeToolFilters,
  readMaterializedRole,
  readPackagedRole,
  type Role,
  type Field,
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
