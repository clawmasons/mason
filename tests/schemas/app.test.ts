import { describe, it, expect } from "vitest";
import { appPamFieldSchema } from "../../src/schemas/app.js";

describe("appPamFieldSchema", () => {
  it("validates a valid stdio app", () => {
    const result = appPamFieldSchema.safeParse({
      type: "app",
      transport: "stdio",
      command: "npx",
      args: ["-y", "@modelcontextprotocol/server-github"],
      tools: ["create_issue"],
      capabilities: ["tools"],
    });
    expect(result.success).toBe(true);
  });

  it("validates a valid remote SSE app", () => {
    const result = appPamFieldSchema.safeParse({
      type: "app",
      transport: "sse",
      url: "https://mcp.amap.com/sse?key=abc",
      tools: ["get_directions", "search_places"],
      capabilities: ["tools"],
    });
    expect(result.success).toBe(true);
  });

  it("validates a valid streamable-http app", () => {
    const result = appPamFieldSchema.safeParse({
      type: "app",
      transport: "streamable-http",
      url: "https://example.com/mcp",
      tools: ["some_tool"],
      capabilities: ["tools"],
    });
    expect(result.success).toBe(true);
  });

  it("rejects stdio app missing command", () => {
    const result = appPamFieldSchema.safeParse({
      type: "app",
      transport: "stdio",
      tools: ["foo"],
      capabilities: ["tools"],
    });
    expect(result.success).toBe(false);
  });

  it("rejects sse app missing url", () => {
    const result = appPamFieldSchema.safeParse({
      type: "app",
      transport: "sse",
      tools: ["foo"],
      capabilities: ["tools"],
    });
    expect(result.success).toBe(false);
  });

  it("preserves env variables with interpolation syntax", () => {
    const result = appPamFieldSchema.safeParse({
      type: "app",
      transport: "stdio",
      command: "npx",
      args: ["-y", "@modelcontextprotocol/server-github"],
      env: { GITHUB_PERSONAL_ACCESS_TOKEN: "${GITHUB_TOKEN}" },
      tools: ["create_issue"],
      capabilities: ["resources", "tools"],
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.env).toEqual({
        GITHUB_PERSONAL_ACCESS_TOKEN: "${GITHUB_TOKEN}",
      });
    }
  });

  it("validates PRD example: @clawforge/app-github", () => {
    const result = appPamFieldSchema.safeParse({
      type: "app",
      transport: "stdio",
      command: "npx",
      args: ["-y", "@modelcontextprotocol/server-github"],
      env: {
        GITHUB_PERSONAL_ACCESS_TOKEN: "${GITHUB_TOKEN}",
      },
      tools: [
        "create_issue",
        "list_repos",
        "create_pr",
        "get_pr",
        "create_review",
        "add_label",
        "delete_repo",
        "transfer_repo",
      ],
      capabilities: ["resources", "tools"],
    });
    expect(result.success).toBe(true);
  });

  it("validates PRD example: @clawforge/app-amap", () => {
    const result = appPamFieldSchema.safeParse({
      type: "app",
      transport: "sse",
      url: "https://mcp.amap.com/sse?key=${AMAP_KEY}",
      tools: ["get_directions", "search_places"],
      capabilities: ["tools"],
    });
    expect(result.success).toBe(true);
  });

  it("accepts optional description", () => {
    const result = appPamFieldSchema.safeParse({
      type: "app",
      transport: "stdio",
      command: "npx",
      args: [],
      tools: ["t"],
      capabilities: ["tools"],
      description: "A test app",
    });
    expect(result.success).toBe(true);
  });
});
