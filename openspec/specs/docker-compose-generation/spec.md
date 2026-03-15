## ADDED Requirements

### Requirement: Session compose mounts agent home directory

The `generateSessionComposeYml()` function SHALL accept an optional `homePath` in `SessionComposeOptions`. When provided, the agent service SHALL include a volume mount mapping the materialized home directory to `/home/mason`:

```yaml
volumes:
  - {relHomePath}:/home/mason
```

The path SHALL be relative from the session directory to the home directory.

#### Scenario: Home directory mount included
- **WHEN** `generateSessionComposeYml()` is called with `homePath` pointing to `{dockerBuildDir}/{agentType}/home/`
- **THEN** the agent service volumes SHALL include a bind mount of that path to `/home/mason`

#### Scenario: No home directory
- **WHEN** `generateSessionComposeYml()` is called without `homePath`
- **THEN** no `/home/mason` volume mount SHALL be added to the agent service

#### Scenario: Home mount coexists with project mount
- **WHEN** both home mount and project mount are configured
- **THEN** the agent service SHALL have both volume mounts: the home mount at `/home/mason` and the project mount at `/home/mason/workspace/project:ro`

### Requirement: Build args pass host UID/GID to agent Dockerfile

The `generateSessionComposeYml()` function SHALL include `HOST_UID` and `HOST_GID` build args in the agent service's build section:

```yaml
build:
  context: ...
  dockerfile: ...
  args:
    HOST_UID: "<host-uid>"
    HOST_GID: "<host-gid>"
```

The values SHALL be determined at build time from the host system.

#### Scenario: Build args in compose
- **WHEN** `generateSessionComposeYml()` is called with `hostUid` and `hostGid` options
- **THEN** the agent service build section SHALL include `args` with `HOST_UID` and `HOST_GID`

#### Scenario: Default UID/GID when not provided
- **WHEN** `generateSessionComposeYml()` is called without `hostUid`/`hostGid`
- **THEN** the build args SHALL default to `"1000"` for both
