export { ProxyServer } from "./server.js";
export type { ProxyServerConfig } from "./server.js";
export { ToolRouter, ResourceRouter, PromptRouter } from "./router.js";
export type { RouteEntry, ResourceRouteEntry, PromptRouteEntry } from "./router.js";
export { UpstreamManager, createTransport } from "./upstream.js";
export type { UpstreamAppConfig } from "./upstream.js";
export { loadEnvFile, resolveEnvVars } from "./env-utils.js";
export {
  openDatabase,
  insertAuditLog,
  queryAuditLog,
  createApprovalRequest,
  getApprovalRequest,
  updateApprovalStatus,
  generateId,
} from "./db.js";
export type { AuditLogEntry, ApprovalRequest, AuditLogFilters } from "./db.js";
export { auditPreHook, auditPostHook, logDroppedServers } from "./hooks/audit.js";
export type { HookContext, AuditPreHookResult, DroppedServer } from "./hooks/audit.js";
export { matchesApprovalPattern, requestApproval } from "./hooks/approval.js";
export type { ApprovalOptions } from "./hooks/approval.js";
export { SessionStore, handleConnectAgent } from "./handlers/connect-agent.js";
export type { SessionEntry, RiskLevel } from "./handlers/connect-agent.js";
export { CredentialRelayHandler } from "./credentials/relay-handler.js";
export { RelayServer } from "./relay/server.js";
export type { RelayServerConfig } from "./relay/server.js";
export { RelayClient } from "./relay/client.js";
export type { RelayClientConfig } from "./relay/client.js";
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
  openCredentialDatabase,
  insertCredentialAudit,
  queryCredentialAudit,
  generateAuditId,
  createSqliteAuditEmitter,
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
  CredentialAuditFilters,
} from "./credentials/index.js";
