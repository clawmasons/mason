## Delta: CLI Agent Command Consolidation

### Changed Specs

**acp-proxy-cli-command**: The `clawmasons acp` command is removed. Its functionality is absorbed into `clawmasons agent --acp`. All ACP-specific options (--role, --proxy-port, --chapter, --init-agent) are now on the `agent` command.

**docker-compose-generation**: The `generateComposeYml()` function no longer produces a `credential-service` Docker service. Docker Compose files now contain only `proxy-{role}` and `agent-{agent}-{role}` services. The proxy service exposes its port to the host for in-process credential service WebSocket connectivity.

**credential-service-package**: The credential service no longer runs as a Docker container. It always runs in-process within the `clawmasons agent` CLI process (in both interactive and ACP modes). Uses `CredentialService` + `CredentialWSClient` connecting to the proxy's `/ws/credentials` WebSocket relay.

**acp-session**: The `AcpSession` class and `generateAcpComposeYml()` are unchanged — they already used the two-container model (proxy + agent). The interactive mode now also uses the two-container model.
