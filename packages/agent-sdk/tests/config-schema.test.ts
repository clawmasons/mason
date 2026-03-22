import { describe, expect, it } from "vitest";
import type {
  AgentPackage,
  AgentConfigSchema,
  ConfigGroup,
  ConfigField,
  ConfigOption,
  AgentCredentialRequirement,
  AgentValidationError,
  AgentValidationWarning,
  AgentValidationResult,
  ResolvedAgent,
} from "../src/index.js";

describe("AgentConfigSchema types", () => {
  it("creates a ConfigOption with all fields", () => {
    const option: ConfigOption = {
      label: "OpenRouter",
      value: "openrouter",
      description: "Multi-model router",
    };
    expect(option.label).toBe("OpenRouter");
    expect(option.value).toBe("openrouter");
    expect(option.description).toBe("Multi-model router");
  });

  it("creates a ConfigOption with required fields only", () => {
    const option: ConfigOption = {
      label: "OpenAI",
      value: "openai",
    };
    expect(option.label).toBe("OpenAI");
    expect(option.value).toBe("openai");
    expect(option.description).toBeUndefined();
  });

  it("creates a ConfigField with all fields including static options", () => {
    const field: ConfigField = {
      key: "provider",
      label: "LLM Provider",
      hint: "The inference provider Pi should use.",
      required: true,
      default: "openrouter",
      options: [
        { label: "OpenRouter", value: "openrouter" },
        { label: "OpenAI", value: "openai" },
      ],
    };
    expect(field.key).toBe("provider");
    expect(field.options).toHaveLength(2);
    expect(field.required).toBe(true);
  });

  it("creates a ConfigField with dynamic optionsFn", () => {
    const field: ConfigField = {
      key: "model",
      label: "Model",
      optionsFn: (resolved) => {
        if (resolved.provider === "openrouter") {
          return [{ label: "Claude Sonnet 4", value: "anthropic/claude-sonnet-4" }];
        }
        return [];
      },
    };
    expect(field.optionsFn).toBeDefined();
    const options = field.optionsFn!({ provider: "openrouter" });
    expect(options).toHaveLength(1);
    expect(options[0].value).toBe("anthropic/claude-sonnet-4");
  });

  it("creates a ConfigField with required fields only", () => {
    const field: ConfigField = {
      key: "host",
      label: "Database Host",
    };
    expect(field.key).toBe("host");
    expect(field.hint).toBeUndefined();
    expect(field.required).toBeUndefined();
    expect(field.default).toBeUndefined();
    expect(field.options).toBeUndefined();
    expect(field.optionsFn).toBeUndefined();
  });

  it("creates a ConfigGroup with fields", () => {
    const group: ConfigGroup = {
      key: "llm",
      label: "LLM Settings",
      fields: [
        { key: "provider", label: "LLM Provider" },
        { key: "model", label: "Model" },
      ],
    };
    expect(group.key).toBe("llm");
    expect(group.fields).toHaveLength(2);
  });

  it("creates an AgentConfigSchema with groups", () => {
    const schema: AgentConfigSchema = {
      groups: [
        {
          key: "llm",
          label: "LLM Settings",
          fields: [{ key: "provider", label: "LLM Provider" }],
        },
        {
          key: "database",
          label: "Database Settings",
          fields: [{ key: "host", label: "Database Host" }],
        },
      ],
    };
    expect(schema.groups).toHaveLength(2);
    expect(schema.groups[0].key).toBe("llm");
    expect(schema.groups[1].key).toBe("database");
  });
});

describe("AgentCredentialRequirement type", () => {
  it("creates a credential requirement with all fields", () => {
    const cred: AgentCredentialRequirement = {
      key: "OPENROUTER_API_KEY",
      type: "env",
      label: "OpenRouter API Key",
      obtainUrl: "https://openrouter.ai/keys",
      hint: "Paste your API key. It will not be stored in config.json.",
    };
    expect(cred.key).toBe("OPENROUTER_API_KEY");
    expect(cred.type).toBe("env");
    expect(cred.label).toBe("OpenRouter API Key");
    expect(cred.obtainUrl).toBe("https://openrouter.ai/keys");
    expect(cred.hint).toBeDefined();
  });

  it("creates a file-type credential requirement", () => {
    const cred: AgentCredentialRequirement = {
      key: "SSH_KEY",
      type: "file",
      path: "/home/mason/.ssh/id_rsa",
    };
    expect(cred.type).toBe("file");
    expect(cred.path).toBe("/home/mason/.ssh/id_rsa");
    expect(cred.label).toBeUndefined();
  });

  it("creates a minimal credential requirement", () => {
    const cred: AgentCredentialRequirement = {
      key: "API_KEY",
      type: "env",
    };
    expect(cred.key).toBe("API_KEY");
    expect(cred.path).toBeUndefined();
    expect(cred.label).toBeUndefined();
    expect(cred.obtainUrl).toBeUndefined();
    expect(cred.hint).toBeUndefined();
  });
});

