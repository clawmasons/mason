# credential-loading

## Overview

Credential loading module that parses `.env` files and resolves `${VAR}` references in app environment configurations. Used by the `forge proxy` command to pass credentials to upstream MCP server processes.

## Source

- `src/proxy/credentials.ts`

## Public API

### `loadEnvFile(filePath: string): Record<string, string>`

Parses a `.env` file into a key-value record.

**Behavior:**
- Returns empty object if file does not exist
- Skips blank lines and comments (lines starting with `#`)
- Handles double-quoted and single-quoted values
- Strips inline comments after unquoted values (` #` delimiter)
- Handles values containing `=` signs
- Skips lines without `=` sign

### `resolveEnvVars(env: Record<string, string>, loaded: Record<string, string>): Record<string, string>`

Resolves `${VAR}` references in an env record.

**Resolution order:**
1. `process.env` (allows runtime overrides)
2. Loaded `.env` values
3. Unresolved references become empty strings

**Supports:**
- Multiple `${VAR}` references in a single value
- Mixed literal and reference values (e.g., `https://${HOST}:${PORT}/api`)

## Integration

Used by `startProxy()` in `src/cli/commands/proxy.ts`:
1. Loads `.env` from workspace root
2. For each app with `env` field, resolves `${VAR}` references
3. Passes resolved env to `UpstreamManager` which forwards to stdio processes

## Tests

- `tests/proxy/credentials.test.ts` — 16 tests covering .env parsing edge cases and variable resolution
