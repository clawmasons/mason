## Context

The ACP proxy (PRD: `openspec/prds/acp-proxy/`) intercepts an ACP client's `mcpServers` configuration and needs to match each entry against chapter's resolved Apps. This matching determines which servers are governed (routed through the chapter proxy) and which are ungoverned (dropped with warnings).

The existing `getAppShortName()` function in `packages/shared/src/toolfilter.ts` already extracts short names from chapter package names (e.g., `@clawmasons/app-github` -> `github`). The `ResolvedApp` type in `packages/shared/src/types.ts` carries `command`, `args`, `url`, and `transport` fields that can serve as secondary disambiguation signals.

## Goals / Non-Goals

**Goals:**
- Implement `matchServers()` as a pure function with no side effects
- Primary matching: case-insensitive comparison of mcpServers key against `getAppShortName(app.name)`
- Secondary matching: command/args or URL comparison when multiple apps share the same short name
- Return structured `MatchResult` with matched servers (linked to their app) and unmatched servers (with reasons)
- Handle edge cases: empty inputs, no apps, all unmatched, duplicate short names

**Non-Goals:**
- Tool-inventory-based matching (REQ-009, P1 — future change)
- MCP server rewriting (CHANGE 2)
- Warning formatting/logging (CHANGE 2)
- Any I/O, network calls, or Docker interaction

## Decisions

### D1: Primary key is case-insensitive name match

**Choice:** Compare `mcpServers` key (lowercased) against `getAppShortName(app.name)` (lowercased).

**Rationale:** ACP clients may use varying casing for server names (e.g., `GitHub` vs `github`). The PRD specifies case-insensitive matching (REQ-002). Using `getAppShortName()` reuses the existing convention-stripping logic.

### D2: Secondary disambiguation uses command+args or URL

**Choice:** When multiple apps produce the same short name (unlikely but possible), use `command`+`args` for stdio apps and `url` for remote apps as tiebreakers.

**Rationale:** The PRD states "Command/URL matching is used as a secondary signal for disambiguation when multiple apps could match." This only activates when there's ambiguity — a unique name match is sufficient.

### D3: Unmatched servers get descriptive reasons

**Choice:** Each `UnmatchedServer` includes a `reason` string explaining why it didn't match.

**Rationale:** The reason string feeds into CHANGE 2's warning generator. Providing structured reasons makes warnings more actionable for users.

### D4: Pure function, no class

**Choice:** Export `matchServers()` as a standalone function, not a class.

**Rationale:** The matcher has no state. A pure function is simpler to test, compose, and reason about. It takes inputs and returns outputs with no side effects.

## Design

### Types

```typescript
// Input: ACP client's MCP server configuration
interface McpServerConfig {
  command?: string;
  args?: string[];
  url?: string;
  env?: Record<string, string>;
  headers?: Record<string, string>;
}

// Output: A matched server linked to its chapter App
interface MatchedServer {
  name: string;           // mcpServers key (e.g., "github")
  config: McpServerConfig;
  app: ResolvedApp;       // The chapter App it matched
  appShortName: string;   // e.g., "github"
}

// Output: An unmatched server with reason
interface UnmatchedServer {
  name: string;           // mcpServers key
  config: McpServerConfig;
  reason: string;         // Human-readable explanation
}

// Output: Complete match result
interface MatchResult {
  matched: MatchedServer[];
  unmatched: UnmatchedServer[];
}
```

### Algorithm

```
matchServers(mcpServers, apps):
  1. Build lookup: Map<lowercase_short_name, ResolvedApp[]> from apps
  2. For each (name, config) in mcpServers:
     a. Lowercase name
     b. Look up in the map
     c. If exactly one app matches by name → MATCHED
     d. If multiple apps match by name → disambiguate:
        - For stdio: compare command+args
        - For remote: compare url
        - If disambiguated → MATCHED with best match
        - If still ambiguous → MATCHED with first (log warning)
     e. If no match → UNMATCHED with reason
  3. Return { matched, unmatched }
```

### File Location

- `packages/cli/src/acp/matcher.ts` — implementation
- `packages/cli/tests/acp/matcher.test.ts` — tests

### Dependencies

- `getAppShortName` from `@clawmasons/shared` (imported via workspace dependency)
- `ResolvedApp` type from `@clawmasons/shared`
