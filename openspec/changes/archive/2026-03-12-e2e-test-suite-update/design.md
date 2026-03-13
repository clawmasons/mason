# Design: End-to-End Test Suite Update

**Change:** #12
**Proposal:** [proposal.md](./proposal.md)

## Architecture

The e2e tests use subprocess execution via `chapterExec()` to invoke real CLI commands against temporary workspace directories created from fixtures. Docker tests build and run real containers.

### Test Categories

1. **Role Workflow Tests** (`role-workflow.test.ts`)
   - Create a workspace with `.claude/roles/test-writer/ROLE.md` local role
   - Run `chapter list --json` -- verify local roles are discovered
   - Run `chapter validate <role-name>` -- verify validation passes
   - Run `chapter build` -- verify Docker artifacts are generated for the role

2. **Cross-Agent Materialization** (`cross-agent-materialization.test.ts`)
   - Create a Claude-dialect ROLE.md with commands, mcp_servers, skills
   - Run `chapter build` targeting a different agent type
   - Verify workspace files use the target agent's native format

3. **Volume Masking** (`volume-masking.test.ts`)
   - Create a role with `container.ignore.paths` in frontmatter
   - Run `chapter build` to generate Docker artifacts
   - Verify the generated docker-compose.yaml contains volume masking entries
   - Verify directories get named volumes, files get empty-file bind mounts

4. **Error Paths** (`error-paths.test.ts`)
   - Missing role: `chapter validate nonexistent-role` exits with error
   - Malformed ROLE.md: invalid YAML frontmatter causes clear error
   - Missing packaged role: `chapter validate @missing/role` shows install instructions

5. **ACP Bootstrap Update** (`acp-client-spawn.test.ts`)
   - Replace `clawmasons agent --acp` with `clawmasons run --acp`
   - Update doc comments

### Fixture Structure

```
e2e/fixtures/test-chapter/
  .claude/roles/test-writer/ROLE.md    # New: local ROLE.md fixture
  roles/writer/package.json            # Existing: packaged role
  ...
```

### Helper Updates

Add `chapterExecExpectError()` to `helpers.ts` for tests that expect non-zero exit codes.

## Dependencies

- All Changes 1-11 must be complete (they are)
- Docker must be available for Docker-based tests
- No new npm packages required
