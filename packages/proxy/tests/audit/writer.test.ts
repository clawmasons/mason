import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, readFileSync, rmSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { AuditWriter } from "../../src/audit/writer.js";
import { createRelayMessage } from "../../src/relay/messages.js";
import type { AuditEventMessage } from "../../src/relay/messages.js";

// ── Helpers ─────────────────────────────────────────────────────────────

function makeAuditEvent(overrides?: Partial<Omit<AuditEventMessage, "id" | "type">>): AuditEventMessage {
  return createRelayMessage("audit_event", {
    agent_name: "test-agent",
    role_name: "test-role",
    app_name: "test-app",
    tool_name: "test-tool",
    status: "success",
    duration_ms: 42,
    timestamp: new Date().toISOString(),
    ...overrides,
  });
}

// ── Tests ───────────────────────────────────────────────────────────────

describe("AuditWriter", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "mason-audit-writer-"));
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it("writes a single event as JSONL", () => {
    const filePath = join(tmpDir, "audit.jsonl");
    const writer = new AuditWriter({ filePath });
    const event = makeAuditEvent();

    writer.write(event);

    const content = readFileSync(filePath, "utf-8");
    const lines = content.trim().split("\n");
    expect(lines).toHaveLength(1);

    const parsed = JSON.parse(lines[0]);
    expect(parsed.type).toBe("audit_event");
    expect(parsed.agent_name).toBe("test-agent");
    expect(parsed.tool_name).toBe("test-tool");
    expect(parsed.status).toBe("success");
  });

  it("appends multiple events (one per line)", () => {
    const filePath = join(tmpDir, "audit.jsonl");
    const writer = new AuditWriter({ filePath });

    writer.write(makeAuditEvent({ tool_name: "tool-a" }));
    writer.write(makeAuditEvent({ tool_name: "tool-b" }));
    writer.write(makeAuditEvent({ tool_name: "tool-c" }));

    const content = readFileSync(filePath, "utf-8");
    const lines = content.trim().split("\n");
    expect(lines).toHaveLength(3);

    expect(JSON.parse(lines[0]).tool_name).toBe("tool-a");
    expect(JSON.parse(lines[1]).tool_name).toBe("tool-b");
    expect(JSON.parse(lines[2]).tool_name).toBe("tool-c");
  });

  it("creates parent directory if it does not exist", () => {
    const nestedPath = join(tmpDir, "nested", "deep", "audit.jsonl");
    expect(existsSync(join(tmpDir, "nested"))).toBe(false);

    const writer = new AuditWriter({ filePath: nestedPath });
    writer.write(makeAuditEvent());

    expect(existsSync(nestedPath)).toBe(true);
    const content = readFileSync(nestedPath, "utf-8");
    expect(content.trim().length).toBeGreaterThan(0);
  });

  it("close() is safe to call multiple times", () => {
    const filePath = join(tmpDir, "audit.jsonl");
    const writer = new AuditWriter({ filePath });

    writer.write(makeAuditEvent());
    writer.close();
    writer.close(); // No-op, should not throw

    const content = readFileSync(filePath, "utf-8");
    expect(content.trim().length).toBeGreaterThan(0);
  });

  it("preserves all audit event fields", () => {
    const filePath = join(tmpDir, "audit.jsonl");
    const writer = new AuditWriter({ filePath });
    const event = makeAuditEvent({
      arguments: '{"repo":"test"}',
      result: '{"ok":true}',
      duration_ms: 150,
    });

    writer.write(event);

    const parsed = JSON.parse(readFileSync(filePath, "utf-8").trim());
    expect(parsed.id).toBe(event.id);
    expect(parsed.arguments).toBe('{"repo":"test"}');
    expect(parsed.result).toBe('{"ok":true}');
    expect(parsed.duration_ms).toBe(150);
  });

  it("getFilePath() returns configured path", () => {
    const filePath = join(tmpDir, "custom.jsonl");
    const writer = new AuditWriter({ filePath });
    expect(writer.getFilePath()).toBe(filePath);
  });
});
