import { describe, it, expect } from "vitest";
import { appChapterFieldSchema } from "@clawmasons/shared";

describe("appChapterFieldSchema", () => {
  it("validates a valid stdio app", () => {
    const result = appChapterFieldSchema.safeParse({
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
    const result = appChapterFieldSchema.safeParse({
      type: "app",
      transport: "sse",
      url: "https://mcp.amap.com/sse?key=abc",
      tools: ["get_directions", "search_places"],
      capabilities: ["tools"],
    });
    expect(result.success).toBe(true);
  });

  it("validates a valid streamable-http app", () => {
    const result = appChapterFieldSchema.safeParse({
      type: "app",
      transport: "streamable-http",
      url: "https://example.com/mcp",
      tools: ["some_tool"],
      capabilities: ["tools"],
    });
    expect(result.success).toBe(true);
  });

  it("rejects stdio app missing command", () => {
    const result = appChapterFieldSchema.safeParse({
      type: "app",
      transport: "stdio",
      tools: ["foo"],
      capabilities: ["tools"],
    });
    expect(result.success).toBe(false);
  });

  it("rejects sse app missing url", () => {
    const result = appChapterFieldSchema.safeParse({
      type: "app",
      transport: "sse",
      tools: ["foo"],
      capabilities: ["tools"],
    });
    expect(result.success).toBe(false);
  });

  it("preserves env variables with interpolation syntax", () => {
    const result = appChapterFieldSchema.safeParse({
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

  it("validates PRD example: @clawmasons/app-github", () => {
    const result = appChapterFieldSchema.safeParse({
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

  it("validates PRD example: @clawmasons/app-amap", () => {
    const result = appChapterFieldSchema.safeParse({
      type: "app",
      transport: "sse",
      url: "https://mcp.amap.com/sse?key=${AMAP_KEY}",
      tools: ["get_directions", "search_places"],
      capabilities: ["tools"],
    });
    expect(result.success).toBe(true);
  });

  it("validates credentials as array of strings", () => {
    const result = appChapterFieldSchema.safeParse({
      type: "app",
      transport: "stdio",
      command: "npx",
      args: ["-y", "server"],
      tools: ["t"],
      capabilities: ["tools"],
      credentials: ["API_KEY", "SECRET"],
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.credentials).toEqual(["API_KEY", "SECRET"]);
    }
  });

  it("rejects non-string items in credentials array", () => {
    const result = appChapterFieldSchema.safeParse({
      type: "app",
      transport: "stdio",
      command: "npx",
      args: ["-y", "server"],
      tools: ["t"],
      capabilities: ["tools"],
      credentials: [123],
    });
    expect(result.success).toBe(false);
  });

  it("defaults credentials to empty array when omitted", () => {
    const result = appChapterFieldSchema.safeParse({
      type: "app",
      transport: "stdio",
      command: "npx",
      args: ["-y", "server"],
      tools: ["t"],
      capabilities: ["tools"],
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.credentials).toEqual([]);
    }
  });

  it("accepts optional description", () => {
    const result = appChapterFieldSchema.safeParse({
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
