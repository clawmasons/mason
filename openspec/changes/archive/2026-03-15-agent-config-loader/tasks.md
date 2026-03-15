## 1. Extend Config Schema in agent-sdk

- [x] 1.1 Update `AgentEntryConfig` interface in `packages/agent-sdk/src/discovery.ts` to add optional `home`, `mode` (`"terminal" | "acp" | "bash"`), and `role` string fields
- [x] 1.2 Add `mode` validation in `loadConfigAgents`: warn and default to `"terminal"` for invalid values
- [x] 1.3 Export `loadConfigAgentEntry(projectDir, agentName): AgentEntryConfig | undefined` — sync, no dynamic imports
- [x] 1.4 Export `readConfigAgentNames(projectDir): string[]` — sync, returns agent key names only
- [x] 1.5 Update `AgentEntryConfig` export in `packages/agent-sdk/src/index.ts`

## 2. Extend Shorthand Detection

- [x] 2.1 In `packages/cli/src/cli/commands/index.ts`, call `readConfigAgentNames(process.cwd())` synchronously at startup and pass the result into `installAgentTypeShorthand`
- [x] 2.2 Update `installAgentTypeShorthand` to accept a `configAgentNames: Set<string>` parameter and include those names in the shorthand trigger check alongside `isKnownAgentType`

## 3. Rename --agent-type to --agent and add new flags

- [x] 3.1 In `registerRunCommand`, rename `--agent-type <name>` option to `--agent <name>` and rename the positional argument from `[agent-type]` to `[agent]`
- [x] 3.2 Add `--home <path>` option to `registerRunCommand`
- [x] 3.3 Add `--terminal` flag to `registerRunCommand`
- [x] 3.4 Update `createRunAction` options type to reflect renamed and new fields (`agent` instead of `agentType`, plus `home` and `terminal`)
- [x] 3.5 Update `RUN_ACP_AGENT_HELP_EPILOG` to document `--agent`, `--home`, and `--terminal`

## 4. Apply Config Launch Defaults in Run Flow

- [x] 4.1 In `createRunAction`, after resolving the agent name, call `loadConfigAgentEntry(process.cwd(), agentInput)` to retrieve the config entry
- [x] 4.2 Derive effective `role` from: `--role` flag → config `role` → error if neither
- [x] 4.3 Derive effective `mode` from: `--acp` / `--bash` / `--terminal` flags → config `mode` → default `"terminal"`
- [x] 4.4 Derive effective `home` from: `--home` flag → config `home` → `undefined`
- [x] 4.5 Expand `~` in effective `home` using `os.homedir()`; warn if the expanded path does not exist
- [x] 4.6 Pass effective `home` through to `runAgent` / `runAgentInteractiveMode` / `runAgentAcpMode` via options

## 5. Apply Home Mount in Docker Compose Generation

- [x] 5.1 Add optional `homeOverride?: string` parameter to `generateComposeYml` options
- [x] 5.2 When `homeOverride` is set, add a volume entry `"<homeOverride>:/home/mason/"` to the agent service in the generated compose YAML
- [x] 5.3 Pass `homeOverride` from `runAgentInteractiveMode` and `runProxyOnly` into `generateComposeYml`

## 6. Config Auto-Init

- [x] 6.1 Create a `ensureMasonConfig(projectDir: string): void` helper (in CLI, not agent-sdk) that writes the default template to `.mason/config.json` if it does not exist, creating `.mason/` if needed, and prints the creation notice
- [x] 6.2 Call `ensureMasonConfig` in `createRunAction` when an agent name is provided via `--agent` flag or positional shorthand (not when running role-only with no agent name)

## 7. Update RunAgentDeps and AcpMode

- [x] 7.1 Add `homeOverride?: string` to `RunAgentDeps` / `runAgent` / `runAgentInteractiveMode` / `runAgentAcpMode` signatures for testability
- [x] 7.2 Pass `homeOverride` into `AcpSession` compose generation if used in ACP mode

## 8. Tests

- [x] 8.1 Unit tests for `loadConfigAgentEntry`: found, not found, absent file, invalid mode
- [x] 8.2 Unit tests for `readConfigAgentNames`: normal, absent file, malformed JSON
- [x] 8.3 Unit tests for `installAgentTypeShorthand` with config-declared agent names
- [x] 8.4 Unit tests for `createRunAction`: `--agent` flag resolution, config defaults applied, `--role` override, `--terminal` override, `--home` override, auto-init trigger
- [x] 8.5 Unit tests for `generateComposeYml` with `homeOverride` set
- [x] 8.6 Unit tests for `ensureMasonConfig`: creates file when absent, skips when present
- [x] 8.7 Verify TypeScript compiles with no errors: `npx tsc --noEmit`
- [x] 8.8 Run existing test suite: `npx vitest run`
