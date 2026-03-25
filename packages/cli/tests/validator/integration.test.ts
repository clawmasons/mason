/**
 * Integration tests: Delegated Agent Validation
 *
 * Verifies that validateAgent correctly delegates to real agent packages'
 * validate() functions through the registry, producing the expected
 * errors and warnings.
 */

import { describe, it, expect } from "vitest";
import { validateAgent } from "../../src/validator/validate.js";
import type { ResolvedAgent, ResolvedApp, ResolvedRole, ResolvedSkill, ResolvedTask } from "@clawmasons/shared";
import type { AgentPackage, AgentRegistry, AgentValidationResult } from "@clawmasons/agent-sdk";
import { mockPiCodingAgent, mockClaudeCodeAgent } from "../helpers/mock-agent-packages.js";

// ── Registry Setup ───────────────────────────────────────────────────

function createTestRegistry(): AgentRegistry {
  const registry: AgentRegistry = new Map();
  // Register by canonical name
  registry.set("pi-coding-agent", mockPiCodingAgent);
  registry.set("claude-code-agent", mockClaudeCodeAgent);
  // Register by alias
  if (mockPiCodingAgent.aliases) {
    for (const alias of mockPiCodingAgent.aliases) {
      registry.set(alias, mockPiCodingAgent);
    }
  }
  if (mockClaudeCodeAgent.aliases) {
    for (const alias of mockClaudeCodeAgent.aliases) {
      registry.set(alias, mockClaudeCodeAgent);
    }
  }
  return registry;
}

const testRegistry = createTestRegistry();

// ── Test Helpers ─────────────────────────────────────────────────────

function makeApp(overrides: Partial<ResolvedApp> = {}): ResolvedApp {
  return {
    name: "@test/app",
    version: "1.0.0",
    transport: "stdio",
    command: "npx",
    args: ["-y", "some-package"],
    tools: ["tool_a"],
    capabilities: ["tools"],
    credentials: [],
    location: "proxy",
    ...overrides,
  };
}

function makeRole(overrides: Partial<ResolvedRole> = {}): ResolvedRole {
  return {
    name: "@test/role",
    version: "1.0.0",
    risk: "LOW",
    description: "Test role",
    permissions: {
      "@test/app": { allow: ["tool_a"], deny: [] },
    },
    tasks: [] as ResolvedTask[],
    apps: [makeApp()],
    skills: [] as ResolvedSkill[],
    ...overrides,
  };
}

function makeAgent(overrides: Partial<ResolvedAgent> = {}): ResolvedAgent {
  return {
    name: "@test/agent",
    version: "1.0.0",
    agentName: "Test Agent",
    slug: "test-agent",
    runtimes: ["claude-code-agent"],
    credentials: [],
    roles: [makeRole()],
    ...overrides,
  };
}

// ── Tests ────────────────────────────────────────────────────────────

