import { describe, it, expect } from "vitest";
import { resolveDialectName } from "@clawmasons/shared";

// ---------------------------------------------------------------------------
// resolveDialectName
// ---------------------------------------------------------------------------

describe("resolveDialectName", () => {
  it("resolves exact registry key 'claude-code-agent'", () => {
    expect(resolveDialectName("claude-code-agent")).toBe("claude-code-agent");
  });

  it("resolves short directory name 'claude' to 'claude-code-agent'", () => {
    expect(resolveDialectName("claude")).toBe("claude-code-agent");
  });

  it("resolves dot-prefixed '.claude' to 'claude-code-agent'", () => {
    expect(resolveDialectName(".claude")).toBe("claude-code-agent");
  });

  it("resolves 'codex' to 'codex'", () => {
    expect(resolveDialectName("codex")).toBe("codex");
  });

  it("resolves '.codex' to 'codex'", () => {
    expect(resolveDialectName(".codex")).toBe("codex");
  });

  it("resolves 'aider' to 'aider'", () => {
    expect(resolveDialectName("aider")).toBe("aider");
  });

  it("resolves '.aider' to 'aider'", () => {
    expect(resolveDialectName(".aider")).toBe("aider");
  });

  it("resolves 'mcp' to 'mcp-agent'", () => {
    expect(resolveDialectName("mcp")).toBe("mcp-agent");
  });

  it("resolves '.mcp' to 'mcp-agent'", () => {
    expect(resolveDialectName(".mcp")).toBe("mcp-agent");
  });

  it("resolves 'mcp-agent' to 'mcp-agent'", () => {
    expect(resolveDialectName("mcp-agent")).toBe("mcp-agent");
  });

  it("resolves 'mason' to 'mason'", () => {
    expect(resolveDialectName("mason")).toBe("mason");
  });

  it("resolves '.mason' to 'mason'", () => {
    expect(resolveDialectName(".mason")).toBe("mason");
  });

  it("returns undefined for unknown input 'gpt'", () => {
    expect(resolveDialectName("gpt")).toBeUndefined();
  });

  it("returns undefined for unknown input '.unknown'", () => {
    expect(resolveDialectName(".unknown")).toBeUndefined();
  });

  it("returns undefined for empty string", () => {
    expect(resolveDialectName("")).toBeUndefined();
  });
});
