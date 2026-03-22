import { describe, expect, it } from "vitest";
import piCodingAgent from "@clawmasons/pi-coding-agent";
import type { ResolvedAgent } from "@clawmasons/shared";

describe("pi-coding-agent config schema", () => {
  describe("configSchema", () => {
    it("declares a configSchema", () => {
      expect(piCodingAgent.configSchema).toBeDefined();
    });

    it("has one group with key 'llm'", () => {
      const groups = piCodingAgent.configSchema!.groups;
      expect(groups).toHaveLength(1);
      expect(groups[0].key).toBe("llm");
      expect(groups[0].label).toBe("LLM Settings");
    });

    it("has two fields: provider and model", () => {
      const fields = piCodingAgent.configSchema!.groups[0].fields;
      expect(fields).toHaveLength(2);
      expect(fields[0].key).toBe("provider");
      expect(fields[1].key).toBe("model");
    });

    describe("provider field", () => {
      it("has static options for openrouter, openai, together", () => {
        const provider = piCodingAgent.configSchema!.groups[0].fields[0];
        expect(provider.options).toBeDefined();
        const values = provider.options!.map((o) => o.value);
        expect(values).toContain("openrouter");
        expect(values).toContain("openai");
        expect(values).toContain("together");
      });

      it("has label and hint", () => {
        const provider = piCodingAgent.configSchema!.groups[0].fields[0];
        expect(provider.label).toBe("LLM Provider");
        expect(provider.hint).toBeDefined();
      });
    });

    describe("model field optionsFn", () => {
      const model = () => piCodingAgent.configSchema!.groups[0].fields[1];

      it("returns OpenRouter models when provider is openrouter", () => {
        const options = model().optionsFn!({ provider: "openrouter" });
        expect(options.length).toBeGreaterThan(0);
        const values = options.map((o) => o.value);
        expect(values).toContain("anthropic/claude-sonnet-4");
      });

      it("returns OpenAI models when provider is openai", () => {
        const options = model().optionsFn!({ provider: "openai" });
        expect(options.length).toBeGreaterThan(0);
        const values = options.map((o) => o.value);
        expect(values).toContain("gpt-4o");
      });

      it("returns Together models when provider is together", () => {
        const options = model().optionsFn!({ provider: "together" });
        expect(options.length).toBeGreaterThan(0);
      });

      it("returns empty array for unknown provider (free-text fallback)", () => {
        const options = model().optionsFn!({ provider: "unknown-provider" });
        expect(options).toEqual([]);
      });
    });
  });

  describe("credentialsFn", () => {
    it("maps openrouter to OPENROUTER_API_KEY", () => {
      const creds = piCodingAgent.credentialsFn!({ "llm.provider": "openrouter" });
      expect(creds).toHaveLength(1);
      expect(creds[0].key).toBe("OPENROUTER_API_KEY");
    });

    it("maps openai to OPENAI_API_KEY", () => {
      const creds = piCodingAgent.credentialsFn!({ "llm.provider": "openai" });
      expect(creds).toHaveLength(1);
      expect(creds[0].key).toBe("OPENAI_API_KEY");
    });

    it("maps together to TOGETHER_API_KEY", () => {
      const creds = piCodingAgent.credentialsFn!({ "llm.provider": "together" });
      expect(creds).toHaveLength(1);
      // PROVIDER_ENV_VARS does not include "together", so falls back to uppercase convention
      expect(creds[0].key).toBe("TOGETHER_API_KEY");
    });

    it("returns label for the credential", () => {
      const creds = piCodingAgent.credentialsFn!({ "llm.provider": "openrouter" });
      expect(creds[0].label).toBe("openrouter API Key");
    });

    it("returns obtainUrl for openrouter", () => {
      const creds = piCodingAgent.credentialsFn!({ "llm.provider": "openrouter" });
      expect(creds[0].obtainUrl).toBe("https://openrouter.ai/keys");
    });

    it("returns no obtainUrl for non-openrouter providers", () => {
      const creds = piCodingAgent.credentialsFn!({ "llm.provider": "openai" });
      expect(creds[0].obtainUrl).toBeUndefined();
    });

    it("returns hint text", () => {
      const creds = piCodingAgent.credentialsFn!({ "llm.provider": "openrouter" });
      expect(creds[0].hint).toBeDefined();
    });

    it("sets credential type to env", () => {
      const creds = piCodingAgent.credentialsFn!({ "llm.provider": "openrouter" });
      expect(creds[0].type).toBe("env");
    });
  });

  describe("validate", () => {
    function makeMinimalAgent(llm?: { provider: string; model: string }): ResolvedAgent {
      return {
        name: "test-agent",
        version: "1.0.0",
        agentName: "Test Agent",
        slug: "test-agent",
        runtimes: ["pi-coding-agent"],
        credentials: [],
        roles: [],
        llm,
      };
    }

    it("returns error when agent.llm is undefined", () => {
      const result = piCodingAgent.validate!(makeMinimalAgent());
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].category).toBe("llm-config");
      expect(result.errors[0].message).toContain("no LLM configuration");
    });

    it("returns no errors when agent.llm is defined", () => {
      const result = piCodingAgent.validate!(
        makeMinimalAgent({ provider: "openrouter", model: "anthropic/claude-sonnet-4" }),
      );
      expect(result.errors).toHaveLength(0);
    });

    it("always returns empty warnings", () => {
      const result = piCodingAgent.validate!(makeMinimalAgent());
      expect(result.warnings).toHaveLength(0);
    });
  });
});
