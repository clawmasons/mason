# Tasks: forge build, list, and permissions Commands

## 1. Build Command

- [x] 1.1 Create `src/cli/commands/build.ts` with `registerBuildCommand()` and `runBuild()` — discovers packages, resolves agent, validates, generates lock file, writes to output path
- [x] 1.2 Support `--output <path>` option (default: `forge.lock.json` in cwd) and `--json` flag for structured output

## 2. List Command

- [x] 2.1 Create `src/cli/commands/list.ts` with `registerListCommand()` and `runList()` — discovers all packages, finds agents, resolves each, prints tree
- [x] 2.2 Implement tree formatter: agent → roles → tasks → apps/skills with indented tree characters
- [x] 2.3 Support `--json` flag for machine-readable output

## 3. Permissions Command

- [x] 3.1 Create `src/cli/commands/permissions.ts` with `registerPermissionsCommand()` and `runPermissions()` — resolves agent, formats per-role permission breakdown
- [x] 3.2 Display proxy-level toolFilter (union view) using `computeToolFilters()`
- [x] 3.3 Support `--json` flag for structured output

## 4. CLI Registration

- [x] 4.1 Update `src/cli/commands/index.ts` to import and register all three new commands

## 5. Tests

- [x] 5.1 Create `tests/cli/build.test.ts` — test command registration, lock file generation, output path handling, error cases
- [x] 5.2 Create `tests/cli/list.test.ts` — test tree output for single and multi-agent workspaces, empty workspace, json output
- [x] 5.3 Create `tests/cli/permissions.test.ts` — test per-role breakdown, toolFilter union output, agent not found error, json output
