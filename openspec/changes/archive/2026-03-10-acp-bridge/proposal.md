# Proposal: ACP Bridge — Bidirectional ACP <-> Container Communication

**Date:** 2026-03-10
**Change:** #7 from [ACP Proxy IMPLEMENTATION](../../../prds/acp-proxy/IMPLEMENTATION.md)
**PRD Refs:** REQ-001 (ACP endpoint), PRD 7.1 (Architecture), PRD 7.4 (Tool Call Flow)

## Problem

The ACP proxy needs a networking component that bridges communication between host-side ACP clients (editors like Zed, JetBrains) and the container-side ACP agent running inside Docker. Without this bridge, ACP messages cannot flow between the editor and the governed agent container.

## Proposal

Create `packages/cli/src/acp/bridge.ts` -- an `AcpBridge` class that:

1. Exposes a host-side HTTP endpoint that ACP clients connect to
2. Connects to the container-side ACP agent's HTTP endpoint inside Docker
3. Relays messages bidirectionally: client requests go to the container agent, agent responses come back to the client
4. Handles connection lifecycle (client connect/disconnect) and container agent status (exit/crash)
5. Provides event emitters for orchestration: `onClientConnect`, `onClientDisconnect`, `onAgentError`

The bridge is a transparent relay -- it does not interpret ACP messages, just proxies them between host and container.

## Scope

- New file: `packages/cli/src/acp/bridge.ts`
- New test: `packages/cli/tests/acp/bridge.test.ts`
