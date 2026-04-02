# proxy-shared-image Specification

## Purpose

The proxy Docker image is role-agnostic and shared across all roles in a project. A single image is built once and reused, with role-specific configuration injected at runtime via volume mounts.

## Requirements

### Requirement: Proxy Docker image is role-agnostic and shared across all roles

The proxy Docker image SHALL NOT contain any role-specific artifacts. The Dockerfile SHALL only COPY the `proxy-bundle.cjs` entry point. The `proxy-config.json` file SHALL NOT be copied into the image at build time.

#### Scenario: Dockerfile contains no COPY of proxy-config.json
- **WHEN** `generateProxyDockerfile()` is called
- **THEN** the generated Dockerfile SHALL contain `COPY --chown=mason:mason proxy-bundle.cjs ./` and SHALL NOT contain any COPY instruction referencing `proxy-config.json`

#### Scenario: Dockerfile does not reference any role name
- **WHEN** `generateProxyDockerfile()` is called
- **THEN** the generated Dockerfile SHALL NOT contain any role-specific identifiers in COPY paths, comments, or labels

### Requirement: Proxy Dockerfile generation requires no role parameter

The `generateProxyDockerfile()` function SHALL accept zero parameters. The function signature SHALL NOT include a `role` or `ResolvedRole` parameter since the generated Dockerfile is identical for all roles.

#### Scenario: Function called with no arguments
- **WHEN** `generateProxyDockerfile()` is called with no arguments
- **THEN** it SHALL return a valid Dockerfile string for the proxy container

### Requirement: Shared proxy Dockerfile lives at project-level path

The proxy Dockerfile SHALL be written to `.mason/docker/mcp-proxy/Dockerfile` (shared, not per-role). It SHALL NOT be written to `.mason/docker/{role}/mcp-proxy/Dockerfile`.

#### Scenario: Single Dockerfile generated per project
- **WHEN** `mason build` is run for a project with roles "writer" and "reviewer"
- **THEN** exactly one proxy Dockerfile SHALL exist at `.mason/docker/mcp-proxy/Dockerfile`
- **AND** no proxy Dockerfile SHALL exist at `.mason/docker/writer/mcp-proxy/Dockerfile` or `.mason/docker/reviewer/mcp-proxy/Dockerfile`

### Requirement: Proxy image name excludes role suffix

The proxy Docker image SHALL be tagged as `mason-{projectHash}-proxy`. The image name SHALL NOT include a role name suffix.

#### Scenario: Image name format
- **WHEN** a proxy image is built for a project with hash `abcd1234`
- **THEN** the image SHALL be tagged `mason-abcd1234-proxy`

#### Scenario: All roles share the same proxy image
- **WHEN** a project has roles "writer" and "reviewer"
- **THEN** both roles' proxy containers SHALL use the same image `mason-{projectHash}-proxy`
