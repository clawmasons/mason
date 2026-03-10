import type BetterSqlite3 from "better-sqlite3";
import type { CredentialRequest, CredentialResponse, CredentialServiceConfig } from "./schemas.js";
import { CredentialResolver } from "./resolver.js";
import {
  openCredentialDatabase,
  insertCredentialAudit,
} from "./audit.js";

/**
 * The credential service handles credential requests: validates access,
 * resolves credentials, and logs audit entries.
 *
 * Can be used in SDK mode (in-process, no WebSocket) or behind the
 * WebSocket client for production Docker deployments.
 */
export class CredentialService {
  private readonly resolver: CredentialResolver;
  private readonly db: BetterSqlite3.Database;

  constructor(config: CredentialServiceConfig, resolver?: CredentialResolver) {
    this.resolver = resolver ?? new CredentialResolver({
      envFilePath: config.envFilePath,
      keychainService: config.keychainService,
    });
    this.db = openCredentialDatabase(config.dbPath);
  }

  /**
   * Handle a credential request: validate access → resolve → audit → respond.
   */
  async handleRequest(request: CredentialRequest): Promise<CredentialResponse> {
    const { id, key, agentId, declaredCredentials } = request;

    // 1. Access validation — check key is in agent's declared credentials
    if (!declaredCredentials.includes(key)) {
      const reason = `Agent "${agentId}" has not declared credential "${key}"`;
      this.audit(id, request, "denied", reason, null);
      return {
        id,
        key,
        error: reason,
        code: "ACCESS_DENIED",
      };
    }

    // 2. Resolve credential
    const result = await this.resolver.resolve(key);

    if ("error" in result) {
      // Resolution failed — credential not found in any source
      this.audit(id, request, "error", result.error, null);
      return {
        id,
        key,
        error: result.error,
        code: "NOT_FOUND",
      };
    }

    // 3. Success — return resolved value
    this.audit(id, request, "granted", null, result.source);
    return {
      id,
      key,
      value: result.value,
      source: result.source,
    };
  }

  /**
   * Close the database connection.
   */
  close(): void {
    this.db.close();
  }

  /**
   * Get the underlying database (for testing/querying audit entries).
   */
  getDatabase(): BetterSqlite3.Database {
    return this.db;
  }

  private audit(
    id: string,
    request: CredentialRequest,
    outcome: "granted" | "denied" | "error",
    denyReason: string | null,
    source: string | null,
  ): void {
    insertCredentialAudit(this.db, {
      id,
      timestamp: new Date().toISOString(),
      agent_id: request.agentId,
      role: request.role,
      session_id: request.sessionId,
      credential_key: request.key,
      outcome,
      deny_reason: denyReason,
      source,
    });
  }
}
