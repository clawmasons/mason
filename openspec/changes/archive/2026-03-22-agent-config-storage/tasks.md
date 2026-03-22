## 1. Extend AgentEntryConfig

- [x] 1.1 Add `config?: Record<string, Record<string, string>>` to `AgentEntryConfig` in `packages/agent-sdk/src/discovery.ts`
- [x] 1.2 Update `parseEntryConfig()` to parse and store the `config` field when present

## 2. Implement getAgentConfig

- [x] 2.1 Add `getAgentConfig(projectDir: string, agentName: string): Record<string, Record<string, string>>` function in `packages/agent-sdk/src/discovery.ts`
- [x] 2.2 Returns `agents.<agentName>.config` or `{}` when missing

## 3. Implement saveAgentConfig

- [x] 3.1 Add private `readRawConfig()` and `writeMasonConfigAtomic()` helpers with atomic write (temp file + rename)
- [x] 3.2 Add `saveAgentConfig(projectDir: string, agentName: string, config: Record<string, Record<string, string>>): void` function
- [x] 3.3 Deep-merges config into existing agent entry (creates entry if needed)
- [x] 3.4 Creates `.mason/` directory and `config.json` if they don't exist

## 4. Export new functions

- [x] 4.1 Export `getAgentConfig` and `saveAgentConfig` from `packages/agent-sdk/src/index.ts`

## 5. Tests

- [x] 5.1 Create `packages/agent-sdk/tests/agent-config-storage.test.ts`
- [x] 5.2 Round-trip test: save then read returns same values
- [x] 5.3 Preserve existing agent entry fields (package, credentials, etc.)
- [x] 5.4 Preserve other agents' entries when saving
- [x] 5.5 Deep merge: partial config update merges with existing
- [x] 5.6 Create from scratch: non-existent file and directory
- [x] 5.7 Create agent entry when agent not in config
- [x] 5.8 Read returns `{}` when agent has no config / file missing / agent missing
- [x] 5.9 loadConfigAgentEntry returns config field after save
- [x] 5.10 Verify `npx tsc --noEmit` passes
- [x] 5.11 Verify `npx vitest run packages/agent-sdk/tests/` passes (168 tests, all green)
