# Proposal: Docker Session Orchestration for ACP

**Date:** 2026-03-10
**Change:** #8 from [ACP Proxy IMPLEMENTATION](../../../prds/acp-proxy/IMPLEMENTATION.md)
**PRD Refs:** REQ-005 (Docker Session Lifecycle)

## Problem

The ACP proxy needs to manage Docker container sessions for ACP clients. When an ACP client connects, the system must start a three-container session (proxy + credential-service + agent), passing the correct configuration from the matcher, rewriter, and credential extraction steps (CHANGEs 1-4). When the client disconnects, containers must be torn down. Currently, `run-agent.ts` handles interactive Docker sessions, but ACP mode requires a programmatic API for session start/stop rather than interactive shell execution.

## Proposal

Create `packages/cli/src/acp/session.ts` -- an `AcpSession` class that:

1. Accepts a session configuration with agent name, role, matched apps, extracted credentials, and port assignments
2. Generates a docker-compose.yml adapted for ACP mode (agent uses ACP entrypoint, proxy gets only matched apps, credential-service gets session overrides, agent exposes ACP port)
3. Provides `start()` / `stop()` / `isRunning()` lifecycle methods
4. Reuses token generation, compose execution, and Dockerfile validation patterns from `run-agent.ts`
5. Returns session info (container names, ports, session ID) on start

## Scope

- New file: `packages/cli/src/acp/session.ts`
- New test: `packages/cli/tests/acp/session.test.ts`
- Reuses: `generateSessionId`, `validateDockerfiles`, `execComposeCommand` from `run-agent.ts`
- Reuses: Docker Compose YAML generation pattern from `run-agent.ts`
