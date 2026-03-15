## REMOVED Requirements

### Requirement: Claude Code materializer supports ACP mode
**Reason**: `.chapter/acp.json` has no consumer in the codebase. The file was generated but never read at runtime by any agent, bootstrap, or CLI code.
**Migration**: Remove any code that reads `.chapter/acp.json`. The `acpMode` flag on `MaterializeOptions` is retained and still controls ACP runtime command selection in `agent-launch.json`; only the `.chapter/acp.json` file output is removed.
