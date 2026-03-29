## ADDED Requirements

### Requirement: Proxy service binds to random localhost port

The `generateSessionComposeYml()` function SHALL generate the proxy service port mapping as `"127.0.0.1::9090"` (empty host port, localhost only). This delegates host port assignment to Docker, eliminating port conflicts between concurrent sessions.

The proxy service SHALL NOT accept a `proxyPort` parameter for the host-side port mapping. The container-internal port SHALL remain `9090`.

#### Scenario: Random port mapping in generated compose YAML
- **WHEN** `generateSessionComposeYml()` generates the proxy service definition
- **THEN** the `ports` section SHALL contain `"127.0.0.1::9090"` with no fixed host port

#### Scenario: Localhost-only binding
- **WHEN** the proxy service port mapping is generated
- **THEN** the mapping SHALL bind to `127.0.0.1` only, not to all interfaces

#### Scenario: proxyPort option removed from compose generation
- **WHEN** `generateSessionComposeYml()` is called
- **THEN** the function SHALL NOT accept or use a `proxyPort` option for the host port mapping

### Requirement: Proxy port discovery after container startup

A `discoverProxyPort()` function SHALL exist that runs `docker compose -f <composeFile> port <proxyServiceName> 9090` and returns the assigned host port as a number.

The function SHALL parse the output format `<host>:<port>` (e.g., `127.0.0.1:55123`) and extract the port number.

The function SHALL throw a descriptive error if the command fails or returns unexpected output.

#### Scenario: Successful port discovery
- **WHEN** `discoverProxyPort()` is called after `docker compose up -d` completes
- **THEN** it SHALL execute `docker compose port <service> 9090` and return the assigned host port as a number

#### Scenario: Parse docker compose port output
- **WHEN** `docker compose port` returns `127.0.0.1:55123`
- **THEN** `discoverProxyPort()` SHALL return `55123`

#### Scenario: Port discovery failure
- **WHEN** `docker compose port` fails or returns empty/malformed output
- **THEN** `discoverProxyPort()` SHALL throw an error with a message indicating the proxy port could not be determined
