## 1. Extend AgentEntryConfig type and parser

- [x] 1.1 Add `credentials?: string[]` to the `AgentEntryConfig` interface in `packages/agent-sdk/src/discovery.ts`
- [x] 1.2 Parse `credentials` in `parseEntryConfig`: validate it's a string array, warn and skip invalid entries, assign to `entry.credentials`

## 2. Merge agent config credentials into agent-launch.json

- [x] 2.1 In `run-agent.ts`, after loading `configEntry`, prepend `configEntry?.credentials ?? []` into the `roleCredentials` array passed to `generateAgentLaunchJson` (deduped)

## 3. Merge agent config credentials into the compose credential keys

- [x] 3.1 In `run-agent.ts`, add `configEntry?.credentials ?? []` into `declaredCredentialKeys` (alongside role and app credentials) so they are passed to the container environment and credential service — do this in all three code paths that build `declaredCredentialKeys` (terminal, dev-container, ACP)

## 4. Tests

- [x] 4.1 Unit test `parseEntryConfig`: `credentials` array is parsed correctly, non-array value logs warning and is ignored, non-string entries log warning and are skipped
- [x] 4.2 Unit test credential merge: agent config credentials appear in `agent-launch.json`, duplicates from SDK and role are deduplicated

## 5. Verification

- [x] 5.1 `npx tsc --noEmit` passes with no new errors
- [x] 5.2 `npx eslint src/ tests/` passes
- [x] 5.3 `npx vitest run` passes
