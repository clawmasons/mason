## 1. Update test references

- [x] 1.1 In `tests/integration/forge-proxy.test.ts`: change `APP_NAME` from `"@example/app-filesystem"` to `"@clawmasons/app-filesystem"`
- [x] 1.2 In `tests/integration/mcp-proxy.sh`: rename `EXAMPLE_DIR` variable to `WORKSPACE_DIR`, point at `$PROJECT_ROOT/forge-core`
- [x] 1.3 In `tests/integration/mcp-proxy.sh`: change agent name from `@example/agent-note-taker` to `@clawmasons/agent-note-taker`
- [x] 1.4 In `tests/integration/mcp-proxy.sh`: update cleanup function to use `WORKSPACE_DIR`
- [x] 1.5 In `tests/integration/mcp-proxy.sh`: update comment referencing "example directory"

## 2. Update README.md

- [x] 2.1 Replace `@example/*` package names in CLI examples with `@clawmasons/*`
- [x] 2.2 Replace the "Example" section (pointing at `example/`) with a "Getting Started" section describing `forge init --template note-taker` and the `forge-core` component library

## 3. Delete example/ directory

- [x] 3.1 Delete the entire `example/` directory: `rm -rf example/`

## 4. Verify

- [x] 4.1 Run `grep -r 'example/' tests/ src/ README.md` and confirm no remaining references to the old directory (excluding generic uses of "example" like `.env.example` or `operator@example.com`)
- [x] 4.2 Run `npx tsc --noEmit` — no new type errors (pre-existing MockInstance type errors unchanged from base branch)
- [x] 4.3 Run `npx eslint src/ tests/` — no lint errors
- [x] 4.4 Run `npx vitest run` — all 550 tests pass
