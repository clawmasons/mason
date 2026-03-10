# Spec Delta: Credential Service Dockerfile Generation

## New Requirement: `docker-init` generates credential service Dockerfile

The `generateDockerfiles()` function in `docker-init.ts` SHALL generate a credential service Dockerfile at `docker/credential-service/Dockerfile` alongside proxy and agent Dockerfiles.

### Requirement: Credential service Dockerfile generated unconditionally

When agents are discovered, `generateDockerfiles()` SHALL generate `docker/credential-service/Dockerfile` before generating proxy and agent Dockerfiles.

#### Scenario: Credential service Dockerfile exists after docker-init
- **GIVEN** a chapter workspace with at least one agent package
- **WHEN** `docker-init` runs
- **THEN** `docker/credential-service/Dockerfile` exists

#### Scenario: No agents means no credential service Dockerfile
- **GIVEN** a chapter workspace with no agent packages
- **WHEN** `docker-init` runs
- **THEN** no Dockerfiles are generated (including credential service)

### Requirement: Credential service Dockerfile structure

The `generateCredentialServiceDockerfile()` function SHALL return a single-stage Dockerfile that:
1. Uses `node:22-slim` as the base image
2. Installs build tools for native addons (`python3 make g++`)
3. Copies `package.json` and `node_modules/` from the build context
4. Rebuilds `better-sqlite3` for the container platform
5. Creates `mason` user and group with home directory
6. Creates `/home/mason/data` and `/logs` directories
7. Sets `USER mason`
8. Sets `ENTRYPOINT ["node", "node_modules/.bin/credential-service"]`

#### Scenario: Dockerfile uses correct base image
- **WHEN** `generateCredentialServiceDockerfile()` is called
- **THEN** the Dockerfile contains `FROM node:22-slim`

#### Scenario: Dockerfile runs as mason user
- **WHEN** `generateCredentialServiceDockerfile()` is called
- **THEN** the Dockerfile contains `USER mason`

#### Scenario: Dockerfile uses credential-service entrypoint
- **WHEN** `generateCredentialServiceDockerfile()` is called
- **THEN** the Dockerfile contains `ENTRYPOINT ["node", "node_modules/.bin/credential-service"]`

#### Scenario: No registry references
- **WHEN** `generateCredentialServiceDockerfile()` is called
- **THEN** the Dockerfile does not contain `docker.io`, `ghcr.io`, or `registry`
