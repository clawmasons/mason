## 1. Extend Config Schema in agent-sdk

- [ ] 1.1 Update `AgentEntryConfig` interface in `packages/agent-sdk/src/discovery.ts` to add optional `home`, `mode` (`"terminal" | "acp" | "bash"`), and `role` string fields
- [ ] 1.2 Add `mode` validation in `loadConfigAgents`: warn and default to `"terminal"` for invalid values
- [ ] 1.3 Export `loadConfigAgentEntry(projectDir, agentName): AgentEntryConfig | undefined` — sync, no dynamic imports
- [ ] 1.4 Export `readConfigAgentNames(projectDir): string[]` — sync, returns agent key names only
- [ ] 1.5 Update `AgentEntryConfig` export in `packages/agent-sdk/src/index.ts`

## 2. Extend Shorthand Detection

- [ ] 2.1 In `packages/cli/src/cli/commands/index.ts`, call `readConfigAgentNames(process.cwd())` synchronously at startup and pass the result into `installAgentTypeShorthand`
- [ ] 2.2 Update `installAgentTypeShorthand` to accept a `configAgentNames: Set<string>` parameter and include those names in the shorthand trigger check alongside `isKnownAgentType`

## 3. Rename --agent-type to --agent and add new flags

- [ ] 3.1 In `registerRunCommand`, rename `--agent-type <name>` option to `--agent <name>` and rename the positional argument from `[agent-type]` to `[agent]`
- [ ] 3.2 Add `--home <path>` option to `registerRunCommand`
- [ ] 3.3 Add `--terminal` flag to `registerRunCommand`
- [ ] 3.4 Update `createRunAction` options type to reflect renamed and new fields (`agent` instead of `agentType`, plus `home` and `terminal`)
- [ ] 3.5 Update `RUN_ACP_AGENT_HELP_EPILOG` to document `--agent`, `--home`, and `--terminal`

## 4. Apply Config Launch Defaults in Run Flow

- [ ] 4.1 In `createRunAction`, after resolving the agent name, call `loadConfigAgentEntry(process.cwd(), agentInput)` to retrieve the config entry
- [ ] 4.2 Derive effective `role` from: `--role` flag → config `role` → error if neither
- [ ] 4.3 Derive effective `mode` from: `--acp` / `--bash` / `--terminal` flags → config `mode` → default `"terminal"`
- [ ] 4.4 Derive effective `home` from: `--home` flag → config `home` → `undefined`
- [ ] 4.5 Expand `~` in effective `home` using `os.homedir()`; warn if the expanded path does not exist
- [ ] 4.6 Pass effective `home` through to `runAgent` / `runAgentInteractiveMode` / `runAgentAcpMode` via options

## 5. Apply Home Mount in Docker Compose Generation

- [ ] 5.1 Add optional `homeOverride?: string` parameter to `generateComposeYml` options
- [ ] 5.2 When `homeOverride` is set, add a volume entry `"<homeOverride>:/home/mason/"` to the agent service in the generated compose YAML
- [ ] 5.3 Pass `homeOverride` from `runAgentInteractiveMode` and `runProxyOnly` into `generateComposeYml`

## 6. Config Auto-Init

- [ ] 6.1 Create a `ensureMasonConfig(projectDir: string): void` helper (in CLI, not agent-sdk) that writes the default template to `.mason/config.json` if it does not exist, creating `.mason/` if needed, and prints the creation notice
- [ ] 6.2 Call `ensureMasonConfig` in `createRunAction` when an agent name is provided via `--agent` flag or positional shorthand (not when running role-only with no agent name)

## 7. Update RunAgentDeps and AcpMode

- [ ] 7.1 Add `homeOverride?: string` to `RunAgentDeps` / `runAgent` / `runAgentInteractiveMode` / `runAgentAcpMode` signatures for testability
- [ ] 7.2 Pass `homeOverride` into `AcpSession` compose generation if used in ACP mode

## 8. Tests

- [ ] 8.1 Unit tests for `loadConfigAgentEntry`: found, not found, absent file, invalid mode
- [ ] 8.2 Unit tests for `readConfigAgentNames`: normal, absent file, malformed JSON
- [ ] 8.3 Unit tests for `installAgentTypeShorthand` with config-declared agent names
- [ ] 8.4 Unit tests for `createRunAction`: `--agent` flag resolution, config defaults applied, `--role` override, `--terminal` override, `--home` override, auto-init trigger
- [ ] 8.5 Unit tests for `generateComposeYml` with `homeOverride` set
- [ ] 8.6 Unit tests for `ensureMasonConfig`: creates file when absent, skips when present
- [ ] 8.7 Verify TypeScript compiles with no errors: `npx tsc --noEmit`
- [ ] 8.8 Run existing test suite: `npx vitest run`
