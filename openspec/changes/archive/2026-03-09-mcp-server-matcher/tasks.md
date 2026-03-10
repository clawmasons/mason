## 1. Types & Interfaces

- [x] 1.1 Create `packages/cli/src/acp/matcher.ts` with `McpServerConfig`, `MatchedServer`, `UnmatchedServer`, and `MatchResult` type exports

## 2. Core Matching Logic

- [x] 2.1 Implement `buildAppShortNameIndex(apps: ResolvedApp[]): Map<string, ResolvedApp[]>` — builds a case-insensitive lookup from app short names to apps
- [x] 2.2 Implement `matchServers(mcpServers: Record<string, McpServerConfig>, apps: ResolvedApp[]): MatchResult` — iterates mcpServers, matches against index, returns result
- [x] 2.3 Implement secondary disambiguation logic: compare command+args for stdio apps, url for remote apps when multiple apps share the same short name

## 3. Tests

- [x] 3.1 Create `packages/cli/tests/acp/matcher.test.ts` with test scaffolding and helper factories
- [x] 3.2 Test: name-based matching (case-insensitive) — `"github"` matches `@clawmasons/app-github`
- [x] 3.3 Test: unmatched server gets descriptive reason
- [x] 3.4 Test: empty mcpServers returns empty result
- [x] 3.5 Test: all servers unmatched when no apps exist
- [x] 3.6 Test: duplicate app short names use command/URL for disambiguation
- [x] 3.7 Test: multiple servers, some matched some unmatched
- [x] 3.8 Test: case-insensitive matching (`"GitHub"` matches `"github"` short name)
