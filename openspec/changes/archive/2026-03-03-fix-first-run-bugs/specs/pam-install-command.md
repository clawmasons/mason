## MODIFIED Requirements

### Requirement: Token generated before materialization

**Modified.** The proxy auth token SHALL be generated before the materialization loop (step 5, previously step 7) so it can be passed to `materializeWorkspace()`. This allows runtimes to bake the actual token into their configuration files.

### Requirement: Token passed to materializers

**Modified.** The install command SHALL pass the generated proxy token to `materializeWorkspace(agent, proxyEndpoint, proxyToken)` for each runtime.

### Requirement: Updated next steps instructions

**Modified.** The "Next steps" output SHALL show `forge run <agent>` as the primary command, with `docker compose` as a manual alternative.
