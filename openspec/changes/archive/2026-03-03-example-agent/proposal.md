## Why

FORGE lacks a working example that users can reference to understand the packaging system. Users need a self-contained directory they can copy, inspect, and run `forge install` against — demonstrating all 5 component types (app, skill, task, role, agent) and the "install from files" workflow without npm registry involvement.

## What Changes

- **New `example/` directory** at the project root containing a complete "note-taker" agent workspace. Uses the MCP filesystem server (no external API keys needed), making it runnable from a cold start.
- **All 5 component types represented**: one app (filesystem MCP server, stdio), one skill (markdown conventions with SKILL.md artifact), one task (subagent with prompt), one role (permission boundary for filesystem tools), one agent (claude-code runtime).
- **Root workspace `package.json`** with standard `workspaces` config pointing at `apps/*`, `tasks/*`, `skills/*`, `roles/*`, `agents/*`.
- **README.md** with component hierarchy overview, quick start commands, directory structure, and explanation of what `forge install` generates.

## Capabilities

### New Capabilities
- `example-workspace`: A self-contained example workspace demonstrating all FORGE component types with a note-taker agent theme

### Modified Capabilities

_(none)_

## Impact

- **New directory**: `example/` with 9 files (5 `package.json`, 1 `SKILL.md`, 1 prompt, 1 `README.md`, 1 root `package.json`)
- **No source code changes**: This is purely additive — no modifications to existing `src/` or `tests/` files
- **Validation**: The example must pass all 4 validation checks in `forge validate`
