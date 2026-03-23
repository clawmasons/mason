export { ProxyServer } from "./server.js";
export type { ProxyServerConfig } from "./server.js";
export { ToolRouter, ResourceRouter, PromptRouter } from "./router.js";
export type { RouteEntry, ResourceRouteEntry, PromptRouteEntry } from "./router.js";
export { UpstreamManager, createTransport } from "./upstream.js";
export type { UpstreamAppConfig } from "./upstream.js";
export { loadEnvFile, resolveEnvVars } from "./env-utils.js";
export { auditPreHook, auditPostHook, logDroppedServers, setLocalAuditPath } from "./hooks/audit.js";
export type { HookContext, AuditPreHookResult, AuditStatus, DroppedServer } from "./hooks/audit.js";
export { matchesApprovalPattern, requestApproval } from "./hooks/approval.js";
export type { ApprovalOptions } from "./hooks/approval.js";
export { SessionStore, handleConnectAgent } from "./handlers/connect-agent.js";
export type { SessionEntry, RiskLevel } from "./handlers/connect-agent.js";
export { CredentialRelayHandler } from "./credentials/relay-handler.js";
export { RelayServer } from "./relay/server.js";
export type { RelayServerConfig } from "./relay/server.js";
export { RelayClient } from "./relay/client.js";
export type { RelayClientConfig } from "./relay/client.js";
export { AuditWriter } from "./audit/writer.js";
export { ApprovalHandler } from "./approvals/handler.js";
export { showApprovalDialog } from "./approvals/dialog.js";
export { HostProxy } from "./host-proxy.js";
export type { HostProxyConfig } from "./host-proxy.js";
// Credential service (absorbed from @clawmasons/credential-service)
export {
  CredentialResolver,
  CredentialService,
  CredentialWSClient,
  credentialRequestSchema,
  credentialResponseSchema,
  credentialSuccessSchema,
  credentialErrorSchema,
  credentialServiceConfigSchema,
  generateAuditId,
} from "./credentials/index.js";
export type {
  CredentialResolverConfig,
  ResolveResult,
  ResolveSuccess,
  ResolveError,
  CredentialRequest,
  CredentialResponse,
  CredentialServiceConfig,
  CredentialWSClientOptions,
  AuditEmitter,
  CredentialAuditEntry,
} from "./credentials/index.js";
