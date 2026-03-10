## Context

The ACP proxy (PRD: `openspec/prds/acp-proxy/`) needs to transform matched MCP servers into a container-ready configuration and warn about dropped servers. CHANGE 1 (MCP Server Matcher) produces a `MatchResult` with `matched` and `unmatched` arrays. This change consumes that result to produce: (1) the rewritten `mcpServers` config for the agent container, and (2) formatted warning messages.

The rewriter replaces all matched MCP server entries with a single `chapter` entry pointing to the chapter proxy's streamable-http endpoint inside the Docker network. Credentials embedded in matched servers' `env` fields are extracted for injection into the credential-service as session overrides (consumed by CHANGE 4).

## Goals / Non-Goals

**Goals:**
- Implement `rewriteMcpConfig()` as a pure function producing a single-entry `mcpServers` config
- Implement `extractCredentials()` to collect all env vars from matched servers
- Implement `generateWarnings()` and `formatWarning()` for structured warning output
- Warning format matches PRD REQ-004 exactly
- Handle edge cases: no matched servers, no unmatched servers, empty env fields, duplicate credential keys

**Non-Goals:**
- Actually starting Docker containers or writing files (CHANGE 5/8)
- Connecting to credential-service (CHANGE 4)
- ACP protocol handling (CHANGE 7)
- Audit logging of dropped servers (CHANGE 10)

## Decisions

### D1: Single `chapter` entry regardless of match count

**Choice:** The rewritten config always contains exactly one `chapter` entry with the proxy URL and auth header, even if zero servers matched.

**Rationale:** The PRD (REQ-003) specifies replacing all matched servers with "a single `chapter` entry." The agent should always connect to the chapter proxy for its tools, even if no ACP client servers matched (the agent still gets the role's governed tools from the workspace config). An empty matched list means the proxy has no ACP-client-originated upstreams, but the agent still needs the proxy connection.

### D2: Credential extraction merges all env fields

**Choice:** `extractCredentials()` collects all key-value pairs from all matched servers' `env` fields into a single flat record. If two servers provide the same key, the later one wins (last-write-wins).

**Rationale:** Credentials from ACP client configs become session overrides in the credential-service. A flat merge is simple and sufficient. Duplicate keys are unlikely (different servers use different credential names), but last-write-wins is deterministic and predictable.

### D3: Warning format follows PRD exactly

**Choice:** Each warning is a multi-line string matching the PRD REQ-004 format:
```
[chapter acp-proxy] WARNING: Dropping unmatched MCP server "<name>"
  -> No chapter App matches server name, command, or URL
  -> Agent will not have access to tools from this server
  -> To govern this server, create a chapter App package for it
```

**Rationale:** Consistent with the PRD specification. The `reason` field from the `UnmatchedServer` can optionally be included for more specific diagnostics.

### D4: Pure functions, no classes

**Choice:** All exports are standalone functions, not classes.

**Rationale:** Consistent with CHANGE 1's matcher design. No state to manage — these are pure transformations.

## Design

### Rewriter (`rewriter.ts`)

```typescript
interface RewriteResult {
  mcpServers: Record<string, McpServerConfig>;
  extractedCredentials: Record<string, string>;
}

function rewriteMcpConfig(
  matchResult: MatchResult,
  proxyUrl: string,
  sessionToken: string,
): RewriteResult;

function extractCredentials(
  matched: MatchedServer[],
): Record<string, string>;
```

**`rewriteMcpConfig` algorithm:**
1. Call `extractCredentials(matchResult.matched)` to collect env vars
2. Build single `chapter` entry: `{ url: proxyUrl, headers: { Authorization: "Bearer <sessionToken>" } }`
3. Return `{ mcpServers: { chapter: { ... } }, extractedCredentials }`

**`extractCredentials` algorithm:**
1. Initialize empty record
2. For each matched server, merge its `config.env` into the record (last-write-wins)
3. Return the merged record

### Warnings (`warnings.ts`)

```typescript
function generateWarnings(unmatched: UnmatchedServer[]): string[];
function formatWarning(server: UnmatchedServer): string;
```

**`formatWarning` algorithm:**
1. Build multi-line string matching PRD format
2. Include the server name and reason

**`generateWarnings` algorithm:**
1. Map each unmatched server through `formatWarning()`
2. Return array of formatted warning strings

### File Locations

- `packages/cli/src/acp/rewriter.ts` — rewriter implementation
- `packages/cli/src/acp/warnings.ts` — warning generator implementation
- `packages/cli/tests/acp/rewriter.test.ts` — rewriter tests
- `packages/cli/tests/acp/warnings.test.ts` — warning tests

### Dependencies

- Types from `packages/cli/src/acp/matcher.ts`: `MatchResult`, `MatchedServer`, `UnmatchedServer`, `McpServerConfig`
- No external dependencies beyond those already in the matcher
