## Why

The `mason run` command's positional prompt feature is broken — `ensureDockerBuild` accepts `initialPrompt` but never forwards it to `generateRoleDockerBuildDir`, so prompts like `mason run claude "do something"` never reach `agent-launch.json`. Additionally, there is no non-interactive "print" mode for scripting use cases where the caller wants only the agent's final response on stdout.

## What Changes

- **Bug fix**: Forward `initialPrompt` through `ensureDockerBuild` → `generateRoleDockerBuildDir` so bare positional prompts reach `agent-launch.json` for both claude and pi
- **New flag**: Add `-p <prompt>` / `--print <prompt>` to `mason run` for non-interactive print mode
- **JSON streaming**: In print mode, agents run with JSON streaming output (claude: `--output-format stream-json`, pi: `--mode json`); mason captures every stream line to session logs and parses the final result via an agent-specific SDK method
- **SDK extension**: Add `printMode` configuration to `AgentPackage` with `jsonStreamArgs` and `parseJsonStreamFinalResult()` so each agent declares its own streaming format and result extraction logic
- **Log unification**: Rename `acp.log` → `session.log` so both ACP and print modes write to the same log filename
- **Stdout isolation**: In print mode, all mason status output is redirected to `session.log`; only the agent's final result text appears on the terminal. Non-zero exit code on error.

## Capabilities

### New Capabilities

- `print-mode`: Non-interactive prompt execution via `-p`/`--print` flag with JSON streaming, log redirection, and final-result-only terminal output

### Modified Capabilities

- `run-command-initial-prompt`: Fix forwarding of `initialPrompt` through `ensureDockerBuild` to `generateRoleDockerBuildDir`; add `-p`/`--print` flag as an alternative prompt source that activates print mode
- `agent-sdk`: Add `printMode` configuration (`jsonStreamArgs`, `parseJsonStreamFinalResult`) to `AgentPackage` type and thread `printMode` through `MaterializeOptions` and `generateAgentLaunchJson`

## Impact

- **Packages modified**: `@clawmasons/agent-sdk` (types, helpers), `@clawmasons/claude-code-agent` (index, materializer), `@clawmasons/pi-coding-agent` (index, materializer), `@clawmasons/cli` (run-agent command, docker-generator, logger)
- **New SDK surface**: `AgentPackage.printMode` interface — any future agent packages can opt into print mode by implementing this
- **Log file rename**: `acp.log` → `session.log` — affects ACP mode log path (non-breaking, internal)
- **CLI surface**: New `-p`/`--print` flag on `mason run` (additive, no breaking changes)
