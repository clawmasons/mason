## 1. Rewriter Implementation

- [x] 1.1 Create `packages/cli/src/acp/rewriter.ts` with `RewriteResult` type export
- [x] 1.2 Implement `extractCredentials(matched: MatchedServer[]): Record<string, string>` — merges all env fields from matched servers
- [x] 1.3 Implement `rewriteMcpConfig(matchResult: MatchResult, proxyUrl: string, sessionToken: string): RewriteResult` — produces single chapter entry and extracted credentials

## 2. Warning Generator Implementation

- [x] 2.1 Create `packages/cli/src/acp/warnings.ts` with `formatWarning` and `generateWarnings` exports
- [x] 2.2 Implement `formatWarning(server: UnmatchedServer): string` — produces PRD-format warning string
- [x] 2.3 Implement `generateWarnings(unmatched: UnmatchedServer[]): string[]` — maps unmatched servers through formatWarning

## 3. Rewriter Tests

- [x] 3.1 Create `packages/cli/tests/acp/rewriter.test.ts` with test scaffolding
- [x] 3.2 Test: rewritten config has single `chapter` entry with correct URL and auth header
- [x] 3.3 Test: credentials extracted from matched servers' env fields
- [x] 3.4 Test: duplicate credential keys — last-write-wins
- [x] 3.5 Test: empty matched list still produces valid chapter proxy entry
- [x] 3.6 Test: matched servers with no env fields produce empty credentials
- [x] 3.7 Test: mixed servers — some with env, some without

## 4. Warning Generator Tests

- [x] 4.1 Create `packages/cli/tests/acp/warnings.test.ts` with test scaffolding
- [x] 4.2 Test: warning format matches PRD spec (`[chapter acp-proxy] WARNING: Dropping unmatched MCP server "..."`)
- [x] 4.3 Test: no warnings when unmatched list is empty
- [x] 4.4 Test: multiple unmatched servers produce multiple warnings
- [x] 4.5 Test: warning includes server name and reason
