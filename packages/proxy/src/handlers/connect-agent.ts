import { randomBytes, randomUUID } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";

// ── Types ──────────────────────────────────────────────────────────────

export type RiskLevel = "HIGH" | "MEDIUM" | "LOW";

export interface SessionEntry {
  sessionId: string;
  sessionToken: string;
  agentId: string;
  role: string;
  connectedAt: string;
}

// ── SessionStore ────────────────────────────────────────────────────────

export class SessionStore {
  /** session_id → SessionEntry */
  private sessions = new Map<string, SessionEntry>();
  /** sessionToken → session_id (secondary index for O(1) token lookup) */
  private tokenIndex = new Map<string, string>();
  /** Risk level for this proxy instance (set at construction). */
  readonly riskLevel: RiskLevel;
  /** Number of agent connections established through this store. */
  private agentConnectionCount = 0;

  constructor(riskLevel: RiskLevel = "LOW") {
    this.riskLevel = riskLevel;
  }

  /**
   * Returns true if the session is locked due to risk-based connection limits.
   * HIGH and MEDIUM risk roles only allow one agent connection per proxy instance.
   */
  isLocked(): boolean {
    if (this.riskLevel === "LOW") return false;
    return this.agentConnectionCount > 0;
  }

  create(agentId: string, role: string): SessionEntry {
    const sessionId = randomUUID();
    const sessionToken = randomBytes(32).toString("hex");
    const entry: SessionEntry = {
      sessionId,
      sessionToken,
      agentId,
      role,
      connectedAt: new Date().toISOString(),
    };
    this.sessions.set(sessionId, entry);
    this.tokenIndex.set(sessionToken, sessionId);
    this.agentConnectionCount++;
    return entry;
  }

  getByToken(token: string): SessionEntry | undefined {
    const sessionId = this.tokenIndex.get(token);
    if (!sessionId) return undefined;
    return this.sessions.get(sessionId);
  }

  getById(sessionId: string): SessionEntry | undefined {
    return this.sessions.get(sessionId);
  }

  get size(): number {
    return this.sessions.size;
  }

  get connectionCount(): number {
    return this.agentConnectionCount;
  }
}

// ── Handler ────────────────────────────────────────────────────────────

/**
 * Handle POST /connect-agent requests.
 *
 * Authenticates using the proxy token (MCP_PROXY_TOKEN in Authorization header),
 * creates a new session, and returns { sessionToken, sessionId }.
 *
 * For HIGH and MEDIUM risk roles, only one agent connection is allowed per
 * proxy instance. Subsequent connection attempts are rejected with 403.
 */
export function handleConnectAgent(
  req: IncomingMessage,
  res: ServerResponse,
  proxyToken: string,
  sessionStore: SessionStore,
  agentId?: string,
  role?: string,
): void {
  // Method check
  if (req.method !== "POST") {
    res.writeHead(405, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Method not allowed" }));
    return;
  }

  // Auth check
  const auth = req.headers.authorization;
  if (!auth) {
    res.writeHead(401, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Unauthorized" }));
    return;
  }

  const [scheme, token] = auth.split(" ", 2);
  if (scheme !== "Bearer" || token !== proxyToken) {
    res.writeHead(401, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Unauthorized" }));
    return;
  }

  // Risk-based connection limit check
  if (sessionStore.isLocked()) {
    res.writeHead(403, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        error: `Session locked — ${sessionStore.riskLevel} risk role does not allow additional agent connections`,
      }),
    );
    return;
  }

  // Create session
  const session = sessionStore.create(
    agentId ?? "unknown",
    role ?? "unknown",
  );

  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(
    JSON.stringify({
      sessionToken: session.sessionToken,
      sessionId: session.sessionId,
    }),
  );
}
