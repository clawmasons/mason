## ADDED Requirements

### Requirement: Package command resolves role from canonical location
The `mason package --role <name>` command SHALL resolve the role exclusively from `.mason/roles/<name>/ROLE.md`. It SHALL fail with a descriptive error if the file does not exist at that path.

#### Scenario: Role found at canonical location
- **WHEN** `mason package --role my-role` is executed
- **AND** `.mason/roles/my-role/ROLE.md` exists and is valid
- **THEN** the command proceeds to assemble the build directory

#### Scenario: Role not found
- **WHEN** `mason package --role my-role` is executed
- **AND** `.mason/roles/my-role/ROLE.md` does not exist
- **THEN** the command exits with a non-zero code
- **AND** the error message SHALL reference `.mason/roles/my-role/ROLE.md` as the expected location

### Requirement: Package command creates build directory structure
The command SHALL create `.mason/roles/<name>/build/` containing a self-contained npm package with the following layout:

```
.mason/roles/<name>/build/
  package.json    # required: chapter.type "role", files list
  ROLE.md         # copied from source
  tasks/          # task files resolved from sources
  skills/         # skill files resolved from sources
  apps/           # app files resolved from sources
```

#### Scenario: Build directory created with ROLE.md
- **WHEN** the command assembles a role with no tasks, skills, or apps
- **THEN** `.mason/roles/<name>/build/ROLE.md` SHALL exist as a copy of the source ROLE.md
- **AND** `.mason/roles/<name>/build/package.json` SHALL exist with `chapter.type === "role"`

#### Scenario: Build directory includes resolved task files
- **WHEN** the role references a task named `create-prd`
- **AND** `sources` includes `.claude/` which maps tasks to `.claude/commands/create-prd.md`
- **THEN** the file SHALL be copied to `.mason/roles/<name>/build/tasks/create-prd.md`

#### Scenario: Build directory includes resolved skill files
- **WHEN** the role references a skill named `prd-writing`
- **AND** `sources` includes `.claude/` which maps skills to `.claude/skills/prd-writing.md`
- **THEN** the file SHALL be copied to `.mason/roles/<name>/build/skills/prd-writing.md`

### Requirement: Package command fails on missing task, skill, or app references
The command SHALL validate that every task, skill, and app referenced in ROLE.md can be resolved from the `sources` directories before writing any build output. If any reference cannot be resolved, the command SHALL exit with a non-zero code, report all unresolved references together, and leave the build directory unchanged.

#### Scenario: Single missing task reference
- **WHEN** the role references a task `fix-bug`
- **AND** the task cannot be found in any `sources` directory
- **THEN** the command exits with a non-zero code
- **AND** the error output SHALL identify `fix-bug` as unresolved

#### Scenario: Multiple missing references reported together
- **WHEN** two tasks and one skill cannot be resolved
- **THEN** all three unresolved references SHALL be reported in a single error output
- **AND** no files SHALL be written to the build directory

### Requirement: Package command resolves sources using dialect-aware scanning
When scanning a `sources` entry that corresponds to a known agent directory (e.g., `.claude/`), the command SHALL use the dialect registry to determine the appropriate subdirectory for each resource type:
- **tasks**: the dialect's task subdirectory (e.g., `.claude/commands/` for Claude, `.codex/instructions/` for Codex)
- **skills**: the dialect's skills subdirectory (e.g., `.claude/skills/`)
- **apps**: the dialect's app configuration file or directory (e.g., `.claude/mcp.json` for MCP server configs)

#### Scenario: Claude dialect source resolves tasks from commands directory
- **WHEN** `sources` includes `.claude/`
- **AND** a task named `create-prd` is referenced
- **THEN** the command SHALL look for the task file in `.claude/commands/`

#### Scenario: Codex dialect source resolves tasks from instructions directory
- **WHEN** `sources` includes `.codex/`
- **AND** a task named `create-prd` is referenced
- **THEN** the command SHALL look for the task file in `.codex/instructions/`

#### Scenario: Unknown directory scanned with generic fallback
- **WHEN** `sources` includes a directory that does not match any registered dialect
- **THEN** the command SHALL scan the directory directly for matching files by name

### Requirement: Package command merges user-supplied package.json
If `.mason/roles/<name>/package.json` exists, the command SHALL merge its content with the generated fields (`chapter` and `files`). Generated fields SHALL take precedence. If no such file exists, the command SHALL generate `package.json` from scratch using the role's `name`, `version`, and `description` from ROLE.md metadata.

#### Scenario: User-supplied package.json merged
- **WHEN** `.mason/roles/my-role/package.json` exists with `devDependencies` and a `build` script
- **THEN** the generated `build/package.json` SHALL include those `devDependencies` and the `build` script
- **AND** `chapter.type` SHALL be `"role"` regardless of what the user-supplied file specifies

#### Scenario: Generated package.json from scratch
- **WHEN** no `.mason/roles/my-role/package.json` exists
- **THEN** `build/package.json` SHALL be generated with `name`, `version`, `description` from the ROLE.md metadata
- **AND** `chapter.type` SHALL be `"role"`
- **AND** `files` SHALL list all files in the build directory

### Requirement: Package command runs npm lifecycle after assembly
After assembling the build directory, the command SHALL run the following in sequence inside the build directory:
1. `npm install` — install any devDependencies listed in `package.json`
2. `npm run build` — only if a `"build"` script is defined in `package.json`
3. `npm pack` — produce a `.tgz` file in the build directory

Each step SHALL be run as a child process. If any step exits with a non-zero code, the command SHALL stop and report the failure.

#### Scenario: npm pack produces a .tgz file
- **WHEN** `npm install` and `npm pack` succeed (no build script defined)
- **THEN** a `.tgz` file SHALL exist in `.mason/roles/<name>/build/`
- **AND** the command SHALL print the path to the `.tgz` file

#### Scenario: npm run build executed when script is defined
- **WHEN** `build/package.json` defines a `"build"` script
- **THEN** `npm run build` SHALL be executed before `npm pack`

#### Scenario: npm step failure halts command
- **WHEN** `npm install` exits with a non-zero code
- **THEN** `npm run build` and `npm pack` SHALL NOT be executed
- **AND** the command SHALL exit with a non-zero code

### Requirement: mason add, mason pack, and mason init-repo commands removed
The `mason add`, `mason pack` (chapter subcommand), and `mason mason init-repo` commands SHALL be removed from the CLI. The CLI SHALL exit with a "command not found" error if any of these are invoked.

#### Scenario: mason add is not found
- **WHEN** `mason chapter add <pkg>` is executed
- **THEN** the CLI SHALL report an unknown command error

#### Scenario: mason pack is not found
- **WHEN** `mason chapter pack` is executed
- **THEN** the CLI SHALL report an unknown command error

#### Scenario: mason init-repo is not found
- **WHEN** `mason mason init-repo --role my-role` is executed
- **THEN** the CLI SHALL report an unknown command error
