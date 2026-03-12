# Tasks: Monorepo Generation

## Implementation Tasks

- [x] 1. Create monorepo generator module
  - Implement `generateMonorepo(role: RoleType, targetDir: string, projectDir: string): Promise<void>`
  - Generate root `package.json` with workspace configuration
  - Generate role sub-package with `package.json` (chapter.type = "role") and copied ROLE.md
  - Generate skill sub-packages for each skill dependency
  - Generate app sub-packages for each app dependency
  - Generate task sub-packages for each task dependency
  - Handle scope derivation from role metadata
  - Handle dependency name derivation (npm refs vs local paths)
  - Copy bundled resources from source role

- [x] 2. Create `mason init-repo` CLI command
  - Register `mason init-repo` command under the chapter command group
  - Accept `--role <name>` (required) and `--target-dir <path>` (optional)
  - Default target directory: `.clawmasons/repositories/<role-name>/`
  - Resolve the role via `resolveRole()` from discovery module
  - Validate that the role source is local (not a package)
  - Call `generateMonorepo()` with resolved role and target directory

- [x] 3. Write unit tests
  - Test: generate monorepo from mock role with all dependency types
  - Test: verify directory structure matches PRD §11.3
  - Test: verify root package.json has valid workspace config
  - Test: verify role package.json has chapter.type = "role"
  - Test: verify skill package.json has chapter.type = "skill"
  - Test: verify task package.json has chapter.type = "task"
  - Test: verify app package.json has chapter.type = "app"
  - Test: verify ROLE.md is copied to role package
  - Test: verify scope derivation from role metadata
  - Test: verify default target directory is used when --target-dir not specified
  - Test: verify error when role not found
  - Test: verify error when role is from a package (not local)

- [x] 4. Register command in CLI index
  - Import and register `mason init-repo` in `packages/cli/src/cli/commands/index.ts`

- [x] 5. Verify compilation and all tests pass
  - Run `npx tsc --noEmit`
  - Run `npx vitest run`
  - Run `npx eslint packages/cli/src/ packages/cli/tests/`
