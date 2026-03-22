/**
 * Integration tests: Config Resolution + Storage + Prompting Pipeline
 *
 * Verifies that resolveConfig, promptConfig, saveAgentConfig, getAgentConfig,
 * and credentialsFn work together as a cohesive system.
 */

import { describe, it, expect, vi } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import type { AgentConfigSchema, ConfigField, ConfigOption } from "@clawmasons/agent-sdk";
import { getAgentConfig, saveAgentConfig } from "@clawmasons/agent-sdk";
import { resolveConfig } from "../../src/config/resolve-config.js";
import { promptConfig, ConfigResolutionError, type PromptFn } from "../../src/config/prompt-config.js";
import piCodingAgent from "@clawmasons/pi-coding-agent";

// ── Helpers ──────────────────────────────────────────────────────────

function makeTmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "config-integration-test-"));
}

function writeMasonConfig(dir: string, content: unknown): void {
  const masonDir = path.join(dir, ".mason");
  fs.mkdirSync(masonDir, { recursive: true });
  fs.writeFileSync(path.join(masonDir, "config.json"), JSON.stringify(content, null, 2));
}

function createMockPromptFn(answers: Record<string, string>): PromptFn {
  return vi.fn(async (field: ConfigField) => {
    const answer = answers[field.key];
    if (answer === undefined) {
      throw new Error(`No mock answer for field "${field.key}"`);
    }
    return answer;
  });
}

// Use the real Pi agent's config schema
const piSchema = piCodingAgent.configSchema!;

// ── Tests ────────────────────────────────────────────────────────────

