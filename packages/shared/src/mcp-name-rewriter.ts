/**
 * Rewrites MCP tool name references from the canonical `mcp__{server}__{tool}`
 * format to an agent-specific naming convention.
 *
 * @param input - Text containing MCP tool name references
 * @param template - Target format using `${server}` and `${tool}` placeholders.
 *                   Defaults to `${server}_${tool}` (strips the `mcp__` prefix).
 * @returns Text with all MCP tool name references rewritten
 */
export function convertMcpFormat(
  input: string,
  template: string = "${server}_${tool}",
): string {
  return input.replace(
    /mcp__([^_]+)__(\w+)/g,
    (_, server, tool) =>
      template
        .replace("${server}", server)
        .replace("${tool}", tool),
  );
}
