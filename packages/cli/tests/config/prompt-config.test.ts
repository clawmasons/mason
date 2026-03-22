import { describe, expect, it, vi } from "vitest";
import type { AgentConfigSchema, ConfigField, ConfigOption } from "@clawmasons/agent-sdk";
import { promptConfig, ConfigResolutionError, type PromptFn } from "../../src/config/prompt-config.js";

// ── Fixtures ──────────────────────────────────────────────────────────

const llmSchema: AgentConfigSchema = {
  groups: [
    {
      key: "llm",
      label: "LLM Settings",
      fields: [
        {
          key: "provider",
          label: "LLM Provider",
          hint: "The inference provider.",
          options: [
            { label: "OpenRouter", value: "openrouter" },
            { label: "OpenAI", value: "openai" },
          ],
        },
        {
          key: "model",
          label: "Model",
          hint: "The model identifier.",
          optionsFn: (resolved) => {
            if (resolved.provider === "openrouter") {
              return [
                { label: "Claude Sonnet 4", value: "anthropic/claude-sonnet-4" },
                { label: "GPT-4o", value: "openai/gpt-4o" },
              ];
            }
            return [];
          },
        },
      ],
    },
  ],
};

/**
 * Create a mock PromptFn that returns values from a predefined map.
 * Keys are "group.field" format.
 */
function createMockPromptFn(answers: Record<string, string>): PromptFn {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  return vi.fn(async (field: ConfigField, _options: ConfigOption[]) => {
    // Find the answer by field key — caller should use the field key
    const answer = answers[field.key];
    if (answer === undefined) {
      throw new Error(`No mock answer for field "${field.key}"`);
    }
    return answer;
  });
}

// ── promptConfig ──────────────────────────────────────────────────────

describe("promptConfig", () => {
  it("returns resolved config without prompting when all fields stored", async () => {
    const stored = {
      llm: { provider: "openrouter", model: "anthropic/claude-sonnet-4" },
    };
    const mockPrompt = vi.fn();

    const result = await promptConfig(llmSchema, stored, "pi-coding-agent", mockPrompt, true);

    expect(result.resolved).toEqual({
      "llm.provider": "openrouter",
      "llm.model": "anthropic/claude-sonnet-4",
    });
    expect(result.newValues).toEqual({});
    expect(mockPrompt).not.toHaveBeenCalled();
  });

  it("prompts for missing fields and returns new values", async () => {
    const mockPrompt = createMockPromptFn({
      provider: "openrouter",
      model: "anthropic/claude-sonnet-4",
    });

    const result = await promptConfig(llmSchema, {}, "pi-coding-agent", mockPrompt, true);

    expect(result.resolved).toEqual({
      "llm.provider": "openrouter",
      "llm.model": "anthropic/claude-sonnet-4",
    });
    expect(result.newValues).toEqual({
      llm: {
        provider: "openrouter",
        model: "anthropic/claude-sonnet-4",
      },
    });
    expect(mockPrompt).toHaveBeenCalledTimes(2);
  });

  it("prompts only for missing fields when partial config exists", async () => {
    const stored = { llm: { provider: "openai" } };
    const mockPrompt = createMockPromptFn({ model: "gpt-4o" });

    const result = await promptConfig(llmSchema, stored, "pi-coding-agent", mockPrompt, true);

    expect(result.resolved).toEqual({
      "llm.provider": "openai",
      "llm.model": "gpt-4o",
    });
    expect(result.newValues).toEqual({
      llm: { model: "gpt-4o" },
    });
    expect(mockPrompt).toHaveBeenCalledTimes(1);
  });

  it("passes computed options (from optionsFn) to promptFn", async () => {
    const stored = { llm: { provider: "openrouter" } };
    let receivedOptions: ConfigOption[] = [];

    const mockPrompt: PromptFn = vi.fn(async (_field: ConfigField, options: ConfigOption[]) => {
      receivedOptions = options;
      return "anthropic/claude-sonnet-4";
    });

    await promptConfig(llmSchema, stored, "pi-coding-agent", mockPrompt, true);

    expect(receivedOptions).toHaveLength(2);
    expect(receivedOptions[0].value).toBe("anthropic/claude-sonnet-4");
    expect(receivedOptions[1].value).toBe("openai/gpt-4o");
  });

  it("passes options from prior prompted values to optionsFn", async () => {
    // Provider is missing too — prompt it first, then model's optionsFn should see it
    let modelOptionsReceived: ConfigOption[] = [];
    const mockPrompt: PromptFn = vi.fn(async (field: ConfigField, options: ConfigOption[]) => {
      if (field.key === "provider") return "openrouter";
      modelOptionsReceived = options;
      return "anthropic/claude-sonnet-4";
    });

    await promptConfig(llmSchema, {}, "pi-coding-agent", mockPrompt, true);

    // The model's optionsFn should have been called with { provider: "openrouter" }
    // and returned the openrouter-specific options
    expect(modelOptionsReceived).toHaveLength(2);
    expect(modelOptionsReceived[0].value).toBe("anthropic/claude-sonnet-4");
  });

  it("throws ConfigResolutionError in non-interactive mode with missing fields", async () => {
    const mockPrompt = vi.fn();

    await expect(
      promptConfig(llmSchema, {}, "pi-coding-agent", mockPrompt, false),
    ).rejects.toThrow(ConfigResolutionError);

    expect(mockPrompt).not.toHaveBeenCalled();
  });

  it("ConfigResolutionError contains agent name and missing fields", async () => {
    try {
      await promptConfig(llmSchema, {}, "pi-coding-agent", vi.fn(), false);
      expect.fail("Should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(ConfigResolutionError);
      const cre = err as ConfigResolutionError;
      expect(cre.agentName).toBe("pi-coding-agent");
      expect(cre.missingFields).toHaveLength(2);
      expect(cre.missingFields[0].key).toBe("provider");
      expect(cre.missingFields[1].key).toBe("model");
      expect(cre.message).toContain("pi-coding-agent");
      expect(cre.message).toContain("llm.provider");
      expect(cre.message).toContain("llm.model");
    }
  });

  it("does not throw for optional missing fields in non-interactive mode", async () => {
    const schema: AgentConfigSchema = {
      groups: [
        {
          key: "opts",
          label: "Options",
          fields: [
            { key: "theme", label: "Theme", required: false },
            { key: "lang", label: "Language", required: false },
          ],
        },
      ],
    };

    const result = await promptConfig(schema, {}, "my-agent", vi.fn(), false);

    expect(result.resolved).toEqual({});
    expect(result.newValues).toEqual({});
  });

  it("returns newly prompted values in nested format for saveAgentConfig", async () => {
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

    const mockPrompt: PromptFn = vi.fn(async (field: ConfigField) => {
      if (field.key === "provider") return "openai";
      if (field.key === "host") return "localhost";
      throw new Error(`Unexpected field: ${field.key}`);
    });

    const result = await promptConfig(schema, {}, "my-agent", mockPrompt, true);

    expect(result.newValues).toEqual({
      llm: { provider: "openai" },
      db: { host: "localhost" },
    });
  });

  it("handles schema with no groups (no-op)", async () => {
    const schema: AgentConfigSchema = { groups: [] };
    const mockPrompt = vi.fn();

    const result = await promptConfig(schema, {}, "my-agent", mockPrompt, true);

    expect(result.resolved).toEqual({});
    expect(result.newValues).toEqual({});
    expect(mockPrompt).not.toHaveBeenCalled();
  });
});
