// Resolver (from CHANGE 2)
export {
  CredentialResolver,
  type CredentialResolverConfig,
  type ResolveResult,
  type ResolveSuccess,
  type ResolveError,
} from "./resolver.js";
export { loadEnvFile } from "./env-file.js";

// Schemas
export {
  credentialRequestSchema,
  credentialResponseSchema,
  credentialSuccessSchema,
  credentialErrorSchema,
  credentialServiceConfigSchema,
  type CredentialRequest,
  type CredentialResponse,
  type CredentialServiceConfig,
} from "./schemas.js";

// Service (SDK mode)
export { CredentialService } from "./service.js";

// WebSocket client
export { CredentialWSClient, type CredentialWSClientOptions } from "./ws-client.js";

// Audit
export {
  openCredentialDatabase,
  insertCredentialAudit,
  queryCredentialAudit,
  generateAuditId,
  type CredentialAuditEntry,
  type CredentialAuditFilters,
} from "./audit.js";
