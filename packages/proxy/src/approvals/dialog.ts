import { exec } from "node:child_process";

// ── Escaping ──────────────────────────────────────────────────────────

/**
 * Escape a string for use inside an AppleScript double-quoted string literal.
 * Replaces backslashes with double-backslashes and double-quotes with escaped
 * double-quotes to prevent osascript command injection.
 */
export function escapeForOsascript(str: string): string {
  return str.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

// ── Dialog ────────────────────────────────────────────────────────────

/**
 * Show a native macOS approval dialog via osascript.
 *
 * On non-macOS platforms, auto-approves with a console warning.
 *
 * @param toolName - The prefixed tool name being called
 * @param args - JSON-encoded arguments (optional)
 * @param agentName - The name of the agent requesting approval
 * @returns `true` if approved, `false` if denied or dialog closed
 */
export async function showApprovalDialog(
  toolName: string,
  args: string | undefined,
  agentName: string,
): Promise<boolean> {
  if (process.platform !== "darwin") {
    console.warn(
      `[mason] approval auto-approved on ${process.platform} (osascript dialogs are macOS-only): ${toolName}`,
    );
    return true;
  }

  const escapedAgent = escapeForOsascript(agentName);
  const escapedTool = escapeForOsascript(toolName);
  const argsDisplay = args
    ? `\\n\\nArguments:\\n${escapeForOsascript(args)}`
    : "";

  const script = `display dialog "Agent '${escapedAgent}' wants to call ${escapedTool}${argsDisplay}" buttons {"Deny", "Approve"} default button "Approve" with title "Mason — Tool Approval"`;

  return new Promise<boolean>((resolve) => {
    exec(`osascript -e '${script}'`, (error, stdout) => {
      if (error) {
        // Dialog was closed or user cancelled — treat as denied
        resolve(false);
        return;
      }
      resolve(stdout.includes("Approve"));
    });
  });
}
