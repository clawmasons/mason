## ADDED Requirements

### Requirement: CLI registration for forge add
The `forge add` command SHALL be registered as a Commander.js command with a required `<pkg>` argument and optional variadic `[npmArgs...]` for forwarding to npm.

#### Scenario: Command is registered
- **WHEN** the CLI program is initialized
- **THEN** a command named "add" SHALL be available with description containing "Add"
- **AND** it SHALL accept a required argument named "pkg"

### Requirement: npm install delegation
The `forge add` command SHALL delegate package installation to npm by executing `npm install <pkg> [npmArgs...]` in the workspace root directory using `child_process.execFileSync`.

#### Scenario: Successful npm install
- **WHEN** `forge add @clawforge/app-github` is run in a valid workspace
- **THEN** the command SHALL execute `npm install @clawforge/app-github` with `stdio: "inherit"`
- **AND** npm output SHALL stream directly to the terminal

#### Scenario: npm install with extra flags
- **WHEN** `forge add @clawforge/app-github --save-dev --legacy-peer-deps` is run
- **THEN** the command SHALL execute `npm install @clawforge/app-github --save-dev --legacy-peer-deps`

#### Scenario: npm install failure
- **WHEN** npm install fails (non-zero exit code)
- **THEN** the command SHALL exit with code 1
- **AND** SHALL print an error message containing "Add failed"

### Requirement: Post-install forge field validation
After successful npm install, the command SHALL read the installed package's `package.json` and validate its `forge` field using `parseForgeField()`.

#### Scenario: Valid forge package
- **WHEN** npm install succeeds and the package has a valid `forge` field
- **THEN** the command SHALL print a success message containing the package name and its forge type
- **AND** SHALL exit with code 0

#### Scenario: Package missing forge field
- **WHEN** npm install succeeds but the package has no `forge` field
- **THEN** the command SHALL run `npm uninstall <pkg>` to clean up
- **AND** SHALL print an error message indicating the package is not a valid forge package
- **AND** SHALL exit with code 1

#### Scenario: Package with invalid forge field
- **WHEN** npm install succeeds but the package's `forge` field fails Zod validation
- **THEN** the command SHALL run `npm uninstall <pkg>` to clean up
- **AND** SHALL print an error message with the validation error details
- **AND** SHALL exit with code 1

### Requirement: Package location resolution
The command SHALL resolve the installed package location by checking `node_modules/<pkg>/package.json` (handling both scoped and unscoped packages).

#### Scenario: Scoped package resolution
- **WHEN** `forge add @clawforge/app-github` is run
- **THEN** the command SHALL look for the package at `node_modules/@clawforge/app-github/package.json`

#### Scenario: Unscoped package resolution
- **WHEN** `forge add my-app` is run
- **THEN** the command SHALL look for the package at `node_modules/my-app/package.json`