describe("delegated validation integration", () => {
  describe("Pi agent validation", () => {
    it("errors when pi-coding-agent runtime has no LLM config", () => {
      const agent = makeAgent({
        runtimes: ["pi-coding-agent"],
        // no llm
      });

      const result = validateAgent(agent, testRegistry);

      expect(result.valid).toBe(false);
      const llmErrors = result.errors.filter(e => e.category === "llm-config");
      expect(llmErrors).toHaveLength(1);
      expect(llmErrors[0].message).toContain("pi-coding-agent");
      expect(llmErrors[0].message).toContain("no LLM configuration");
    });

    it("passes when pi-coding-agent runtime has LLM config", () => {
      const agent = makeAgent({
        runtimes: ["pi-coding-agent"],
        llm: { provider: "openrouter", model: "anthropic/claude-sonnet-4" },
      });

      const result = validateAgent(agent, testRegistry);

      const llmErrors = result.errors.filter(e => e.category === "llm-config");
      expect(llmErrors).toHaveLength(0);
    });
  });

  describe("Claude agent validation", () => {
    it("warns when claude-code-agent runtime has LLM config", () => {
      const agent = makeAgent({
        runtimes: ["claude-code-agent"],
        llm: { provider: "openrouter", model: "anthropic/claude-sonnet-4" },
      });

      const result = validateAgent(agent, testRegistry);

      expect(result.valid).toBe(true);
      expect(result.warnings).toHaveLength(1);
      expect(result.warnings[0].category).toBe("llm-config");
      expect(result.warnings[0].message).toContain("claude-code-agent");
      expect(result.warnings[0].message).toContain("will be ignored");
    });

    it("no warning when claude-code-agent runtime has no LLM config", () => {
      const agent = makeAgent({
        runtimes: ["claude-code-agent"],
        // no llm — default behavior
      });

      const result = validateAgent(agent, testRegistry);

      expect(result.valid).toBe(true);
      expect(result.warnings).toHaveLength(0);
    });
  });

  describe("mixed runtimes", () => {
    it("Pi errors, Claude clean when no LLM config", () => {
      const agent = makeAgent({
        runtimes: ["pi-coding-agent", "claude-code-agent"],
        // no llm
      });

      const result = validateAgent(agent, testRegistry);

      expect(result.valid).toBe(false);
      const llmErrors = result.errors.filter(e => e.category === "llm-config");
      expect(llmErrors).toHaveLength(1);
      expect(llmErrors[0].context.runtime).toBe("pi-coding-agent");
      // No warning from claude-code-agent because no llm to warn about
      expect(result.warnings).toHaveLength(0);
    });

    it("Pi passes, Claude warns when LLM config present", () => {
      const agent = makeAgent({
        runtimes: ["pi-coding-agent", "claude-code-agent"],
        llm: { provider: "openrouter", model: "anthropic/claude-sonnet-4" },
      });

      const result = validateAgent(agent, testRegistry);

      expect(result.valid).toBe(true);
      const llmErrors = result.errors.filter(e => e.category === "llm-config");
      expect(llmErrors).toHaveLength(0);
      expect(result.warnings).toHaveLength(1);
      expect(result.warnings[0].context.runtime).toBe("claude-code-agent");
    });
  });

  describe("third-party agent validation", () => {
    it("simulated third-party agent validate runs through registry", () => {
      const thirdPartyPkg: AgentPackage = {
        name: "custom-agent",
        materializer: {
          name: "custom-agent",
          materializeWorkspace: () => new Map(),
        },
        validate: (agent): AgentValidationResult => {
          const errors = [];
          if (!agent.llm) {
            errors.push({
              category: "llm-config",
              message: `Custom agent "${agent.agentName}" requires LLM config.`,
              context: { agent: agent.name, runtime: "custom-agent" },
            });
          }
          return { errors, warnings: [] };
        },
      };

      const registry: AgentRegistry = new Map();
      registry.set("custom-agent", thirdPartyPkg);

      // Agent without LLM config
      const agent = makeAgent({
        runtimes: ["custom-agent"],
      });

      const result = validateAgent(agent, registry);
      expect(result.valid).toBe(false);
      const llmErrors = result.errors.filter(e => e.message.includes("Custom agent"));
      expect(llmErrors).toHaveLength(1);
      expect(llmErrors[0].message).toContain("requires LLM config");

      // Agent with LLM config
      const agentWithLlm = makeAgent({
        runtimes: ["custom-agent"],
        llm: { provider: "openai", model: "gpt-4o" },
      });

      const result2 = validateAgent(agentWithLlm, registry);
      const customErrors2 = result2.errors.filter(e => e.message.includes("Custom agent"));
      expect(customErrors2).toHaveLength(0);
    });
  });

  describe("alias resolution in registry", () => {
    it("validates when agent runtime uses alias 'pi' instead of canonical name", () => {
      const agent = makeAgent({
        runtimes: ["pi"], // alias, not canonical "pi-coding-agent"
      });

      const result = validateAgent(agent, testRegistry);

      // Pi's validate should still run (registry maps "pi" -> piCodingAgent)
      const llmErrors = result.errors.filter(e => e.category === "llm-config");
      expect(llmErrors).toHaveLength(1);
      expect(llmErrors[0].message).toContain("pi-coding-agent");
    });
  });
});
