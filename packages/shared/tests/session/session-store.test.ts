import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  createSession,
  readSession,
  updateSession,
  listSessions,
  closeSession,
  uuidv7,
} from "../../src/session/session-store.js";

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe("session-store", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), "session-store-test-"));
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  // -----------------------------------------------------------------------
  // uuidv7
  // -----------------------------------------------------------------------

  describe("uuidv7", () => {
    it("generates a valid UUID v7 string", () => {
      const id = uuidv7();
      expect(id).toMatch(UUID_REGEX);
    });

    it("generates time-ordered IDs", async () => {
      const id1 = uuidv7();
      // Small delay to ensure different timestamp
      await new Promise((r) => setTimeout(r, 2));
      const id2 = uuidv7();
      expect(id1 < id2).toBe(true);
    });
  });

  // -----------------------------------------------------------------------
  // createSession
  // -----------------------------------------------------------------------

  describe("createSession", () => {
    it("writes meta.json with correct fields", async () => {
      const session = await createSession(tmpDir, "claude-code", "project");

      expect(session.sessionId).toMatch(UUID_REGEX);
      expect(session.cwd).toBe(tmpDir);
      expect(session.agent).toBe("claude-code");
      expect(session.role).toBe("project");
      expect(session.firstPrompt).toBeNull();
      expect(session.closed).toBe(false);
      expect(session.closedAt).toBeNull();
      expect(session.lastUpdated).toBeTruthy();

      // Verify file exists on disk
      const metaPath = join(
        tmpDir,
        ".mason",
        "sessions",
        session.sessionId,
        "meta.json",
      );
      const raw = await readFile(metaPath, "utf-8");
      const persisted = JSON.parse(raw);
      expect(persisted).toEqual(session);
    });

    it("returns masonSessionId equal to sessionId", async () => {
      const session = await createSession(tmpDir, "claude-code", "project");
      expect(session.masonSessionId).toBe(session.sessionId);
    });

    it("returns agentSessionId as null", async () => {
      const session = await createSession(tmpDir, "claude-code", "project");
      expect(session.agentSessionId).toBeNull();
    });
  });

  // -----------------------------------------------------------------------
  // readSession
  // -----------------------------------------------------------------------

  describe("readSession", () => {
    it("returns matching data for existing session", async () => {
      const created = await createSession(tmpDir, "codex", "project");
      const read = await readSession(tmpDir, created.sessionId);
      expect(read).toEqual(created);
    });

    it("returns null for non-existent session", async () => {
      const result = await readSession(tmpDir, "non-existent-id");
      expect(result).toBeNull();
    });

    it("round-trips masonSessionId and agentSessionId", async () => {
      const created = await createSession(tmpDir, "claude-code", "project");
      await updateSession(tmpDir, created.sessionId, {
        agentSessionId: "agent-xyz-789",
      });

      const read = await readSession(tmpDir, created.sessionId);
      expect(read).not.toBeNull();
      expect(read!.masonSessionId).toBe(created.sessionId);
      expect(read!.agentSessionId).toBe("agent-xyz-789");
    });
  });

  // -----------------------------------------------------------------------
  // updateSession
  // -----------------------------------------------------------------------

  describe("updateSession", () => {
    it("persists partial updates and preserves unchanged fields", async () => {
      const created = await createSession(tmpDir, "claude-code", "project");

      await updateSession(tmpDir, created.sessionId, {
        firstPrompt: "help me refactor",
        lastUpdated: "2026-03-25T12:00:00.000Z",
      });

      const updated = await readSession(tmpDir, created.sessionId);
      expect(updated).not.toBeNull();
      expect(updated!.firstPrompt).toBe("help me refactor");
      expect(updated!.lastUpdated).toBe("2026-03-25T12:00:00.000Z");
      // Unchanged fields preserved
      expect(updated!.agent).toBe("claude-code");
      expect(updated!.role).toBe("project");
      expect(updated!.closed).toBe(false);
    });

    it("prevents changing sessionId", async () => {
      const created = await createSession(tmpDir, "claude-code", "project");

      await updateSession(tmpDir, created.sessionId, {
        sessionId: "hacked-id",
      } as Partial<import("../../src/session/session-store.js").Session>);

      const updated = await readSession(tmpDir, created.sessionId);
      expect(updated!.sessionId).toBe(created.sessionId);
    });

    it("can set agentSessionId to a string value", async () => {
      const created = await createSession(tmpDir, "claude-code", "project");
      expect(created.agentSessionId).toBeNull();

      await updateSession(tmpDir, created.sessionId, {
        agentSessionId: "claude-session-abc123",
      });

      const updated = await readSession(tmpDir, created.sessionId);
      expect(updated).not.toBeNull();
      expect(updated!.agentSessionId).toBe("claude-session-abc123");
      // masonSessionId should be unchanged
      expect(updated!.masonSessionId).toBe(created.sessionId);
    });

    it("throws for non-existent session", async () => {
      await expect(
        updateSession(tmpDir, "non-existent-id", { agent: "codex" }),
      ).rejects.toThrow("Session not found: non-existent-id");
    });
  });

  // -----------------------------------------------------------------------
  // listSessions
  // -----------------------------------------------------------------------

  describe("listSessions", () => {
    it("returns only non-closed sessions sorted by lastUpdated desc", async () => {
      const s1 = await createSession(tmpDir, "claude-code", "project");
      await updateSession(tmpDir, s1.sessionId, {
        lastUpdated: "2026-03-25T10:00:00.000Z",
      });

      const s2 = await createSession(tmpDir, "codex", "project");
      await updateSession(tmpDir, s2.sessionId, {
        lastUpdated: "2026-03-25T12:00:00.000Z",
      });

      const s3 = await createSession(tmpDir, "claude-code", "admin");
      await closeSession(tmpDir, s3.sessionId);

      const sessions = await listSessions(tmpDir);
      expect(sessions).toHaveLength(2);
      // Most recent first
      expect(sessions[0].sessionId).toBe(s2.sessionId);
      expect(sessions[1].sessionId).toBe(s1.sessionId);
    });

    it("returns empty array when no sessions directory exists", async () => {
      const sessions = await listSessions(tmpDir);
      expect(sessions).toEqual([]);
    });

    it("skips sessions with malformed meta.json", async () => {
      const valid = await createSession(tmpDir, "claude-code", "project");

      // Create a malformed session directory
      const { mkdir, writeFile } = await import("node:fs/promises");
      const badDir = join(tmpDir, ".mason", "sessions", "bad-session");
      await mkdir(badDir, { recursive: true });
      await writeFile(join(badDir, "meta.json"), "NOT VALID JSON", "utf-8");

      const sessions = await listSessions(tmpDir);
      expect(sessions).toHaveLength(1);
      expect(sessions[0].sessionId).toBe(valid.sessionId);
    });
  });

  // -----------------------------------------------------------------------
  // closeSession
  // -----------------------------------------------------------------------

  describe("closeSession", () => {
    it("sets closed=true and closedAt timestamp", async () => {
      const created = await createSession(tmpDir, "claude-code", "project");
      await closeSession(tmpDir, created.sessionId);

      const closed = await readSession(tmpDir, created.sessionId);
      expect(closed).not.toBeNull();
      expect(closed!.closed).toBe(true);
      expect(closed!.closedAt).toBeTruthy();
      // closedAt should be a valid ISO date
      expect(new Date(closed!.closedAt!).toISOString()).toBe(closed!.closedAt);
    });

    it("closed session is excluded from listSessions", async () => {
      const s1 = await createSession(tmpDir, "claude-code", "project");
      const s2 = await createSession(tmpDir, "codex", "project");

      await closeSession(tmpDir, s1.sessionId);

      const sessions = await listSessions(tmpDir);
      expect(sessions).toHaveLength(1);
      expect(sessions[0].sessionId).toBe(s2.sessionId);
    });

    it("throws for non-existent session", async () => {
      await expect(closeSession(tmpDir, "non-existent-id")).rejects.toThrow(
        "Session not found: non-existent-id",
      );
    });
  });
});
