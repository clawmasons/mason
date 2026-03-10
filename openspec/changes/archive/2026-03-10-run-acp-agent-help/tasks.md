# Tasks: `run-acp-agent` Help Instructions

**Date:** 2026-03-10
**PRD:** acp-session-cwd
**Change:** #9

## Tasks

- [x] Define help epilog string constant in `run-acp-agent.ts`
- [x] Add `.addHelpText("after", ...)` to command registration
- [x] Add test: help output contains CWD/session behavior explanation
- [x] Add test: help output contains `.clawmasons/` creation notice
- [x] Add test: help output contains `.gitignore` notice
- [x] Add test: help output contains `CLAWMASONS_HOME` documentation
- [x] Add test: help output contains ACP client configuration example
- [x] Run type check (`npx tsc --noEmit`)
- [x] Run linter (`npx eslint src/ tests/`)
- [x] Run tests (`npx vitest run`)
