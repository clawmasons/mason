import { z } from "zod";

// ── Credential Request ──────────────────────────────────────────────────

export const credentialRequestSchema = z.object({
  /** Unique request ID for correlating request/response over WebSocket. */
  id: z.string(),
  /** The credential key being requested. */
  key: z.string(),
  /** The requesting agent's slug. */
  agentId: z.string(),
  /** The agent's role slug. */
  role: z.string(),
  /** The session identifier. */
  sessionId: z.string(),
  /** The agent's full list of declared credential keys (populated by proxy). */
  declaredCredentials: z.array(z.string()),
  /** ISO 8601 timestamp (Phase 2 signing). */
  timestamp: z.string().optional(),
});

export type CredentialRequest = z.infer<typeof credentialRequestSchema>;

// ── Credential Response ─────────────────────────────────────────────────

export const credentialSuccessSchema = z.object({
  id: z.string(),
  key: z.string(),
  value: z.string(),
  source: z.enum(["env", "keychain", "dotenv"]),
});

export const credentialErrorSchema = z.object({
  id: z.string(),
  key: z.string(),
  error: z.string(),
  code: z.enum(["NOT_FOUND", "ACCESS_DENIED", "INVALID_SESSION"]),
});

export const credentialResponseSchema = z.union([
  credentialSuccessSchema,
  credentialErrorSchema,
]);

export type CredentialResponse = z.infer<typeof credentialResponseSchema>;

// ── Service Config ──────────────────────────────────────────────────────

export const credentialServiceConfigSchema = z.object({
  /** Path to the SQLite database. Defaults to ~/.chapter/data/chapter.db. */
  dbPath: z.string().optional(),
  /** Path to the .env file for dotenv credential resolution. */
  envFilePath: z.string().optional(),
  /** macOS Keychain service name. */
  keychainService: z.string().default("clawmasons"),
});

export type CredentialServiceConfig = z.infer<typeof credentialServiceConfigSchema>;
