import * as fs from "node:fs";
import * as path from "node:path";

/**
 * Check if a .gitignore file contains a given pattern.
 * Performs exact line match against trimmed, non-empty lines.
 * Returns false if the file does not exist.
 */
export function hasGitignoreEntry(
  gitignorePath: string,
  pattern: string,
): boolean {
  if (!fs.existsSync(gitignorePath)) {
    return false;
  }

  const content = fs.readFileSync(gitignorePath, "utf-8");
  const lines = content.split("\n");
  return lines.some((line) => line.trim() === pattern);
}

/**
 * Ensure a pattern is present in the .gitignore at the given directory.
 * If the directory has a .gitignore and the pattern is not already present,
 * appends the pattern on a new line.
 *
 * Returns true if the pattern was appended, false if already present
 * or no .gitignore exists in the directory.
 */
export function ensureGitignoreEntry(dir: string, pattern: string): boolean {
  const gitignorePath = path.join(dir, ".gitignore");

  if (!fs.existsSync(gitignorePath)) {
    return false;
  }

  if (hasGitignoreEntry(gitignorePath, pattern)) {
    return false;
  }

  const content = fs.readFileSync(gitignorePath, "utf-8");
  const prefix = content.length > 0 && !content.endsWith("\n") ? "\n" : "";
  fs.appendFileSync(gitignorePath, `${prefix}${pattern}\n`, "utf-8");
  return true;
}
