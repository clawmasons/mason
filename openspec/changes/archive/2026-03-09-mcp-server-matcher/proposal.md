## Why

The ACP proxy needs to intercept an ACP client's `mcpServers` configuration and determine which servers correspond to chapter-governed Apps. Without this matching logic, the proxy cannot distinguish governed servers (to be routed through the chapter proxy) from ungoverned ones (to be dropped with warnings). The matcher is the foundational pure-logic component that all downstream ACP proxy features depend on.

## What Changes

- New `packages/cli/src/acp/matcher.ts` — pure function `matchServers()` that takes a map of ACP client `mcpServers` entries and a list of `ResolvedApp` objects, then produces a `MatchResult` with matched servers (linked to their chapter App) and unmatched servers (with descriptive reasons).
- New `packages/cli/tests/acp/matcher.test.ts` — comprehensive unit tests covering name-based matching, case insensitivity, command/URL disambiguation, empty inputs, and edge cases.

## Capabilities

### New Capabilities
- `mcp-server-matcher`: Pure matching logic that compares ACP client mcpServers entries against chapter's resolved Apps using `getAppShortName()` as primary key (case-insensitive), with command/args and URL as secondary disambiguation signals.

### Modified Capabilities
_(none)_

## Impact

- **New file:** `packages/cli/src/acp/matcher.ts`
- **New test:** `packages/cli/tests/acp/matcher.test.ts`
- **Dependencies:** `@clawmasons/shared` (for `getAppShortName` and `ResolvedApp` type)
- **No breaking changes** — this is a new module with no modifications to existing code
