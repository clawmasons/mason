/**
 * Session Storage Module
 *
 * General-purpose session persistence layer for managing
 * `{cwd}/.mason/sessions/{sessionId}/meta.json`.
 *
 * Not ACP-specific — reusable by `mason run`, session cleanup, and any
 * feature that needs session tracking.
 */

import { randomBytes } from "node:crypto";
import { mkdir, readdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface Session {
  sessionId: string; // UUID v7
  masonSessionId: string; // Always equals sessionId — stored for container access
  cwd: string;
  agent: string;
  role: string;
  agentSessionId: string | null; // Populated by agent hook (e.g., CLAUDE_SESSION_ID)
  firstPrompt: string | null;
  lastUpdated: string; // ISO 8601
  closed: boolean;
  closedAt: string | null; // ISO 8601
}

// ---------------------------------------------------------------------------
// UUID v7 (RFC 9562 Section 5.7)
// ---------------------------------------------------------------------------

/**
 * Generate a UUID v7 string.
 *
 * Layout (128 bits):
 *   48-bit unix_ts_ms | 4-bit ver (0111) | 12-bit rand_a | 2-bit var (10) | 62-bit rand_b
 */
export function uuidv7(): string {
  const now = Date.now();
  const bytes = randomBytes(16);

  // Encode 48-bit timestamp in bytes 0-5 (big-endian)
  bytes[0] = Math.floor(now / 2 ** 40) & 0xff;
  bytes[1] = Math.floor(now / 2 ** 32) & 0xff;
  bytes[2] = Math.floor(now / 2 ** 24) & 0xff;
  bytes[3] = Math.floor(now / 2 ** 16) & 0xff;
  bytes[4] = Math.floor(now / 2 ** 8) & 0xff;
  bytes[5] = now & 0xff;

  // Set version 7 (0111) in high nibble of byte 6
  bytes[6] = (bytes[6] & 0x0f) | 0x70;

  // Set variant 10xx in high 2 bits of byte 8
  bytes[8] = (bytes[8] & 0x3f) | 0x80;

  return formatUuid(bytes);
}

function formatUuid(bytes: Buffer): string {
  const hex = bytes.toString("hex");
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20, 32),
  ].join("-");
}

// ---------------------------------------------------------------------------
// Path helpers
// ---------------------------------------------------------------------------

function sessionsDir(cwd: string): string {
  return join(cwd, ".mason", "sessions");
}

function sessionDir(cwd: string, sessionId: string): string {
  return join(sessionsDir(cwd), sessionId);
}

function sessionMetaPath(cwd: string, sessionId: string): string {
  return join(sessionDir(cwd, sessionId), "meta.json");
}

// ---------------------------------------------------------------------------
// Atomic write helper
// ---------------------------------------------------------------------------

async function writeMetaAtomic(
  metaPath: string,
  session: Session,
): Promise<void> {
  const tmpPath = metaPath + ".tmp";
  const json = JSON.stringify(session, null, 2) + "\n";
  await mkdir(dirname(metaPath), { recursive: true });
  await writeFile(tmpPath, json, "utf-8");
  await rename(tmpPath, metaPath);
}

// ---------------------------------------------------------------------------
// CRUD operations
// ---------------------------------------------------------------------------

/**
 * Create a new session with a UUID v7 identifier.
 * Writes `meta.json` to `{cwd}/.mason/sessions/{sessionId}/`.
 */
export async function createSession(
  cwd: string,
  agent: string,
  role: string,
): Promise<Session> {
  const id = uuidv7();
  const session: Session = {
    sessionId: id,
    masonSessionId: id,
    cwd,
    agent,
    role,
    agentSessionId: null,
    firstPrompt: null,
    lastUpdated: new Date().toISOString(),
    closed: false,
    closedAt: null,
  };

  await writeMetaAtomic(sessionMetaPath(cwd, session.sessionId), session);
  return session;
}

/**
 * Read a session's metadata. Returns `null` if the session does not exist.
 */
export async function readSession(
  cwd: string,
  sessionId: string,
): Promise<Session | null> {
  try {
    const raw = await readFile(sessionMetaPath(cwd, sessionId), "utf-8");
    return JSON.parse(raw) as Session;
  } catch {
    return null;
  }
}

/**
 * Merge partial updates into a session's metadata and persist atomically.
 * Throws if the session does not exist.
 */
export async function updateSession(
  cwd: string,
  sessionId: string,
  updates: Partial<Session>,
): Promise<void> {
  const existing = await readSession(cwd, sessionId);
  if (!existing) {
    throw new Error(`Session not found: ${sessionId}`);
  }

  const updated: Session = {
    ...existing,
    ...updates,
    // Prevent callers from changing the sessionId
    sessionId: existing.sessionId,
  };

  await writeMetaAtomic(sessionMetaPath(cwd, sessionId), updated);
}

/**
 * List all non-closed sessions for a given `cwd`, sorted by `lastUpdated` descending.
 * Returns an empty array if no sessions directory exists.
 */
export async function listSessions(cwd: string): Promise<Session[]> {
  const dir = sessionsDir(cwd);

  let entries: string[];
  try {
    entries = await readdir(dir);
  } catch {
    return [];
  }

  const sessions: Session[] = [];

  for (const entry of entries) {
    try {
      const raw = await readFile(join(dir, entry, "meta.json"), "utf-8");
      const session = JSON.parse(raw) as Session;
      if (!session.closed) {
        sessions.push(session);
      }
    } catch {
      // Skip directories without valid meta.json
      continue;
    }
  }

  // Sort by lastUpdated descending (most recent first)
  sessions.sort(
    (a, b) =>
      new Date(b.lastUpdated).getTime() - new Date(a.lastUpdated).getTime(),
  );

  return sessions;
}

/**
 * Close a session by setting `closed: true` and recording `closedAt`.
 * Throws if the session does not exist.
 */
export async function closeSession(
  cwd: string,
  sessionId: string,
): Promise<void> {
  await updateSession(cwd, sessionId, {
    closed: true,
    closedAt: new Date().toISOString(),
  });
}
