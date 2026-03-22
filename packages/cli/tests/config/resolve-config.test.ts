import { describe, expect, it } from "vitest";
import type { AgentConfigSchema } from "@clawmasons/agent-sdk";
import { resolveConfig, computeFieldOptions } from "../../src/config/resolve-config.js";

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

// ── resolveConfig ─────────────────────────────────────────────────────

describe("resolveConfig", () => {
  it("returns full resolved map when all fields are stored", () => {
    const stored = {
      llm: { provider: "openrouter", model: "anthropic/claude-sonnet-4" },
    };

    const result = resolveConfig(llmSchema, stored);

    expect(result.resolved).toEqual({
      "llm.provider": "openrouter",
      "llm.model": "anthropic/claude-sonnet-4",
    });
    expect(result.missing).toEqual([]);
  });

  it("returns all required fields as missing when no stored config", () => {
    const result = resolveConfig(llmSchema, {});

    expect(result.resolved).toEqual({});
    expect(result.missing).toHaveLength(2);
    expect(result.missing[0].key).toBe("provider");
    expect(result.missing[0].groupKey).toBe("llm");
    expect(result.missing[1].key).toBe("model");
    expect(result.missing[1].groupKey).toBe("llm");
  });

  it("returns partial stored values in resolved, rest in missing", () => {
    const stored = { llm: { provider: "openai" } };

    const result = resolveConfig(llmSchema, stored);

    expect(result.resolved).toEqual({ "llm.provider": "openai" });
    expect(result.missing).toHaveLength(1);
    expect(result.missing[0].key).toBe("model");
  });

  it("does not include optional missing fields in missing array", () => {
    const schema: AgentConfigSchema = {
      groups: [
        {
          key: "db",
          label: "Database",
          fields: [
            { key: "host", label: "Host" },
            { key: "port", label: "Port", required: false },
          ],
        },
      ],
    };

    const result = resolveConfig(schema, {});

    expect(result.missing).toHaveLength(1);
    expect(result.missing[0].key).toBe("host");
  });

  it("uses default value when no stored value exists", () => {
    const schema: AgentConfigSchema = {
      groups: [
        {
          key: "db",
          label: "Database",
          fields: [
            { key: "host", label: "Host", default: "localhost" },
            { key: "port", label: "Port", default: "5432" },
          ],
        },
      ],
    };

    const result = resolveConfig(schema, {});

    expect(result.resolved).toEqual({
      "db.host": "localhost",
      "db.port": "5432",
    });
    expect(result.missing).toEqual([]);
  });

  it("stored value takes precedence over default", () => {
    const schema: AgentConfigSchema = {
      groups: [
        {
          key: "db",
          label: "Database",
          fields: [
            { key: "host", label: "Host", default: "localhost" },
          ],
        },
      ],
    };

    const result = resolveConfig(schema, { db: { host: "prod.example.com" } });

    expect(result.resolved).toEqual({ "db.host": "prod.example.com" });
  });

  it("resolves multiple groups correctly", () => {
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

    const stored = { llm: { provider: "openai" }, db: { host: "localhost" } };
    const result = resolveConfig(schema, stored);

    expect(result.resolved).toEqual({
      "llm.provider": "openai",
      "db.host": "localhost",
    });
    expect(result.missing).toEqual([]);
  });

  it("returns empty resolved and missing for empty schema", () => {
    const schema: AgentConfigSchema = { groups: [] };
    const result = resolveConfig(schema, {});

    expect(result.resolved).toEqual({});
    expect(result.missing).toEqual([]);
  });
});

// ── computeFieldOptions ───────────────────────────────────────────────

describe("computeFieldOptions", () => {
  it("returns optionsFn result when optionsFn is present", () => {
    const field = llmSchema.groups[0].fields[1]; // model field with optionsFn
    const options = computeFieldOptions(field, { provider: "openrouter" });

    expect(options).toHaveLength(2);
    expect(options[0].value).toBe("anthropic/claude-sonnet-4");
  });

  it("returns static options when no optionsFn", () => {
    const field = llmSchema.groups[0].fields[0]; // provider field with static options
    const options = computeFieldOptions(field, {});

    expect(options).toHaveLength(2);
    expect(options[0].value).toBe("openrouter");
  });

  it("optionsFn takes precedence over static options", () => {
    const field = {
      key: "test",
      label: "Test",
      options: [{ label: "Static", value: "static" }],
      optionsFn: () => [{ label: "Dynamic", value: "dynamic" }],
    };

    const options = computeFieldOptions(field, {});
    expect(options).toHaveLength(1);
    expect(options[0].value).toBe("dynamic");
  });

  it("returns empty array when no options or optionsFn", () => {
    const field = { key: "text", label: "Free text" };
    const options = computeFieldOptions(field, {});
    expect(options).toEqual([]);
  });

  it("optionsFn receives prior resolved values", () => {
    let receivedResolved: Record<string, string> = {};
    const field = {
      key: "model",
      label: "Model",
      optionsFn: (resolved: Record<string, string>) => {
        receivedResolved = resolved;
        return [];
      },
    };

    computeFieldOptions(field, { provider: "openai", region: "us-east" });
    expect(receivedResolved).toEqual({ provider: "openai", region: "us-east" });
  });
});
