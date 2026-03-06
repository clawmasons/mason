## MODIFIED Requirements

### Requirement: Install command generates forge-proxy build context

The install command SHALL generate a Docker build context for the forge-proxy.

#### Scenario: Non-local packages outside resolved graph are excluded

- **WHEN** a local agent `@vis/agent-note-taker` and a node_modules package `@clawmasons/agent-note-taker` both exist
- **THEN** the build context SHALL use the local `@vis` scoped package, not the `@clawmasons` one
