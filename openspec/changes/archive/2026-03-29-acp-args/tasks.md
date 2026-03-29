## 1. Pinned Args State Management

- [x] 1.1 Add `PinnedArgs` interface and module-level state (`pinnedArgs`, `setPinnedArgs`, `getPinnedArgs`, `clearPinnedArgs`) to `acp-agent.ts`
- [x] 1.2 Add unit tests for `setPinnedArgs`, `getPinnedArgs`, `clearPinnedArgs`

## 2. CLI Command Options

- [x] 2.1 Add `--agent <name>`, `--role <name>`, `--source <path>` options to `mason acp` command in `acp-command.ts`
- [x] 2.2 Call `setPinnedArgs()` from the command action with parsed options, resolving `--source` to absolute path via `path.resolve(process.cwd(), source)`

## 3. Config Options Filtering

- [x] 3.1 Modify `buildConfigOptions()` to accept optional `pinnedArgs` parameter and exclude config options whose `id` matches a pinned field
- [x] 3.2 Update all `buildConfigOptions()` call sites (`newSession`, `loadSession`, `setSessionConfigOption`) to pass `getPinnedArgs()`
- [x] 3.3 Add unit tests verifying config options are filtered when agent/role are pinned

## 4. Session Creation with Pinned Overrides

- [x] 4.1 In `newSession`, use `pinnedArgs.agent` and `pinnedArgs.role` as overrides for `defaultAgent` and `defaultRole` when set
- [x] 4.2 In `loadSession`, use pinned values to override stored session agent/role
- [x] 4.3 Store pinned source in `SessionState` so prompt executor can access it

## 5. setSessionConfigOption Guard

- [x] 5.1 Add guard in `setSessionConfigOption` to reject changes to pinned fields with `RequestError.invalidParams` containing "pinned"
- [x] 5.2 Add unit test verifying pinned fields are rejected and non-pinned fields still work

## 6. Prompt Executor Source Passthrough

- [x] 6.1 Add optional `source?: string` field to `ExecutePromptStreamingOptions` and `ExecutePromptOptions`
- [x] 6.2 Append `--source <path>` to `mason run` args when source is provided (both new and resume paths)
- [x] 6.3 Pass `source` from `SessionState` into `executePromptStreaming()` call in the `prompt` handler
- [x] 6.4 Add unit tests for source arg inclusion in subprocess args

## 7. Verification

- [x] 7.1 Run `npx tsc --noEmit` — no type errors
- [x] 7.2 Run `npx eslint src/ tests/` in `packages/cli` — no lint errors
- [x] 7.3 Run `npx vitest run packages/cli/tests/` — all tests pass
