# pack-command Specification

## Purpose
TBD - created by archiving change add-pack-command. Update Purpose after archive.
## Requirements
### Requirement: Pack command is registered in CLI

The `chapter pack` command SHALL be registered as a top-level CLI command with the description "Build and pack all workspace packages into dist/".

#### Scenario: Command is available
- **WHEN** user runs `chapter --help`
- **THEN** the output includes `pack` with description "Build and pack all workspace packages into dist/"

### Requirement: Pack command cleans existing tgz files

The pack command SHALL remove all existing `.tgz` files from `dist/` before packing to prevent stale artifacts. The `dist/` directory SHALL be created if it does not exist.

#### Scenario: Clean dist before packing
- **GIVEN** `dist/` contains `old-package-1.0.0.tgz`
- **WHEN** `chapter pack` is run
- **THEN** `old-package-1.0.0.tgz` is removed before new tarballs are created

#### Scenario: Create dist if missing
- **GIVEN** no `dist/` directory exists
- **WHEN** `chapter pack` is run
- **THEN** `dist/` is created and populated with `.tgz` files

### Requirement: Pack command builds before packing

The pack command SHALL run the project build (`npm run build`) before packing to ensure tarballs contain compiled output.

#### Scenario: Build runs first
- **WHEN** `chapter pack` is run
- **THEN** `npm run build` executes before any `npm pack` commands

#### Scenario: Build failure aborts packing
- **GIVEN** the build fails (e.g., TypeScript compilation error)
- **WHEN** `chapter pack` is run
- **THEN** the command exits with an error and no `.tgz` files are created

### Requirement: Pack command packs all workspace packages

The pack command SHALL discover all workspace packages by reading `packages/*/package.json` and run `npm pack` for each with `--pack-destination dist/`.

#### Scenario: All packages packed
- **GIVEN** workspace packages `@clawmasons/shared`, `@clawmasons/proxy`, and `@clawmasons/chapter`
- **WHEN** `chapter pack` is run successfully
- **THEN** `dist/` contains one `.tgz` file per workspace package (3 total)

#### Scenario: Dynamic package discovery
- **GIVEN** a new package is added at `packages/new-pkg/package.json`
- **WHEN** `chapter pack` is run
- **THEN** the new package is included in the pack output

### Requirement: Pack command reports progress

The pack command SHALL log each step: cleaning, building, and packing each package.

#### Scenario: Progress output
- **WHEN** `chapter pack` is run successfully
- **THEN** output includes messages for cleaning dist/, building, and packing each workspace package
- **AND** a final summary line showing the number of `.tgz` files created

### Requirement: Pack command runs from project root

The pack command SHALL detect the chapter project root (directory containing `.clawmasons/chapter.json`) and operate relative to it, or use the current working directory if it contains a `package.json` with workspaces.

#### Scenario: Run from project root
- **GIVEN** user is in the chapter project root directory
- **WHEN** `chapter pack` is run
- **THEN** the command succeeds and packs all workspace packages

#### Scenario: No package.json found
- **GIVEN** user is in a directory without `package.json`
- **WHEN** `chapter pack` is run
- **THEN** the command exits with error "No package.json found at project root"

