# Tasks: Per-Member Directory Structure & Install Pipeline

## Implementation Tasks

### Task 1: Update install.ts for per-member directory structure
- [ ] Use `member.slug` for default output directory naming
- [ ] Add early return path for human members (create `log/` only)
- [ ] Rename `chapter-proxy/` to `proxy/` in all file paths
- [ ] Create `log/` directory for agent members after file write
- [ ] Update success message for human vs agent members

### Task 2: Update docker-compose.ts for proxy path
- [ ] Change `build: ./chapter-proxy` to `build: ./proxy`
- [ ] Change `./chapter-proxy/logs:/logs` to `./proxy/logs:/logs`

### Task 3: Update install tests
- [ ] Update all `chapter-proxy/` assertions to `proxy/`
- [ ] Add test: agent member install creates `log/` directory
- [ ] Add test: human member install creates only `log/`
- [ ] Add test: human member install does not create docker artifacts
- [ ] Add test: install uses member slug for directory name

### Task 4: Update docker-compose tests
- [ ] Update proxy build path assertions from `chapter-proxy` to `proxy`

### Task 5: Update specs
- [ ] Update `forge-install-command/spec.md` for per-member layout
- [ ] Update `docker-install-pipeline/spec.md` for proxy/ path
- [ ] Update `docker-compose-generation/spec.md` for proxy build path
- [ ] Update `run-command/spec.md` for .chapter/members/<slug>/ paths
- [ ] Update `stop-command/spec.md` for .chapter/members/<slug>/ paths
