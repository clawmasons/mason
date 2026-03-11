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
```

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

Some tests require API keys and will skip gracefully if unavailable.

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
  resolveAgent,
  validateAgent,
  claudeCodeMaterializer,
} from "@clawmasons/chapter";

import {
  parseChapterField,
  computeToolFilters,
  type ResolvedAgent,
  type ChapterField,
} from "@clawmasons/shared";
```

## License

MIT
