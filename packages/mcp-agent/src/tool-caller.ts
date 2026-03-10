/**
 * Shared tool-calling logic for the MCP agent.
 *
 * Provides command parsing, tool invocation, result formatting,
 * and help generation used by both REPL and ACP modes.
 */

// ── Types ─────────────────────────────────────────────────────────────

export interface ToolDefinition {
  name: string;
  description?: string;
}

export interface ToolCallResult {
  content: Array<{ type: string; text: string }>;
  isError?: boolean;
}

/**
 * Abstraction over the MCP client for tool operations.
 */
export interface ToolCaller {
  listTools(): Promise<ToolDefinition[]>;
  callTool(name: string, args: Record<string, unknown>): Promise<ToolCallResult>;
}

// ── Parsed Command Types ──────────────────────────────────────────────

export type ParsedCommand =
  | { type: "list" }
  | { type: "exit" }
  | { type: "help" }
  | { type: "call"; toolName: string; args: Record<string, unknown> }
  | { type: "error"; message: string };

// ── Command Parsing ───────────────────────────────────────────────────

/**
 * Parse a user input string into a structured command.
 *
 * Recognized commands:
 * - "list" — list available tools
 * - "exit" — exit the agent
 * - "help" — show help message
 * - "<tool_name>" — call tool with empty args
 * - "<tool_name> <json>" — call tool with JSON args
 */
export function parseCommand(input: string): ParsedCommand {
  const trimmed = input.trim();

  if (!trimmed) {
    return { type: "help" };
  }

  if (trimmed === "list") {
    return { type: "list" };
  }

  if (trimmed === "exit") {
    return { type: "exit" };
  }

  if (trimmed === "help") {
    return { type: "help" };
  }

  // Parse "<tool_name> <json_args>" or "<tool_name>"
  const spaceIdx = trimmed.indexOf(" ");
  if (spaceIdx === -1) {
    return { type: "call", toolName: trimmed, args: {} };
  }

  const toolName = trimmed.substring(0, spaceIdx);
  const argsStr = trimmed.substring(spaceIdx + 1).trim();

  try {
    const args = JSON.parse(argsStr) as Record<string, unknown>;
    if (typeof args !== "object" || args === null || Array.isArray(args)) {
      return { type: "error", message: "Arguments must be a JSON object, e.g. {\"key\": \"value\"}" };
    }
    return { type: "call", toolName, args };
  } catch {
    return {
      type: "error",
      message: `Invalid JSON arguments. Usage: ${toolName} {"key": "value"}`,
    };
  }
}

// ── Result Formatting ─────────────────────────────────────────────────

/**
 * Format a tool call result for display.
 */
export function formatResult(result: ToolCallResult): string {
  const text = result.content.map((c) => c.text).join("\n");
  if (result.isError) {
    return `Error: ${text}`;
  }
  return `Result: ${text}`;
}

// ── Help Formatting ───────────────────────────────────────────────────

/**
 * Generate a help message listing all available tools.
 */
export function formatHelp(tools: ToolDefinition[]): string {
  const lines: string[] = [];

  lines.push("[mcp-agent] Available commands:");
  lines.push("  list                        — List available MCP tools");
  lines.push("  help                        — Show this help message");
  lines.push("  <tool_name>                 — Call a tool with no arguments");
  lines.push('  <tool_name> {"key": "val"}  — Call a tool with JSON arguments');
  lines.push("  exit                        — Exit the agent");

  if (tools.length > 0) {
    lines.push("");
    lines.push("Available tools:");
    for (const tool of tools) {
      const desc = tool.description ? ` — ${tool.description}` : "";
      lines.push(`  - ${tool.name}${desc}`);
    }
  } else {
    lines.push("");
    lines.push("No tools available. Use 'list' to refresh.");
  }

  return lines.join("\n");
}

// ── Command Execution ─────────────────────────────────────────────────

/**
 * Execute a parsed command using the provided tool caller.
 *
 * Returns the output string and whether the agent should exit.
 */
export async function executeCommand(
  input: string,
  caller: ToolCaller,
  cachedTools?: ToolDefinition[],
): Promise<{ output: string; exit: boolean }> {
  const command = parseCommand(input);

  switch (command.type) {
    case "exit":
      return { output: "[mcp-agent] Goodbye.", exit: true };

    case "list": {
      try {
        const tools = await caller.listTools();
        if (tools.length === 0) {
          return { output: "No tools available.", exit: false };
        }
        const lines = ["Available tools:"];
        for (const tool of tools) {
          const desc = tool.description ? ` — ${tool.description}` : "";
          lines.push(`  - ${tool.name}${desc}`);
        }
        return { output: lines.join("\n"), exit: false };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return { output: `[mcp-agent] Error listing tools: ${msg}`, exit: false };
      }
    }

    case "help": {
      const tools = cachedTools ?? [];
      return { output: formatHelp(tools), exit: false };
    }

    case "error":
      return { output: `[mcp-agent] ${command.message}`, exit: false };

    case "call": {
      try {
        const result = await caller.callTool(command.toolName, command.args);
        return { output: formatResult(result), exit: false };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        // If the tool call fails, show help with available tools
        if (cachedTools && cachedTools.length > 0) {
          return {
            output: `[mcp-agent] Error: ${msg}\n\n${formatHelp(cachedTools)}`,
            exit: false,
          };
        }
        return { output: `[mcp-agent] Error: ${msg}`, exit: false };
      }
    }
  }
}
