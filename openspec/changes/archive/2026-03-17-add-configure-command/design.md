## Context

The `run` command requires `--role <name>` to be specified explicitly. The `configure-project` supervisor role is a built-in workflow for setting up any project for mason. Making users type `--role @clawmasons/role-configure-project` creates friction for the most common onboarding action.

The CLI already has `run` registered in `packages/cli/src/cli/commands/run-agent.ts`. The `configure` command will reuse the same action handler with the role hardcoded.

## Goals / Non-Goals

**Goals:**
- Add `mason configure` as a thin alias for `mason run --role @clawmasons/role-configure-project`
- Accept all options that `run` accepts except `--role`
- Minimal new code — delegate entirely to the existing `run` action

**Non-Goals:**
- Supporting a configurable "default role" via config — just hardcode configure-project
- Changing the run command or its options
- Adding `configure` as a subcommand of a group — it is top-level like `run`

## Decisions

**Hardcode the role name as `@clawmasons/role-configure-project`**
- Rationale: The configure-project role will be published as an npm package under this name. Using the package reference (not the bare name) ensures it works without a local `.mason/roles/configure-project/` directory.
- Alternative: bare name `configure-project` — rejected because it requires the role to be installed locally or in node_modules of the project.

**Reuse `createRunAction()` directly**
- The `run` command's action factory already accepts `role` as an option derived from `options.role`. The `configure` command registers the same options minus `--role` and injects `role: "@clawmasons/role-configure-project"` into the resolved options before calling the action.
- Alternative: Copy the full `run` action — rejected, creates duplication and drift.

**Omit `--role` from `configure`'s option list**
- If a user passes `--role` to `configure`, Commander will print an unknown option error — appropriate behavior since the point of `configure` is to fix the role.

## Risks / Trade-offs

- [Risk] Package name `@clawmasons/role-configure-project` must be published and installable → Mitigation: Falls back naturally to local role discovery if the package is not installed; error message from role resolution explains what to install.
- [Risk] Future changes to `run` options require manual sync to `configure` → Mitigation: Keep option definitions in a shared constant or export them from `run-agent.ts` so `configure` imports them.

## Open Questions

- None — scope is clear and implementation is straightforward.
