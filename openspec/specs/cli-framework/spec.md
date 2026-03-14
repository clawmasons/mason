## Purpose

Commander.js-based CLI entry point for the chapter tool. Provides the executable binary, command routing, version/help display, and a modular command registration pattern that all chapter CLI commands plug into.

## Requirements

### Requirement: CLI entry point with Commander.js
The system SHALL provide a CLI executable registered as `mason` in package.json's `bin` field, powered by Commander.js with a program name of `mason`, a version matching package.json, and a description of "Mason — AI agent packaging, governance, and runtime orchestration".

#### Scenario: Display version
- **WHEN** the user runs `mason --version`
- **THEN** the CLI outputs the version from package.json (e.g., `0.1.0`)

#### Scenario: Display help
- **WHEN** the user runs `mason --help`
- **THEN** the CLI outputs usage information listing all registered commands

#### Scenario: Unknown command
- **WHEN** the user runs `mason nonexistent`
- **THEN** the CLI exits with a non-zero exit code and displays an error suggesting available commands

### Requirement: Command module registration
The system SHALL support registering commands as individual modules. Each command module exports a function that receives the Commander program instance and registers its command, options, and action handler.

#### Scenario: Init command is registered
- **WHEN** the CLI starts
- **THEN** the `init` command is available and appears in help output

#### Scenario: Install command is registered
- **WHEN** the CLI starts
- **THEN** the `install` command is available and appears in help output

#### Scenario: Enable command is registered
- **WHEN** the CLI starts
- **THEN** the `enable` command is available and appears in help output

#### Scenario: Disable command is registered
- **WHEN** the CLI starts
- **THEN** the `disable` command is available and appears in help output

#### Scenario: Command isolation
- **WHEN** a new command module is added to `src/cli/commands/`
- **THEN** it can be registered without modifying other command modules

### Requirement: Bin wrapper for npm global install
The system SHALL provide a `bin/mason.js` file with a Node.js shebang (`#!/usr/bin/env node`) that imports and runs the compiled CLI entry point. The package.json `bin` field SHALL map `"mason"` to this file.

#### Scenario: Global install execution
- **WHEN** the package is installed globally via `npm install -g`
- **THEN** running `mason` in a terminal invokes the CLI entry point

#### Scenario: npx execution
- **WHEN** a user runs `npx @clawmasons/mason init`
- **THEN** the CLI entry point is invoked with the `init` command