describe("config resolution + storage pipeline", () => {
  it("full pipeline: resolve -> prompt -> save -> re-resolve", async () => {
    const tmpDir = makeTmpDir();
    try {
      writeMasonConfig(tmpDir, {
        agents: {
          "pi-coding-agent": { package: "@clawmasons/pi-coding-agent" },
        },
      });

      // Step 1: Resolve with empty config — all fields missing
      const stored1 = getAgentConfig(tmpDir, "pi-coding-agent");
      const result1 = resolveConfig(piSchema, stored1);
      expect(result1.missing).toHaveLength(2);
      expect(result1.missing[0].key).toBe("provider");
      expect(result1.missing[1].key).toBe("model");

      // Step 2: Prompt for all missing fields
      const mockPrompt = createMockPromptFn({
        provider: "openrouter",
        model: "anthropic/claude-sonnet-4",
      });
      const promptResult = await promptConfig(piSchema, stored1, "pi-coding-agent", mockPrompt, true);

      expect(promptResult.resolved).toEqual({
        "llm.provider": "openrouter",
        "llm.model": "anthropic/claude-sonnet-4",
      });
      expect(promptResult.newValues).toEqual({
        llm: { provider: "openrouter", model: "anthropic/claude-sonnet-4" },
      });

      // Step 3: Save the new values
      saveAgentConfig(tmpDir, "pi-coding-agent", promptResult.newValues);

      // Step 4: Re-resolve — all fields should be resolved, no missing
      const stored2 = getAgentConfig(tmpDir, "pi-coding-agent");
      const result2 = resolveConfig(piSchema, stored2);
      expect(result2.missing).toHaveLength(0);
      expect(result2.resolved).toEqual({
        "llm.provider": "openrouter",
        "llm.model": "anthropic/claude-sonnet-4",
      });
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("partial config: stored provider, prompt model only", async () => {
    const tmpDir = makeTmpDir();
    try {
      writeMasonConfig(tmpDir, {
        agents: {
          "pi-coding-agent": {
            package: "@clawmasons/pi-coding-agent",
            config: { llm: { provider: "openai" } },
          },
        },
      });

      const stored = getAgentConfig(tmpDir, "pi-coding-agent");
      const mockPrompt = createMockPromptFn({ model: "gpt-4o" });

      const result = await promptConfig(piSchema, stored, "pi-coding-agent", mockPrompt, true);

      expect(result.resolved).toEqual({
        "llm.provider": "openai",
        "llm.model": "gpt-4o",
      });
      // Only model was newly prompted
      expect(result.newValues).toEqual({
        llm: { model: "gpt-4o" },
      });
      expect(mockPrompt).toHaveBeenCalledTimes(1);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("optionsFn receives stored values from prior fields", async () => {
    const tmpDir = makeTmpDir();
    try {
      writeMasonConfig(tmpDir, {
        agents: {
          "pi-coding-agent": {
            package: "@clawmasons/pi-coding-agent",
            config: { llm: { provider: "openrouter" } },
          },
        },
      });

      const stored = getAgentConfig(tmpDir, "pi-coding-agent");
      let receivedOptions: ConfigOption[] = [];

      const mockPrompt: PromptFn = vi.fn(async (_field: ConfigField, options: ConfigOption[]) => {
        receivedOptions = options;
        return "anthropic/claude-sonnet-4";
      });

      await promptConfig(piSchema, stored, "pi-coding-agent", mockPrompt, true);

      // The model's optionsFn should have been called with { provider: "openrouter" }
      // and returned the openrouter-specific options
      expect(receivedOptions).toHaveLength(3); // OpenRouter has 3 models in Pi's schema
      expect(receivedOptions.map(o => o.value)).toContain("anthropic/claude-sonnet-4");
      expect(receivedOptions.map(o => o.value)).toContain("openai/gpt-4o");
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("optionsFn receives just-prompted values when both fields missing", async () => {
    const tmpDir = makeTmpDir();
    try {
      writeMasonConfig(tmpDir, {
        agents: {
          "pi-coding-agent": { package: "@clawmasons/pi-coding-agent" },
        },
      });

      const stored = getAgentConfig(tmpDir, "pi-coding-agent");
      let modelOptionsReceived: ConfigOption[] = [];

      const mockPrompt: PromptFn = vi.fn(async (field: ConfigField, options: ConfigOption[]) => {
        if (field.key === "provider") return "openai";
        modelOptionsReceived = options;
        return "gpt-4o";
      });

      await promptConfig(piSchema, stored, "pi-coding-agent", mockPrompt, true);

      // The model's optionsFn should have been called with { provider: "openai" }
      // and returned the OpenAI-specific options
      expect(modelOptionsReceived).toHaveLength(2); // OpenAI has 2 models in Pi's schema
      expect(modelOptionsReceived.map(o => o.value)).toContain("gpt-4o");
      expect(modelOptionsReceived.map(o => o.value)).toContain("gpt-4o-mini");
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("non-interactive error with partial stored config lists only missing fields", async () => {
    const tmpDir = makeTmpDir();
    try {
      writeMasonConfig(tmpDir, {
        agents: {
          "pi-coding-agent": {
            package: "@clawmasons/pi-coding-agent",
            config: { llm: { provider: "openrouter" } },
          },
        },
      });

      const stored = getAgentConfig(tmpDir, "pi-coding-agent");

      try {
        await promptConfig(piSchema, stored, "pi-coding-agent", vi.fn(), false);
        expect.fail("Should have thrown ConfigResolutionError");
      } catch (err) {
        expect(err).toBeInstanceOf(ConfigResolutionError);
        const cre = err as ConfigResolutionError;
        expect(cre.agentName).toBe("pi-coding-agent");
        // Only model is missing — provider is stored
        expect(cre.missingFields).toHaveLength(1);
        expect(cre.missingFields[0].key).toBe("model");
        expect(cre.message).toContain("llm.model");
        expect(cre.message).not.toContain("llm.provider");
      }
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("credentialsFn integration: resolved config maps to correct API key", async () => {
    const tmpDir = makeTmpDir();
    try {
      writeMasonConfig(tmpDir, {
        agents: {
          "pi-coding-agent": {
            package: "@clawmasons/pi-coding-agent",
            config: { llm: { provider: "openrouter", model: "anthropic/claude-sonnet-4" } },
          },
        },
      });

      const stored = getAgentConfig(tmpDir, "pi-coding-agent");
      const result = resolveConfig(piSchema, stored);
      expect(result.missing).toHaveLength(0);

      // Call credentialsFn with the resolved flat map
      const creds = piCodingAgent.credentialsFn!(result.resolved);

      expect(creds).toHaveLength(1);
      expect(creds[0].key).toBe("OPENROUTER_API_KEY");
      expect(creds[0].type).toBe("env");
      expect(creds[0].label).toBe("openrouter API Key");
      expect(creds[0].obtainUrl).toBe("https://openrouter.ai/keys");
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("credentialsFn returns provider-specific key for different providers", () => {
    // OpenAI provider
    const openaiCreds = piCodingAgent.credentialsFn!({ "llm.provider": "openai", "llm.model": "gpt-4o" });
    expect(openaiCreds[0].key).toBe("OPENAI_API_KEY");
    expect(openaiCreds[0].obtainUrl).toBeUndefined();

    // Together provider
    const togetherCreds = piCodingAgent.credentialsFn!({ "llm.provider": "together", "llm.model": "some-model" });
    expect(togetherCreds[0].key).toBe("TOGETHER_API_KEY");
  });

  it("config reconfiguration: delete config, re-resolve shows missing", async () => {
    const tmpDir = makeTmpDir();
    try {
      // Start with full config
      writeMasonConfig(tmpDir, {
        agents: {
          "pi-coding-agent": {
            package: "@clawmasons/pi-coding-agent",
            config: { llm: { provider: "openrouter", model: "anthropic/claude-sonnet-4" } },
          },
        },
      });

      // Verify it resolves fully
      const stored1 = getAgentConfig(tmpDir, "pi-coding-agent");
      const result1 = resolveConfig(piSchema, stored1);
      expect(result1.missing).toHaveLength(0);

      // Delete the config (simulate reconfiguration)
      const configPath = path.join(tmpDir, ".mason", "config.json");
      const raw = JSON.parse(fs.readFileSync(configPath, "utf-8"));
      delete raw.agents["pi-coding-agent"].config;
      fs.writeFileSync(configPath, JSON.stringify(raw, null, 2));

      // Re-resolve — all fields should be missing
      const stored2 = getAgentConfig(tmpDir, "pi-coding-agent");
      const result2 = resolveConfig(piSchema, stored2);
      expect(result2.missing).toHaveLength(2);
      expect(result2.missing[0].key).toBe("provider");
      expect(result2.missing[1].key).toBe("model");
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("third-party agent simulation: custom configSchema through pipeline", async () => {
    const tmpDir = makeTmpDir();
    try {
      const customSchema: AgentConfigSchema = {
        groups: [
          {
            key: "database",
            label: "Database Settings",
            fields: [
              {
                key: "dialect",
                label: "Database Dialect",
                options: [
                  { label: "PostgreSQL", value: "postgres" },
                  { label: "MySQL", value: "mysql" },
                ],
              },
              {
                key: "host",
                label: "Database Host",
                default: "localhost",
              },
              {
                key: "port",
                label: "Database Port",
                required: false,
              },
            ],
          },
        ],
      };

      writeMasonConfig(tmpDir, {
        agents: {
          "custom-agent": { package: "@acme/custom-agent" },
        },
      });

      const stored = getAgentConfig(tmpDir, "custom-agent");
      // In interactive mode, optional fields are also prompted
      const mockPrompt = createMockPromptFn({ dialect: "postgres", port: "5432" });

      const result = await promptConfig(customSchema, stored, "custom-agent", mockPrompt, true);

      // dialect: prompted, host: default, port: prompted (optional but interactive)
      expect(result.resolved).toEqual({
        "database.dialect": "postgres",
        "database.host": "localhost",
        "database.port": "5432",
      });
      expect(result.newValues).toEqual({
        database: { dialect: "postgres", port: "5432" },
      });
      // dialect and port were prompted (host had default)
      expect(mockPrompt).toHaveBeenCalledTimes(2);

      // Save and verify round-trip
      saveAgentConfig(tmpDir, "custom-agent", result.newValues);
      const stored2 = getAgentConfig(tmpDir, "custom-agent");
      const result2 = resolveConfig(customSchema, stored2);
      // dialect and port are now stored, host uses default
      expect(result2.missing).toHaveLength(0);
      expect(result2.resolved["database.dialect"]).toBe("postgres");
      expect(result2.resolved["database.host"]).toBe("localhost");
      expect(result2.resolved["database.port"]).toBe("5432");
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("default values bypass prompting entirely", async () => {
    const schema: AgentConfigSchema = {
      groups: [
        {
          key: "opts",
          label: "Options",
          fields: [
            { key: "theme", label: "Theme", default: "dark" },
            { key: "lang", label: "Language", default: "en" },
          ],
        },
      ],
    };

    const mockPrompt = vi.fn();
    const result = await promptConfig(schema, {}, "my-agent", mockPrompt, true);

    expect(result.resolved).toEqual({
      "opts.theme": "dark",
      "opts.lang": "en",
    });
    expect(result.newValues).toEqual({});
    expect(mockPrompt).not.toHaveBeenCalled();
  });

  it("multiple groups resolve independently", async () => {
    const schema: AgentConfigSchema = {
      groups: [
        {
          key: "llm",
          label: "LLM",
          fields: [{ key: "provider", label: "Provider" }],
        },
        {
          key: "db",
          label: "Database",
          fields: [{ key: "host", label: "Host" }],
        },
      ],
    };

    const stored = { llm: { provider: "openai" } };
    const mockPrompt = createMockPromptFn({ host: "localhost" });

    const result = await promptConfig(schema, stored, "multi-agent", mockPrompt, true);

    expect(result.resolved).toEqual({
      "llm.provider": "openai",
      "db.host": "localhost",
    });
    expect(result.newValues).toEqual({
      db: { host: "localhost" },
    });
    // Only db.host was prompted
    expect(mockPrompt).toHaveBeenCalledTimes(1);
  });
});
