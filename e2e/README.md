# E2E Tests

End-to-end tests for chapter materialization and Docker Compose generation.

## Manual Setup & Teardown

### Prerequisites

```bash
cd e2e
npm install
```

Optionally copy `.env.example` to `.env` and fill in values (e.g. `OPENROUTER_API_KEY` for live API tests).

### Setup a test environment

```bash
npm run setup
```

This creates a temporary workspace from the fixtures in `fixtures/test-chapter/`, runs `chapter init` and `chapter install` for each fixture member, and saves the workspace path to `.last-workspace`.

To use a custom directory instead of a temp directory:

```bash
E2E_WORKSPACE_DIR=/path/to/workspace npm run setup
```

### Tear down

```bash
npm run teardown
```

This stops any running Docker Compose stacks in the workspace, removes the workspace directory, and cleans up `.last-workspace`.

### Run tests

```bash
npm test
```

Tests that require Docker or API keys skip gracefully when unavailable.
