# Proxy Credential Infrastructure — Delta (Risk-Based Connection Limits)

## New Requirements

### Requirement: Risk-based connection limits enforce session locking for HIGH/MEDIUM risk roles

The `SessionStore` SHALL accept a `riskLevel` parameter at construction (defaulting to `"LOW"`). When the risk level is `HIGH` or `MEDIUM`, the store locks after the first agent connection — `isLocked()` returns true and subsequent `handleConnectAgent` calls are rejected with 403.

#### Scenario: HIGH risk — first connection succeeds
- **GIVEN** a `SessionStore` with `riskLevel: "HIGH"`
- **WHEN** the first `POST /connect-agent` request arrives with valid auth
- **THEN** the proxy returns 200 with `{ sessionToken, sessionId }`
- **AND** the session is stored

#### Scenario: HIGH risk — second connection rejected
- **GIVEN** a `SessionStore` with `riskLevel: "HIGH"` and one existing connection
- **WHEN** a second `POST /connect-agent` request arrives with valid auth
- **THEN** the proxy returns 403 with `{ error: "Session locked — HIGH risk role does not allow additional agent connections" }`
- **AND** no new session is created

#### Scenario: MEDIUM risk — first connection succeeds
- **GIVEN** a `SessionStore` with `riskLevel: "MEDIUM"`
- **WHEN** the first `POST /connect-agent` request arrives with valid auth
- **THEN** the proxy returns 200 with `{ sessionToken, sessionId }`

#### Scenario: MEDIUM risk — second connection rejected
- **GIVEN** a `SessionStore` with `riskLevel: "MEDIUM"` and one existing connection
- **WHEN** a second `POST /connect-agent` request arrives with valid auth
- **THEN** the proxy returns 403 with `{ error: "Session locked — MEDIUM risk role does not allow additional agent connections" }`

#### Scenario: LOW risk — unlimited connections allowed
- **GIVEN** a `SessionStore` with `riskLevel: "LOW"` and one existing connection
- **WHEN** a second `POST /connect-agent` request arrives with valid auth
- **THEN** the proxy returns 200 with `{ sessionToken, sessionId }`
- **AND** both sessions are stored

#### Scenario: Default risk level behaves as LOW
- **GIVEN** a `SessionStore` created with no risk level argument
- **WHEN** multiple `POST /connect-agent` requests arrive with valid auth
- **THEN** all connections succeed (unlimited)

### Requirement: ChapterProxyServerConfig accepts riskLevel

The `ChapterProxyServerConfig` interface SHALL include an optional `riskLevel` field of type `RiskLevel` (`"HIGH" | "MEDIUM" | "LOW"`). When provided, it is passed to the `SessionStore` at construction.

#### Scenario: Risk level flows from config to session store
- **GIVEN** a `ChapterProxyServer` with `riskLevel: "HIGH"` in config
- **WHEN** the server starts
- **THEN** the internal `SessionStore` has `riskLevel: "HIGH"`

## Modified Types

### SessionStore
- Constructor now accepts optional `riskLevel: RiskLevel` parameter (default: `"LOW"`)
- New readonly property: `riskLevel: RiskLevel`
- New method: `isLocked(): boolean`
- New readonly property: `connectionCount: number`

### ChapterProxyServerConfig
- New optional field: `riskLevel?: RiskLevel`

### New Export
- `RiskLevel` type exported from `@clawmasons/proxy`
