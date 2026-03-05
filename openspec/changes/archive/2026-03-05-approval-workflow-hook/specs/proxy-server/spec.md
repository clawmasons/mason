## MODIFIED Requirements

### Requirement: tools/call resolves via ToolRouter and forwards to UpstreamManager
The `tools/call` handler SHALL:
1. Call `router.resolve(name)` with the prefixed tool name from the request
2. If `db` is configured, call `auditPreHook(context)` to capture start time and entry ID
3. If `approvalPatterns` are configured and tool name matches, call `requestApproval()` and block until resolved
4. If approval returns `"denied"` or `"timeout"`, call `auditPostHook()` with the corresponding status and return an error without calling upstream
5. If resolved and approved (or no approval needed), call `upstream.callTool(route.appName, route.originalToolName, args)`
6. If `db` is configured, call `auditPostHook()` with the result and status (success/error)
7. Return the upstream result to the runtime

#### Scenario: Tool requiring approval is approved
- **WHEN** a runtime calls `tools/call` with name `github_delete_repo`
- **AND** `approvalPatterns` includes `"github_delete_*"`
- **AND** `db` is configured
- **AND** an external process approves the request during polling
- **THEN** the proxy calls `auditPreHook()`, then `requestApproval()` which returns `"approved"`
- **AND** calls `upstream.callTool()` and returns the result
- **AND** calls `auditPostHook()` with status `"success"`

#### Scenario: Tool requiring approval is denied
- **WHEN** a runtime calls `tools/call` with name `github_delete_repo`
- **AND** `approvalPatterns` includes `"github_delete_*"`
- **AND** `db` is configured
- **AND** an external process denies the request during polling
- **THEN** the proxy calls `auditPreHook()`, then `requestApproval()` which returns `"denied"`
- **AND** calls `auditPostHook()` with status `"denied"`
- **AND** returns an error message without calling upstream

#### Scenario: Tool requiring approval times out
- **WHEN** a runtime calls `tools/call` with name `github_delete_repo`
- **AND** `approvalPatterns` includes `"github_delete_*"`
- **AND** `db` is configured
- **AND** TTL expires without resolution
- **THEN** the proxy returns `"timeout"` status
- **AND** calls `auditPostHook()` with status `"timeout"`
- **AND** returns an error message without calling upstream

#### Scenario: Tool not matching approval patterns proceeds normally
- **WHEN** a runtime calls `tools/call` with name `github_list_repos`
- **AND** `approvalPatterns` includes `"github_delete_*"`
- **THEN** no approval is requested
- **AND** the call proceeds directly to upstream

## ADDED Requirements

### Requirement: ForgeProxyServerConfig accepts optional approval patterns
The `ForgeProxyServerConfig` interface SHALL accept an optional `approvalPatterns` field (string[]). When `approvalPatterns` and `db` are both provided, tool calls matching any pattern require approval before execution. When either is absent, no approval checks are performed.

#### Scenario: Config with approval patterns enables approval workflow
- **WHEN** `ForgeProxyServer` is constructed with `{ approvalPatterns: ["github_delete_*"], db: <Database>, ... }`
- **THEN** tool calls matching `github_delete_*` require approval

#### Scenario: Config without approval patterns disables approval workflow
- **WHEN** `ForgeProxyServer` is constructed without `approvalPatterns`
- **THEN** no tool calls require approval
