# Spec: run-command-initial-prompt

## Purpose

Defines how `mason run` accepts positional arguments as an initial prompt passed to the agent at launch, enabling one-liner task invocations like `mason run --agent claude "do this task"`.

## Requirements

### Requirement: run command accepts positional args as initial prompt

The `run` command SHALL accept positional arguments that are not the agent name as an initial prompt string. When `--agent` is provided as a flag, all positional arguments SHALL be treated as the initial prompt. When agent is specified positionally (first arg resolves to a known agent type), any additional positional arguments SHALL be treated as the initial prompt. Multiple positional args SHALL be joined with a single space.

The resolved initial prompt SHALL be passed to the materializer so it can be threaded to the agent launch via `agent-launch.json`.

#### Scenario: Prompt with --agent flag

- **WHEN** `mason run --agent claude --role @role "do this task"` is executed
- **THEN** the resolved initial prompt SHALL be `"do this task"`
- **AND** it SHALL be forwarded to the materializer as the initial prompt

#### Scenario: Prompt with positional agent

- **WHEN** `mason run claude --role @role "do this task"` is executed
- **AND** `"claude"` resolves to a known agent type
- **THEN** the resolved initial prompt SHALL be `"do this task"`
- **AND** it SHALL be forwarded to the materializer as the initial prompt

#### Scenario: Multi-word prompt joined

- **WHEN** `mason run --agent claude --role @role "do this" "and that"` is executed
- **THEN** the resolved initial prompt SHALL be `"do this and that"`

#### Scenario: No prompt — no change to existing behavior

- **WHEN** `mason run --agent claude --role @role` is executed with no positional args
- **THEN** the initial prompt SHALL be `undefined`
- **AND** behavior SHALL be identical to the current implementation

#### Scenario: Prompt not forwarded in ACP mode

- **WHEN** `mason run --agent claude --role @role --acp "do this"` is executed
- **THEN** the initial prompt SHALL NOT be forwarded to the materializer
- **AND** ACP mode SHALL proceed as normal
