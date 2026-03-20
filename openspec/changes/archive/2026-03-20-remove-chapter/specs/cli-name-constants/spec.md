## ADDED Requirements

### Requirement: Shared CLI name constants exported from @clawmasons/shared

The `@clawmasons/shared` package SHALL export three string constants from `src/constants.ts`:
- `CLI_NAME_LOWERCASE` with value `"mason"`
- `CLI_NAME_DISPLAY` with value `"Mason"`
- `CLI_NAME_UPPERCASE` with value `"MASON"`

These constants SHALL be the single source of truth for the product name across all packages.

#### Scenario: Constants are importable from shared
- **WHEN** a consumer imports `{ CLI_NAME_LOWERCASE, CLI_NAME_DISPLAY, CLI_NAME_UPPERCASE }` from `@clawmasons/shared`
- **THEN** the values SHALL be `"mason"`, `"Mason"`, and `"MASON"` respectively

#### Scenario: Constants are used for runtime paths
- **WHEN** any package constructs a dotfile directory path (e.g., workspace config dir)
- **THEN** it SHALL use `` `.${CLI_NAME_LOWERCASE}/` `` instead of hardcoding a product name

#### Scenario: Constants are used for environment variable prefixes
- **WHEN** any package reads or writes environment variables with a product prefix
- **THEN** it SHALL use `` `${CLI_NAME_UPPERCASE}_` `` as the prefix instead of hardcoding
