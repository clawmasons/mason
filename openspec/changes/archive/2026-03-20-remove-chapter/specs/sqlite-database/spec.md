## MODIFIED Requirements

### Requirement: Open database with WAL mode and auto-schema
The system SHALL open (or create) a SQLite database at the specified path (default `~/.${CLI_NAME_LOWERCASE}/data/${CLI_NAME_LOWERCASE}.db`, currently `~/.mason/data/mason.db`), enable WAL journal mode, and create the `audit_log` and `approval_requests` tables if they do not exist. The default path SHALL be overridable via the `${CLI_NAME_UPPERCASE}_DB_PATH` environment variable (currently `MASON_DB_PATH`).

#### Scenario: First-time database creation
- **WHEN** `openDatabase()` is called and `~/.mason/data/mason.db` does not exist
- **THEN** the file is created, WAL mode is enabled, and both `audit_log` and `approval_requests` tables exist

#### Scenario: Existing database
- **WHEN** `openDatabase()` is called and the database already exists with both tables
- **THEN** the database is opened, WAL mode is re-enabled, and tables are unchanged (CREATE IF NOT EXISTS)

#### Scenario: Custom database path via environment variable
- **WHEN** `MASON_DB_PATH` is set to `/tmp/test.db` and `openDatabase()` is called
- **THEN** the database is opened at `/tmp/test.db`

#### Scenario: In-memory database
- **WHEN** `openDatabase(":memory:")` is called
- **THEN** an in-memory database is created with WAL mode and both tables
