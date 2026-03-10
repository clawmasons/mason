## Purpose

Implement the `clawmasons init` command that creates a lodge directory structure with CHARTER.md and registers the lodge in config.json. This replaces the placeholder `init` command with a fully functional lodge initialization flow.

## Requirements

### Requirement: Resolve lodge variables from CLI flags, env vars, and defaults

The system SHALL resolve `CLAWMASONS_HOME`, `LODGE`, and `LODGE_HOME` using the following priority chain:

| Variable | CLI Flag | Env Var | Default |
|---|---|---|---|
| Clawmasons home | `--home` | `CLAWMASONS_HOME` | `~/.clawmasons` |
| Lodge name | `--lodge` | `LODGE` | `$USER` or `"anonymous"` |
| Lodge home | `--lodge-home` | `LODGE_HOME` | `$CLAWMASONS_HOME/$LODGE` |

#### Scenario: CLI flags override env vars
- **GIVEN** `LODGE=envlodge` is set in the environment
- **WHEN** the user runs `clawmasons init --lodge cliflag`
- **THEN** the lodge name is `cliflag`

#### Scenario: Env var used when no CLI flag
- **GIVEN** `LODGE=myproject` is set
- **WHEN** the user runs `clawmasons init`
- **THEN** the lodge name is `myproject`

#### Scenario: Default to $USER when no flag or env var
- **GIVEN** neither `--lodge` nor `LODGE` is set
- **WHEN** the user runs `clawmasons init`
- **THEN** the lodge name defaults to `$USER` (or `"anonymous"` if `$USER` is unset)

### Requirement: Create CLAWMASONS_HOME and config.json

The system SHALL create the `CLAWMASONS_HOME` directory and an empty `config.json` (`{}`) if they do not exist.

#### Scenario: Fresh system with no CLAWMASONS_HOME
- **WHEN** `clawmasons init --lodge test` is run and `~/.clawmasons` does not exist
- **THEN** `~/.clawmasons/` is created
- **AND** `~/.clawmasons/config.json` is created with `{}`

### Requirement: Create lodge directory structure

The system SHALL create `LODGE_HOME/` with a `chapters/` subdirectory.

#### Scenario: Lodge directory created
- **WHEN** `clawmasons init --lodge acme` is run
- **THEN** `~/.clawmasons/acme/` exists
- **AND** `~/.clawmasons/acme/chapters/` exists

### Requirement: Copy CHARTER.md template

The system SHALL copy `packages/cli/templates/charter/CHARTER.md` to `LODGE_HOME/CHARTER.md`. It SHALL NOT overwrite an existing CHARTER.md.

#### Scenario: CHARTER.md created on fresh init
- **WHEN** `clawmasons init --lodge acme` is run for the first time
- **THEN** `~/.clawmasons/acme/CHARTER.md` exists with template content

#### Scenario: Existing CHARTER.md is preserved
- **GIVEN** `~/.clawmasons/acme/CHARTER.md` already exists with custom content
- **WHEN** `clawmasons init --lodge acme` is run
- **THEN** the existing CHARTER.md is NOT overwritten

### Requirement: Register lodge in config.json

The system SHALL add/update an entry in `CLAWMASONS_HOME/config.json` mapping the lodge name to its home directory: `{ "<lodge>": { "home": "<LODGE_HOME>" } }`.

#### Scenario: Lodge registered in config.json
- **WHEN** `clawmasons init --lodge acme` is run
- **THEN** `config.json` contains `{ "acme": { "home": "~/.clawmasons/acme" } }`

#### Scenario: Custom lodge-home registered
- **WHEN** `clawmasons init --lodge acme --lodge-home /projects/acme` is run
- **THEN** `config.json` contains `{ "acme": { "home": "/projects/acme" } }`

### Requirement: Idempotent operation

The system SHALL skip initialization if the lodge already exists in config.json AND the `LODGE_HOME/chapters/` directory exists. This is not an error.

#### Scenario: Already initialized lodge is skipped
- **GIVEN** lodge `acme` is registered in config.json and `chapters/` exists
- **WHEN** `clawmasons init --lodge acme` is run
- **THEN** the command prints a skip message and exits successfully without modifying files

### Requirement: Print summary on success

The system SHALL print a summary including the lodge name, path, and next steps.

#### Scenario: Success output
- **WHEN** `clawmasons init --lodge acme` completes
- **THEN** output includes "Lodge 'acme' initialized at <path>"
- **AND** output includes next steps referencing `clawmasons acp`

### Requirement: CHARTER.md template exists

A CHARTER.md template SHALL exist at `packages/cli/templates/charter/CHARTER.md` containing governance rules for agents: least privilege, no exfiltration, destructive action approval, transparency, containment, credential handling, and audit trail.

### Requirement: Lodge config helpers in home.ts

The `packages/cli/src/runtime/home.ts` module SHALL export helpers for reading and writing config.json (the lodge registry), and for resolving lodge variables.

## Files

- **New:** `packages/cli/src/cli/commands/lodge-init.ts` — Command implementation
- **New:** `packages/cli/templates/charter/CHARTER.md` — CHARTER.md template
- **New:** `packages/cli/tests/cli/lodge-init.test.ts` — Unit tests
- **Modified:** `packages/cli/src/runtime/home.ts` — config.json lodge registry helpers
- **Modified:** `packages/cli/tests/runtime/home.test.ts` — Tests for new helpers
- **Modified:** `packages/cli/src/cli/commands/index.ts` — Replace placeholder init with real command
