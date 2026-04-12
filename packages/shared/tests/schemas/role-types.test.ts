import { describe, it, expect } from "vitest";
import { mcpServerConfigSchema, channelConfigSchema, channelFieldSchema, roleSchema } from "@clawmasons/shared";

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

// ---------------------------------------------------------------------------
// channelConfigSchema
// ---------------------------------------------------------------------------

describe("channelConfigSchema", () => {
  it("accepts { type: 'slack' } and defaults args to []", () => {
    const result = channelConfigSchema.parse({ type: "slack" });
    expect(result.type).toBe("slack");
    expect(result.args).toEqual([]);
  });

  it("accepts { type: 'slack', args: ['--flag'] }", () => {
    const result = channelConfigSchema.parse({ type: "slack", args: ["--flag"] });
    expect(result.type).toBe("slack");
    expect(result.args).toEqual(["--flag"]);
  });

  it("rejects missing type field", () => {
    const result = channelConfigSchema.safeParse({ args: [] });
    expect(result.success).toBe(false);
  });

  it("accepts any type string", () => {
    const result = channelConfigSchema.parse({ type: "telegram" });
    expect(result.type).toBe("telegram");
    expect(result.args).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// channelFieldSchema
// ---------------------------------------------------------------------------

describe("channelFieldSchema", () => {
  it("accepts a plain string", () => {
    const result = channelFieldSchema.parse("slack");
    expect(result).toBe("slack");
  });

  it("accepts an object with type and args", () => {
    const result = channelFieldSchema.parse({ type: "slack", args: ["--debug"] });
    expect(result).toEqual({ type: "slack", args: ["--debug"] });
  });

  it("accepts an object with type only", () => {
    const result = channelFieldSchema.parse({ type: "slack" });
    expect(result).toEqual({ type: "slack", args: [] });
  });
});

// ---------------------------------------------------------------------------
// roleSchema — channel field
// ---------------------------------------------------------------------------

describe("roleSchema — channel field", () => {
  const minimalRoleData = {
    metadata: { name: "test", description: "A test" },
    instructions: "Do things.",
    source: { type: "local", agentDialect: "claude-code-agent", path: "/tmp" },
  };

  it("accepts role with channel field (object form)", () => {
    const result = roleSchema.parse({
      ...minimalRoleData,
      channel: { type: "slack", args: ["--flag"] },
    });
    expect(result.channel).toEqual({ type: "slack", args: ["--flag"] });
  });

  it("accepts role with channel field (string form) and normalizes to object", () => {
    const result = roleSchema.parse({
      ...minimalRoleData,
      channel: "slack",
    });
    // String form is normalized to object form by the schema's preprocess
    expect(result.channel).toEqual({ type: "slack", args: [] });
  });

  it("accepts role without channel field", () => {
    const result = roleSchema.parse(minimalRoleData);
    expect(result.channel).toBeUndefined();
  });
});
