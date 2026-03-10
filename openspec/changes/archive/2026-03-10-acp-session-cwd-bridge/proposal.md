# Proposal: ACP Session CWD Support -- Bridge Intercepts `session/new`

**Date:** 2026-03-10
**PRD:** acp-session-cwd
**Change:** #7

## Problem

Currently, `run-acp-agent` starts the Docker session (proxy + credential-service + agent) immediately at launch. The agent container is always mounted to the directory where the command was launched. This means:

1. Every project needs its own `run-acp-agent` process
2. ACP clients (Zed, JetBrains) that send `session/new` with a `cwd` field get ignored -- the agent always works in the launch directory
3. Switching projects in an editor requires restarting the entire proxy

## Proposed Solution

Modify the architecture so that:

1. **On `run-acp-agent` startup:** Only start proxy + credential-service containers (long-lived). Start the ACP bridge endpoint. Do NOT start the agent container yet.
2. **On `session/new`:** The bridge intercepts POST requests, buffers the body, and checks if it's a `session/new` with a `cwd` field. When found:
   - Extract `cwd` (fallback to `process.cwd()`)
   - Create `.clawmasons/` in the `cwd` directory for session logs
   - Ensure `.gitignore` via utility
   - Launch the agent container via `docker compose` with `cwd` mounted as `/workspace`
   - Connect bridge to the new agent container
   - Relay the `session/new` and all subsequent messages to the agent
3. **On disconnect:** Stop only the agent container. Proxy + credential-service remain running for the next session.

## PRD References

- REQ-005: ACP Session CWD Support
- US-4: CWD-aware ACP sessions
- PRD 7.4: Sequence Diagram
