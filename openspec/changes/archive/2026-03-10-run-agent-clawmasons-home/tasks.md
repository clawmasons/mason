# Tasks: `run-agent` CLAWMASONS_HOME & Auto-Init

## Implementation Tasks

- [x] 1. Update `RunAgentDeps` interface with new injectable dependencies
- [x] 2. Refactor `runAgent()` to read from `chapters.json` instead of project-local config
- [x] 3. Add auto-init logic: call `initRole()` when role not found in `chapters.json`
- [x] 4. Add `.gitignore` management using `ensureGitignoreEntry()`
- [x] 5. Update error messages to reference `init-role` instead of `run-init`
- [x] 6. Update `validateDockerfiles` error messages to reference `chapter build` instead of `chapter docker-init`

## Test Tasks

- [x] 7. Add test: reads role from `chapters.json` when initialized
- [x] 8. Add test: auto-invokes `init-role` when role not found
- [x] 9. Add test: creates per-project `.clawmasons/sessions/<id>/` for session state
- [x] 10. Add test: appends `.clawmasons` to project `.gitignore`
- [x] 11. Add test: uses `targetDir` from `chapters.json` when set
- [x] 12. Add test: mounts CWD as `/workspace` (existing behavior preserved)
- [x] 13. Update existing tests to work with new `chapters.json`-based flow
- [x] 14. Verify all existing run-agent tests still pass (974/974 tests pass)
