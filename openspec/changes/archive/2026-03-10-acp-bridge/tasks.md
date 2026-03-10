# Tasks: ACP Bridge — Bidirectional ACP <-> Container Communication

**Date:** 2026-03-10

## Completed

- [x] Create `packages/cli/src/acp/bridge.ts` with `AcpBridge` class
- [x] Implement `AcpBridgeConfig` interface with hostPort, containerHost, containerPort
- [x] Implement `start()` — create HTTP server on hostPort that proxies to container
- [x] Implement `connectToAgent()` — health check the container ACP agent endpoint
- [x] Implement `stop()` — clean shutdown of HTTP server
- [x] Implement event callbacks: onClientConnect, onClientDisconnect, onAgentError
- [x] Implement transparent HTTP relay (forward all methods, headers, body)
- [x] Handle relay errors (connection refused, timeout) with 502 response
- [x] Create `packages/cli/tests/acp/bridge.test.ts` with unit tests
- [x] Test: bridge starts and accepts connections on host port
- [x] Test: messages relayed host->container and container->host
- [x] Test: client disconnect event fires
- [x] Test: agent error event fires when container connection drops
- [x] Test: bridge stop tears down cleanly
- [x] Test: connectToAgent succeeds when agent is reachable
- [x] Test: connectToAgent fails when agent is not reachable
- [x] Verify type check passes (`npx tsc --noEmit`)
- [x] Verify lint passes
- [x] Verify all tests pass (852 tests, including 14 new bridge tests)
