## MODIFIED Requirements

### Requirement: Credential audit database path uses CLI name
The credential service audit module SHALL use `~/.${CLI_NAME_LOWERCASE}/data/${CLI_NAME_LOWERCASE}.db` (currently `~/.mason/data/mason.db`) as the default database path. The `CREDENTIAL_DB_PATH` environment variable SHALL remain unchanged (it is credential-service-specific, not CLI-name-prefixed).

#### Scenario: Default audit database path uses CLI name
- **WHEN** the credential service opens its audit database without an explicit path
- **THEN** it SHALL use `~/.mason/data/mason.db` as the default path
- **AND** the path SHALL be constructed using `CLI_NAME_LOWERCASE` from `@clawmasons/shared`
