import { describe, it, expect } from "vitest";
import { convertMcpFormat } from "../src/mcp-name-rewriter.js";

describe("convertMcpFormat", () => {
  it("strips mcp__ prefix with default template", () => {
    expect(convertMcpFormat("mcp__filesystem__read_file")).toBe(
      "filesystem_read_file",
    );
  });

  it("rewrites to claude-code template with mason prefix", () => {
    const template = "mcp__mason__${server}_${tool}";
    expect(convertMcpFormat("mcp__filesystem__read_file", template)).toBe(
      "mcp__mason__filesystem_read_file",
    );
  });

  it("rewrites to pi-coding-agent template", () => {
    const template = "${server}_${tool}";
    expect(convertMcpFormat("mcp__filesystem__read_file", template)).toBe(
      "filesystem_read_file",
    );
  });

  it("replaces multiple references in one string", () => {
    const input = "Use mcp__fs__read and mcp__fs__write to manage files";
    expect(convertMcpFormat(input)).toBe(
      "Use fs_read and fs_write to manage files",
    );
  });

  it("returns input unchanged when no mcp__ patterns exist", () => {
    const input = "No MCP references here, just regular text";
    expect(convertMcpFormat(input)).toBe(input);
  });

  it("handles tool names with underscores", () => {
    expect(convertMcpFormat("mcp__mason__filesystem_read_file")).toBe(
      "mason_filesystem_read_file",
    );
  });

  it("handles multiline content", () => {
    const input = `Use mcp__fs__read_file to read
and mcp__fs__write_file to write`;
    const expected = `Use fs_read_file to read
and fs_write_file to write`;
    expect(convertMcpFormat(input)).toBe(expected);
  });
});
