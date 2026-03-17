## 1. Add configure command

- [x] 1.1 Add `registerConfigureCommand` to `packages/cli/src/cli/commands/run-agent.ts` — mirrors `registerRunCommand` options minus `--role`, injects `role: "@clawmasons/role-configure-project"` before calling `createRunAction()`
- [x] 1.2 Register `registerConfigureCommand` in `packages/cli/src/cli/commands/index.ts` alongside `registerRunCommand`

## 2. Tests

- [x] 2.1 Add test in `packages/cli/tests/cli/cli.test.ts` asserting `configure` command is registered at top level
- [x] 2.2 Add test asserting `configure --help` does NOT include `--role` option
