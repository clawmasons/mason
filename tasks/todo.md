# Change #6: Per-Member Directory Structure & Install Pipeline

## Plan

### What this change does
Update `chapter install` to scaffold per-member directories under `.chapter/members/<slug>/` with:
- `log/` directory for all members
- `proxy/` directory for agent members (replaces `chapter-proxy/` at install root)
- `<runtime>/` directories for agent members (same as now but using slug)
- Human members get only `log/` (no docker artifacts)

### Key decisions
1. Use `member.slug` (from the member schema) for directory naming instead of `getAppShortName(member.name)` -- this is more correct per the PRD
2. Agent member install still generates all docker artifacts (compose, env, lock, proxy, runtime)
3. Human member install is a new path: just scaffolds `log/` directory, no docker artifacts
4. `resolveMemberDir()` should use slug when available, fall back to short name for backward compat
5. Run/stop commands continue to work by resolving to the per-member directory

### Tasks
- [x] Step 1 (NEW): Create the openspec change proposal
- [x] Step 2 (FF): Flesh out the spec with design details
- [x] Step 3 (APPLY): Implement the code changes
- [x] Step 4 (TEST): Run all tests and fix regressions
- [x] Step 5 (VERIFY): Verify requirements and best practices
- [x] Step 6 (SYNC): Sync spec with implementation
- [x] Step 7 (ARCHIVE): Archive the completed spec
- [x] Step 8 (UPDATE): Update IMPLEMENTATION.md with links
