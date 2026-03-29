import { describe, it, expect } from "vitest";
import { mcpServerConfigSchema } from "@clawmasons/shared";

describe("mcpServerConfigSchema — location field", () => {
  it("accepts location: 'proxy'", () => {
    const result = mcpServerConfigSchema.parse({ name: "test", location: "proxy" });
    expect(result.location).toBe("proxy");
  });

  it("accepts location: 'host'", () => {
    const result = mcpServerConfigSchema.parse({ name: "test", location: "host" });
    expect(result.location).toBe("host");
  });

  it("defaults location to 'proxy' when omitted", () => {
    const result = mcpServerConfigSchema.parse({ name: "test" });
    expect(result.location).toBe("proxy");
  });

  it("rejects invalid location values", () => {
    const result = mcpServerConfigSchema.safeParse({
      name: "test",
      location: "invalid",
    });
    expect(result.success).toBe(false);
  });

  it("preserves location through full app config", () => {
    const result = mcpServerConfigSchema.parse({
      name: "xcode-sim",
      transport: "stdio",
      command: "npx",
      args: ["-y", "@anthropic/xcode-mcp-server"],
      location: "host",
      tools: { allow: ["run_simulator"] },
      credentials: ["XCODE_TOKEN"],
    });
    expect(result.location).toBe("host");
    expect(result.name).toBe("xcode-sim");
    expect(result.transport).toBe("stdio");
    expect(result.credentials).toEqual(["XCODE_TOKEN"]);
  });
});
