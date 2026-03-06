## MODIFIED Requirements

### Requirement: Bin wrapper for npm global install

The package SHALL expose a `forge` binary via the `bin` field in package.json so that `npx @clawmasons/forge` works.

#### Scenario: npx execution

- **WHEN** a user runs `npx @clawmasons/forge init`
- **THEN** the CLI SHALL launch and execute the `init` command
