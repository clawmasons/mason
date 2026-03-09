export { ChapterProxyServer } from "./server.js";
export type { ChapterProxyServerConfig } from "./server.js";
export { ToolRouter, ResourceRouter, PromptRouter } from "./router.js";
export type { RouteEntry, ResourceRouteEntry, PromptRouteEntry } from "./router.js";
export { UpstreamManager, createTransport } from "./upstream.js";
export type { UpstreamAppConfig } from "./upstream.js";
export { loadEnvFile, resolveEnvVars } from "./credentials.js";
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
export { auditPreHook, auditPostHook } from "./hooks/audit.js";
export type { HookContext, AuditPreHookResult } from "./hooks/audit.js";
export { matchesApprovalPattern, requestApproval } from "./hooks/approval.js";
export type { ApprovalOptions } from "./hooks/approval.js";
export { SessionStore, handleConnectAgent } from "./handlers/connect-agent.js";
export type { SessionEntry } from "./handlers/connect-agent.js";
export { CredentialRelay } from "./handlers/credential-relay.js";
export type { CredentialRelayConfig, CredentialToolResult } from "./handlers/credential-relay.js";
