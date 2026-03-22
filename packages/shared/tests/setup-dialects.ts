/**
 * Vitest setup file for shared package tests.
 *
 * Registers agent dialects that were previously hardcoded in dialect-registry.ts.
 * In production, the CLI calls registerAgentDialect() at init time from agent
 * packages. In tests, this setup file ensures the dialects are available.
 */
// Import directly from dialect-registry rather than @clawmasons/shared to avoid
// loading the full module tree (which includes global-npm-root.ts and would
// interfere with tests that mock child_process.exec).
import { registerAgentDialect } from "../src/role/dialect-registry.js";

registerAgentDialect({
  name: "claude-code-agent",
  dialect: "claude",
  dialectFields: { tasks: "commands" },
  tasks: {
    projectFolder: ".claude/commands",
    nameFormat: "{scopePath}/{taskName}.md",
    scopeFormat: "path",
    supportedFields: ["name->displayName", "description", "category", "tags"],
    prompt: "markdown-body",
  },
  skills: { projectFolder: ".claude/skills" },
});

registerAgentDialect({
  name: "mcp-agent",
  dialect: "mcp",
  dialectFields: { tasks: "commands" },
});

registerAgentDialect({
  name: "pi-coding-agent",
  dialect: "pi",
  dialectFields: { tasks: "prompts" },
  tasks: {
    projectFolder: ".pi/prompts",
    nameFormat: "{scopeKebab}-{taskName}.md",
    scopeFormat: "kebab-case-prefix",
    supportedFields: ["description"],
    prompt: "markdown-body",
  },
  skills: { projectFolder: "skills" },
});
