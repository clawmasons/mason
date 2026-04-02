import { describe, it, expect } from "vitest";
import { program } from "../../src/cli/index.js";

// ── Command Registration Tests ──────────────────────────────────────

describe("proxy command", () => {
  const proxyCmd = program.commands.find((cmd) => cmd.name() === "proxy");

  it("is registered", () => {
    expect(proxyCmd).toBeDefined();
  });

  it("has a description", () => {
    expect(proxyCmd?.description()).toContain("proxy");
  });

  it("has --port option", () => {
    const opt = proxyCmd?.options.find((o) => o.long === "--port");
    expect(opt).toBeDefined();
  });

  it("has --startup-timeout option", () => {
    const opt = proxyCmd?.options.find((o) => o.long === "--startup-timeout");
    expect(opt).toBeDefined();
  });

  it("has --transport option", () => {
    const opt = proxyCmd?.options.find((o) => o.long === "--transport");
    expect(opt).toBeDefined();
  });
});
