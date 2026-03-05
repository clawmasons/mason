## MODIFIED Requirements

### Requirement: forge install orchestrates the full pipeline

The install command SHALL additionally:
- Call `generateClaudeJson()` on the materializer and write the result to `{runtime}/.claude.json`
- Create an empty `{runtime}/.claude/` directory

These files are written alongside existing workspace files, Dockerfile, and compose service artifacts.

#### Scenario: Successful install creates .claude.json and .claude directory
- **WHEN** `forge install` is run with a valid agent that declares `claude-code` runtime
- **THEN** the output directory SHALL contain:
  - `claude-code/.claude.json` with OOBE bypass content
  - `claude-code/.claude/` directory (empty, for volume mount)
  - All previously required files (Dockerfile, workspace, etc.)

### Requirement: forge install prints progress and summary

The next steps messaging SHALL instruct users to:
1. Fill in credentials in `.env` (for proxy token and app credentials)
2. Run `forge run <agent>` (or docker compose commands)
3. On first run, authenticate with `claude /login` inside the container

The messaging SHALL NOT reference `CLAUDE_AUTH_TOKEN`.
