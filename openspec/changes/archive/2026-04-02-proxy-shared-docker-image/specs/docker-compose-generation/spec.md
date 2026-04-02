## MODIFIED Requirements

### Requirement: Proxy service binds to random localhost port

The `generateSessionComposeYml()` function SHALL generate the proxy service port mapping as `"127.0.0.1::9090"` (empty host port, localhost only). This delegates host port assignment to Docker, eliminating port conflicts between concurrent sessions.

The proxy service SHALL NOT accept a `proxyPort` parameter for the host-side port mapping. The container-internal port SHALL remain `9090`.

The proxy service SHALL mount the role-specific `proxy-config.json` into the container as a read-only bind mount at `/app/proxy-config.json`:

```yaml
proxy-{roleName}:
  image: mason-{projectHash}-proxy
  volumes:
    - {relDockerDir}/{roleName}/mcp-proxy/proxy-config.json:/app/proxy-config.json:ro
  ports:
    - "127.0.0.1::9090"
```

The volume mount path on the host side SHALL be relative from the session directory to the per-role config file at `.mason/docker/{roleName}/mcp-proxy/proxy-config.json`.

#### Scenario: Random port mapping in generated compose YAML
- **WHEN** `generateSessionComposeYml()` generates the proxy service definition
- **THEN** the `ports` section SHALL contain `"127.0.0.1::9090"` with no fixed host port

#### Scenario: Localhost-only binding
- **WHEN** the proxy service port mapping is generated
- **THEN** the mapping SHALL bind to `127.0.0.1` only, not to all interfaces

#### Scenario: proxyPort option removed from compose generation
- **WHEN** `generateSessionComposeYml()` is called
- **THEN** the function SHALL NOT accept or use a `proxyPort` option for the host port mapping

#### Scenario: Proxy config mounted as read-only volume
- **WHEN** `generateSessionComposeYml()` generates the proxy service definition for role "writer"
- **THEN** the proxy service volumes SHALL include a bind mount from `{relDockerDir}/writer/mcp-proxy/proxy-config.json` to `/app/proxy-config.json:ro`

#### Scenario: Proxy config mount uses per-role path
- **WHEN** a project has roles "writer" and "reviewer"
- **THEN** the "writer" proxy service SHALL mount `{relDockerDir}/writer/mcp-proxy/proxy-config.json` and the "reviewer" proxy service SHALL mount `{relDockerDir}/reviewer/mcp-proxy/proxy-config.json`

### Requirement: Session compose uses stable image names without session ID

The generated Docker Compose YAML SHALL use image tags scoped to project + role + agent, NOT to session ID. The image name format SHALL be `mason-{projectHash}-{agentServiceName}-{agentShortName}` (or `mason-{projectHash}-{agentServiceName}` when no agent short name applies). Multiple sessions of the same role within the same project SHALL reuse the same image tag.

The proxy service image name SHALL be `mason-{projectHash}-proxy` (no role suffix), since the proxy image is shared across all roles.

#### Scenario: Image tag does not contain session ID
- **WHEN** a session compose YAML is generated
- **THEN** the `image:` field for agent services does NOT contain the session ID

#### Scenario: Same role produces same image tag across sessions
- **WHEN** two sessions are created for the same role in the same project
- **THEN** both sessions' compose files reference the same image tag

#### Scenario: Different roles produce different image tags
- **WHEN** two sessions are created for different roles in the same project
- **THEN** each session's compose file references a distinct agent image tag but the SAME proxy image tag

#### Scenario: Proxy image tag has no role suffix
- **WHEN** a session compose YAML is generated for role "writer" in project with hash `abcd1234`
- **THEN** the proxy service `image:` field SHALL be `mason-abcd1234-proxy` (not `mason-abcd1234-proxy-writer`)
