## 1. Add config alias names to shorthand detection

- [x] 1.1 Import `readConfigAliasNames` from `@clawmasons/agent-sdk` in `commands/index.ts`
- [x] 1.2 Import `getKnownAgentTypeNames` from `./run-agent.js` in `commands/index.ts`
- [x] 1.3 Read config alias names in `registerCommands()` and pass to `installAgentTypeShorthand()`
- [x] 1.4 Update `installAgentTypeShorthand()` signature to accept `configAliasNames: Set<string>`
- [x] 1.5 Add `configAliasNames.has(arg)` to `isShorthandTarget()` predicate

## 2. Add error handling for unknown first arguments

- [x] 2.1 In `parseAsync` hook: when first arg is not a command and not a shorthand target, print error listing available commands, agents, and aliases, then exit(1)
- [x] 2.2 In `parse` hook: same error handling as parseAsync (keep hooks consistent)

## 3. Add unit tests

- [x] 3.1 Create `packages/cli/tests/cli/commands-index.test.ts`
- [x] 3.2 Test: known agent type triggers shorthand rewrite (claude)
- [x] 3.3 Test: config-declared alias name triggers shorthand rewrite (dev, review)
- [x] 3.4 Test: config-declared agent name triggers shorthand rewrite (custom-agent)
- [x] 3.5 Test: known command is not rewritten (run)
- [x] 3.6 Test: unknown argument produces error listing available options
- [x] 3.7 Test: error includes configured aliases
- [x] 3.8 Test: flags (starting with -) are not treated as unknown commands
- [x] 3.9 Test: parseAsync works for agent types and aliases
- [x] 3.10 Test: parseAsync produces error for unknown arguments
- [x] 3.11 Test: error lists all known agent types
- [x] 3.12 Test: error lists all known commands

## 4. Verification

- [x] 4.1 Run `npx tsc --noEmit` — compiles without errors
- [x] 4.2 Run `npx eslint` on changed files — no lint errors
- [x] 4.3 Run `npx vitest run packages/cli/tests/` — all 644 tests pass (34 test files)
