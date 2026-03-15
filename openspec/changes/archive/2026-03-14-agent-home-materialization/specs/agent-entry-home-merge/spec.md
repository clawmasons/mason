## ADDED Requirements

### Requirement: agent-entry merges build-time home files before credential setup

The `bootstrap()` function SHALL call a `mergeHomeBuild()` step as the very first action, before proxy connection or credential retrieval. This function copies files from `/home/mason-from-build/` into `/home/mason/` (the now-mounted home directory).

#### Scenario: Build backup exists
- **WHEN** agent-entry starts and `/home/mason-from-build` exists
- **THEN** it SHALL copy all files from `/home/mason-from-build/` into `/home/mason/` without overwriting existing files

#### Scenario: Build backup does not exist
- **WHEN** agent-entry starts and `/home/mason-from-build` does not exist
- **THEN** it SHALL skip the merge step silently and proceed with the normal bootstrap flow

#### Scenario: Mounted files take precedence
- **WHEN** `/home/mason/` contains a file `config.json` (from the home mount) and `/home/mason-from-build/` also contains `config.json`
- **THEN** the mounted version in `/home/mason/config.json` SHALL NOT be overwritten

#### Scenario: OS files restored from backup
- **WHEN** `/home/mason-from-build/.bashrc` exists but `/home/mason/.bashrc` does not (because the mount overlay hid it)
- **THEN** `.bashrc` SHALL be copied from the backup into `/home/mason/`

#### Scenario: Merge happens before credential setup
- **WHEN** agent-entry runs the full bootstrap flow
- **THEN** `mergeHomeBuild()` SHALL complete before `connectToProxy()` is called
