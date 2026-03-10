# ACP Bridge — Bidirectional ACP <-> Container Communication

The ACP bridge is a transparent HTTP relay that bridges ACP protocol messages between a host-side endpoint (where editors connect) and a container-side ACP agent endpoint (inside Docker).

## Requirements

### Requirement: AcpBridge starts and accepts connections on the configured host port

The `AcpBridge.start()` method SHALL create an HTTP server listening on the configured `hostPort`.

#### Scenario: Bridge starts successfully
- **GIVEN** an AcpBridge configured with `hostPort: 3001`
- **WHEN** `start()` is called
- **THEN** the bridge accepts HTTP connections on port 3001
- **AND** GET `/health` returns 200 with `{ "status": "ok" }`

#### Scenario: Bridge rejects requests before agent is connected
- **GIVEN** an AcpBridge that has started but `connectToAgent()` has not been called
- **WHEN** a client sends a POST request to any path
- **THEN** the bridge returns 503 Service Unavailable with `{ "error": "Agent not connected" }`

### Requirement: AcpBridge relays HTTP requests to the container agent

The bridge SHALL forward all HTTP requests from the host port to `http://{containerHost}:{containerPort}` and relay responses back.

#### Scenario: Successful relay of POST request
- **GIVEN** a started bridge connected to an agent
- **WHEN** a client sends POST `/` with body `{ "command": "list" }`
- **THEN** the bridge forwards the request to the container agent
- **AND** the agent's response is relayed back to the client with the same status code, headers, and body

#### Scenario: Relay preserves request method and path
- **GIVEN** a started bridge connected to an agent
- **WHEN** a client sends GET `/some/path`
- **THEN** the bridge forwards GET `/some/path` to the container agent

#### Scenario: Relay preserves request headers
- **GIVEN** a started bridge connected to an agent
- **WHEN** a client sends a request with custom headers
- **THEN** the bridge forwards those headers to the container agent (excluding hop-by-hop headers like `host`, `connection`)

### Requirement: connectToAgent verifies the container agent is reachable

The `connectToAgent()` method SHALL check that the container ACP agent endpoint is healthy.

#### Scenario: Agent is reachable
- **GIVEN** the container agent is running and accepting connections
- **WHEN** `connectToAgent()` is called
- **THEN** the promise resolves successfully
- **AND** subsequent client requests are relayed to the agent

#### Scenario: Agent is not reachable
- **GIVEN** the container agent is not running
- **WHEN** `connectToAgent()` is called
- **THEN** the promise rejects with an error describing the connection failure

#### Scenario: connectToAgent retries on initial failure
- **GIVEN** the container agent is starting up
- **WHEN** `connectToAgent()` is called with retries
- **THEN** it retries the health check up to the configured max attempts
- **AND** resolves when the agent becomes reachable

### Requirement: AcpBridge emits lifecycle events

The bridge SHALL notify subscribers of client and agent lifecycle events.

#### Scenario: Client connect event
- **GIVEN** a started bridge with `onClientConnect` set
- **WHEN** a client sends its first request
- **THEN** the `onClientConnect` callback is invoked

#### Scenario: Client disconnect event
- **GIVEN** a bridge with an active client and `onClientDisconnect` set
- **WHEN** the client connection is closed (no requests for the idle timeout)
- **THEN** the `onClientDisconnect` callback is invoked

#### Scenario: Agent error event
- **GIVEN** a started bridge connected to an agent with `onAgentError` set
- **WHEN** the agent endpoint becomes unreachable during a relay
- **THEN** the `onAgentError` callback is invoked with an Error describing the failure
- **AND** the client receives a 502 Bad Gateway response

### Requirement: AcpBridge stops cleanly

The `stop()` method SHALL tear down the host-side server and release all resources.

#### Scenario: Clean shutdown
- **GIVEN** a started bridge with active connections
- **WHEN** `stop()` is called
- **THEN** the HTTP server closes
- **AND** no new connections are accepted
- **AND** the stop promise resolves

#### Scenario: Stop is idempotent
- **GIVEN** a bridge that has already been stopped
- **WHEN** `stop()` is called again
- **THEN** the promise resolves without error