describe("AgentValidation types", () => {
  it("creates a validation error", () => {
    const error: AgentValidationError = {
      category: "llm-config",
      message: 'Agent "pi" uses pi-coding-agent but has no LLM configuration.',
      context: { agent: "pi", runtime: "pi-coding-agent" },
    };
    expect(error.category).toBe("llm-config");
    expect(error.message).toContain("no LLM configuration");
    expect(error.context.agent).toBe("pi");
  });

  it("creates a validation warning", () => {
    const warning: AgentValidationWarning = {
      category: "llm-config",
      message: 'Agent "claude" has LLM config but claude-code-agent ignores it.',
      context: { agent: "claude", runtime: "claude-code-agent" },
    };
    expect(warning.category).toBe("llm-config");
    expect(warning.context.runtime).toBe("claude-code-agent");
  });

  it("creates a validation result with errors and warnings", () => {
    const result: AgentValidationResult = {
      errors: [
        {
          category: "llm-config",
          message: "Missing LLM config",
          context: { agent: "pi" },
        },
      ],
      warnings: [
        {
          category: "credential-coverage",
          message: "Unused credential",
          context: { credential: "EXTRA_KEY" },
        },
      ],
    };
    expect(result.errors).toHaveLength(1);
    expect(result.warnings).toHaveLength(1);
  });

  it("creates an empty validation result (no issues)", () => {
    const result: AgentValidationResult = {
      errors: [],
      warnings: [],
    };
    expect(result.errors).toHaveLength(0);
    expect(result.warnings).toHaveLength(0);
  });
});

describe("AgentPackage with new fields", () => {
  const mockMaterializer = {
    name: "test-agent",
    materializeWorkspace: () => new Map<string, string>(),
  };

  it("accepts all four new optional fields", () => {
    const pkg: AgentPackage = {
      name: "pi-coding-agent",
      aliases: ["pi"],
      materializer: mockMaterializer,
      configSchema: {
        groups: [
          {
            key: "llm",
            label: "LLM Settings",
            fields: [
              {
                key: "provider",
                label: "LLM Provider",
                options: [
                  { label: "OpenRouter", value: "openrouter" },
                ],
              },
              {
                key: "model",
                label: "Model",
                optionsFn: (resolved) => {
                  if (resolved.provider === "openrouter") {
                    return [{ label: "Claude Sonnet 4", value: "anthropic/claude-sonnet-4" }];
                  }
                  return [];
                },
              },
            ],
          },
        ],
      },
      credentialsFn: (config) => {
        return [
          {
            key: `${config["llm.provider"]?.toUpperCase()}_API_KEY`,
            type: "env",
            label: `${config["llm.provider"]} API Key`,
          },
        ];
      },
      dialect: "pi",
      validate: () => ({
        errors: [],
        warnings: [],
      }),
    };

    expect(pkg.name).toBe("pi-coding-agent");
    expect(pkg.configSchema).toBeDefined();
    expect(pkg.configSchema!.groups).toHaveLength(1);
    expect(pkg.credentialsFn).toBeDefined();
    expect(pkg.dialect).toBe("pi");
    expect(pkg.validate).toBeDefined();
  });

  it("compiles with minimal fields only (backward compatibility)", () => {
    const pkg: AgentPackage = {
      name: "simple-agent",
      materializer: mockMaterializer,
    };

    expect(pkg.name).toBe("simple-agent");
    expect(pkg.configSchema).toBeUndefined();
    expect(pkg.credentialsFn).toBeUndefined();
    expect(pkg.dialect).toBeUndefined();
    expect(pkg.validate).toBeUndefined();
  });

  it("credentialsFn returns correct credentials based on config", () => {
    const pkg: AgentPackage = {
      name: "test-agent",
      materializer: mockMaterializer,
      credentialsFn: (config) => {
        const providerKeyMap: Record<string, string> = {
          openrouter: "OPENROUTER_API_KEY",
          openai: "OPENAI_API_KEY",
        };
        const key = providerKeyMap[config["llm.provider"]] ?? "UNKNOWN_API_KEY";
        return [{ key, type: "env", label: `${config["llm.provider"]} API Key` }];
      },
    };

    const creds = pkg.credentialsFn!({ "llm.provider": "openrouter" });
    expect(creds).toHaveLength(1);
    expect(creds[0].key).toBe("OPENROUTER_API_KEY");
    expect(creds[0].label).toBe("openrouter API Key");
  });

  it("validate returns errors for missing config", () => {
    const pkg: AgentPackage = {
      name: "pi-coding-agent",
      materializer: mockMaterializer,
      validate: (agent) => {
        const errors: AgentValidationError[] = [];
        if (!agent.llm) {
          errors.push({
            category: "llm-config",
            message: `Agent "${agent.agentName}" has no LLM configuration.`,
            context: { agent: agent.name, runtime: "pi-coding-agent" },
          });
        }
        return { errors, warnings: [] };
      },
    };

    const agent: ResolvedAgent = {
      name: "test",
      version: "1.0.0",
      agentName: "test-agent",
      slug: "test",
      runtimes: ["pi-coding-agent"],
      credentials: [],
      roles: [],
    };

    const result = pkg.validate!(agent);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].category).toBe("llm-config");
    expect(result.warnings).toHaveLength(0);
  });

  it("validate returns no errors when config is present", () => {
    const pkg: AgentPackage = {
      name: "pi-coding-agent",
      materializer: mockMaterializer,
      validate: (agent) => {
        const errors: AgentValidationError[] = [];
        if (!agent.llm) {
          errors.push({
            category: "llm-config",
            message: "Missing LLM config",
            context: {},
          });
        }
        return { errors, warnings: [] };
      },
    };

    const agent: ResolvedAgent = {
      name: "test",
      version: "1.0.0",
      agentName: "test-agent",
      slug: "test",
      runtimes: ["pi-coding-agent"],
      credentials: [],
      roles: [],
      llm: { provider: "openrouter", model: "anthropic/claude-sonnet-4" },
    };

    const result = pkg.validate!(agent);
    expect(result.errors).toHaveLength(0);
  });
});
