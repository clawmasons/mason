## 1. Doctor Command Setup

- [x] 1.1 Create `packages/cli/src/cli/commands/doctor.ts` with `registerDoctorCommand(program)` and option definitions (`--quick`, `--auto`)
- [x] 1.2 Register the doctor command in `packages/cli/src/cli/commands/index.ts`

## 2. Resource Scanning

- [x] 2.1 Implement Docker availability check (reuse `checkDockerCompose` pattern)
- [x] 2.2 Implement stopped container detection — list stopped containers matching mason naming patterns via `docker ps`
- [x] 2.3 Implement dangling image detection via `docker images --filter dangling=true`
- [x] 2.4 Implement orphaned session directory detection — scan `.mason/sessions/` and check container status for each
- [x] 2.5 Implement full-mode-only scans: running containers, unused volumes, unused networks, build cache size, disk usage via `docker system df`

## 3. Cleanup Logic

- [x] 3.1 Implement stopped container removal via `docker rm`
- [x] 3.2 Implement dangling image prune via `docker image prune -f`
- [x] 3.3 Implement orphaned session directory removal (rm the directory)
- [x] 3.4 Implement full-mode cleanup: unused volume removal, unused network removal
- [x] 3.5 Implement confirmation prompt (skip when `--auto` is set)

## 4. Report & Output

- [x] 4.1 Implement scan report — categorized display of findings with counts/sizes
- [x] 4.2 Implement cleanup summary — report what was removed and space reclaimed
- [x] 4.3 Implement clean-system message when no issues found

## 5. Exported Quick Auto Cleanup

- [x] 5.1 Export `quickAutoCleanup(projectDir)` function that runs quick+auto mode silently (no output, no prompts)

## 6. Integration with mason run

- [x] 6.1 Import `quickAutoCleanup` in `run-agent.ts` and call it after Docker check, before session creation
- [x] 6.2 Wrap the call in try/catch so cleanup failures log a warning but don't block the run

## 7. Tests

- [x] 7.1 Add unit tests for doctor command: scan logic, cleanup logic, quick vs full mode, auto flag behavior
- [x] 7.2 Add unit tests for `quickAutoCleanup` function
- [x] 7.3 Verify existing run-agent tests still pass with the new cleanup integration
