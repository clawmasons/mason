## 1. Schema — Add type field to roleSchema

- [x] 1.1 Add `type: z.enum(["project", "supervisor"]).optional().default("project")` to `roleSchema` in `packages/shared/src/schemas/role-types.ts`
- [x] 1.2 Verify `Role` TypeScript type exposes `type: "project" | "supervisor"` (inferred automatically from zod)
- [x] 1.3 Add/update unit tests in `packages/shared` to cover valid values, default, and rejection of unknown values
- [x] 1.4 Extract `type` field from ROLE.md frontmatter in `packages/shared/src/role/parser.ts` and `package-reader.ts`

## 2. Materializer — Route supervisor files to home prefix

- [x] 2.1 Update `claude-code` materializer (`packages/claude-code/src/materializer.ts`) to detect `role.type === "supervisor"` and switch the output key prefix from project-workspace to home-relative (`.claude/` instead of going under `workspace/project/.claude/`)
- [x] 2.2 Ensure MCP server config for supervisor roles is written to the home-level `.claude.json` rather than project-local settings
- [x] 2.3 Update materializer unit tests to assert correct key prefixes for both `"project"` and `"supervisor"` roles

## 3. Docker Build Dir — Route supervisor build output to home/

- [x] 3.1 Update `generateRoleDockerBuildDir` in `packages/cli/src/materializer/docker-generator.ts` to write files with the home prefix to `{agentDir}/build/home/` rather than `{agentDir}/build/workspace/project/` when `role.type === "supervisor"`
- [x] 3.2 Add Docker compose volume mount for `{agentDir}/build/home/` → `/home/mason/` for supervisor roles
- [x] 3.3 Update docker-generator tests to assert correct build dir layout and volume mounts for supervisor roles

## 4. Dockerfile — Branch WORKDIR and devcontainer label on role.type

- [x] 4.1 Update `packages/cli/src/generator/agent-dockerfile.ts`: set `WORKDIR /home/mason/workspace` (instead of `/home/mason/workspace/project`) when `role.type === "supervisor"`
- [x] 4.2 Update `workspaceFolder` in the `devcontainer.metadata` label generation to use `/home/mason/workspace` for supervisor roles and `/home/mason/workspace/project` for project roles
- [x] 4.3 Update agent-dockerfile unit tests to cover both role types

## 5. CLI — Print role type in mason run summary

- [x] 5.1 Update `packages/cli/src/cli/commands/run-agent.ts`: include role type in the session summary printed lines (e.g. `Role: <name> (supervisor)`) when not in ACP mode
- [x] 5.2 Update run-agent tests to assert role type appears in summary output for both types

## 6. Verification

- [x] 6.1 Run `npx tsc --noEmit` across all packages — zero type errors (pre-existing unrelated error in package.test.ts excluded)
- [x] 6.2 Run `npx eslint src/ tests/` across affected packages — zero lint errors on changed files (pre-existing homeOverride warning in run-agent.ts excluded)
- [x] 6.3 Run `npx vitest run` across affected packages — all 1337 tests pass
- [ ] 6.4 Manual smoke test: create a role with `type: supervisor`, run `mason run`, confirm WORKDIR is `/home/mason/workspace` and role summary shows `(supervisor)`

## 7. SDK-Driven Supervisor File Routing (post-implementation fix)

- [x] 7.1 Add `materializeSupervisor?()` to `RuntimeMaterializer` in `packages/agent-sdk/src/types.ts`
- [x] 7.2 Fix `materializeWorkspace` skills path in `packages/claude-code/src/materializer.ts`: `skills/{name}/README.md` → `.claude/skills/{name}/SKILL.md`
- [x] 7.3 Implement `materializeSupervisor()` in claude-code materializer: skills at `.claude/skills/`, MCP servers merged into `.claude.json`, no `.mcp.json`
- [x] 7.4 Update `generateRoleDockerBuildDir` in docker-generator to dispatch to `materializeSupervisor` for supervisor roles with fully generic routing loop (zero agent-specific path knowledge)
- [x] 7.5 Update all affected tests — 693 tests pass
