## Tasks

- [x] Create `packages/cli/src/acp/acp-agent.ts` with `createMasonAcpAgent(conn)` factory
- [x] Create `packages/cli/src/acp/acp-command.ts` with `registerAcpCommand(program)`
- [x] Modify `packages/cli/src/cli/commands/index.ts` to register the `acp` command
- [x] Create `packages/cli/tests/acp/acp-agent.test.ts` with unit tests
- [x] Update `packages/cli/tests/cli/cli.test.ts` — changed "does not have acp" to "has acp"
- [x] Verify TypeScript compilation (`npx tsc --noEmit`) — passes
- [x] Verify linting (`npx eslint`) — passes
- [x] Verify unit tests pass (551 tests, 33 files, 0 failures)
