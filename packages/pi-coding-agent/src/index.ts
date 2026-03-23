import type { AgentPackage, AgentCredentialRequirement, AgentValidationResult } from "@clawmasons/agent-sdk";
import { PROVIDER_ENV_VARS } from "@clawmasons/agent-sdk";
import type { ResolvedAgent } from "@clawmasons/shared";
import { piCodingAgentMaterializer, _setAgentPackage } from "./materializer.js";

export { piCodingAgentMaterializer } from "./materializer.js";

const piCodingAgent: AgentPackage = {
  name: "pi-coding-agent",
  aliases: ["pi"],
  dialect: "pi",
  dialectFields: { tasks: "prompts" },
  materializer: piCodingAgentMaterializer,
  dockerfile: {
    installSteps: `
# Install pi-coding-agent runtime
RUN npm install -g @mariozechner/pi-coding-agent
`,
  },
  acp: {
    command: "pi-agent-acp",
  },
  runtime: {
    command: "pi",
  },
  tasks: {
    projectFolder: ".pi/prompts",
    nameFormat: "{scopeKebab}-{taskName}.md",
    scopeFormat: "kebab-case-prefix",
    supportedFields: ["description"],
    prompt: "markdown-body",
  },
  skills: {
    projectFolder: "skills",
  },

  configSchema: {
    groups: [
      {
        key: "llm",
        label: "LLM Settings",
        fields: [
          {
            key: "provider",
            label: "LLM Provider",
            hint: "The inference provider Pi should use.",
            options: [
              { label: "OpenRouter", value: "openrouter", description: "Multi-model router" },
              { label: "OpenAI", value: "openai", description: "GPT models" },
              { label: "Together", value: "together", description: "Open-source models" },
            ],
          },
          {
            key: "model",
            label: "Model",
            hint: "The model identifier for the selected provider.",
            optionsFn: (resolved: Record<string, string>) => {
              if (resolved.provider === "openrouter") {
                return [
                  { label: "Claude Sonnet 4", value: "anthropic/claude-sonnet-4" },
                  { label: "GPT-4o", value: "openai/gpt-4o" },
                  { label: "Llama 3.1 405B", value: "meta-llama/llama-3.1-405b-instruct" },
                ];
              }
              if (resolved.provider === "openai") {
                return [
                  { label: "GPT-4o", value: "gpt-4o" },
                  { label: "GPT-4o mini", value: "gpt-4o-mini" },
                ];
              }
              if (resolved.provider === "together") {
                return [
                  { label: "Llama 3.1 405B", value: "meta-llama/llama-3.1-405b-instruct" },
                  { label: "Mixtral 8x22B", value: "mistralai/Mixtral-8x22B-Instruct-v0.1" },
                ];
              }
              return []; // Free-text input for unknown providers
            },
          },
        ],
      },
    ],
  },

  credentialsFn: (config: Record<string, string>): AgentCredentialRequirement[] => {
    const provider = config["llm.provider"];
    const key = PROVIDER_ENV_VARS[provider] ?? `${provider?.toUpperCase()}_API_KEY`;
    return [
      {
        key,
        type: "env",
        label: `${provider} API Key`,
        hint: "Paste your API key. It will not be stored in config.json.",
        obtainUrl: provider === "openrouter"
          ? "https://openrouter.ai/keys"
          : undefined,
      },
    ];
  },

  printMode: {
    jsonStreamArgs: ["--mode", "json"],
    parseJsonStreamFinalResult(line: string): string | null {
      const event = JSON.parse(line);
      if (event.type === "agent_end" && Array.isArray(event.messages)) {
        const lastAssistant = [...event.messages]
          .reverse()
          .find((m: Record<string, unknown>) => m.role === "assistant");
        if (lastAssistant?.content) {
          return (lastAssistant.content as Array<{ type: string; text: string }>)
            .filter((block) => block.type === "text")
            .map((block) => block.text)
            .join("\n");
        }
      }
      return null;
    },
  },

  validate: (agent: ResolvedAgent): AgentValidationResult => {
    const errors = [];
    if (!agent.llm) {
      errors.push({
        category: "llm-config",
        message: `Agent "${agent.agentName}" uses pi-coding-agent but has no LLM configuration.`,
        context: { agent: agent.name, runtime: "pi-coding-agent" },
      });
    }
    return { errors, warnings: [] };
  },
};

// Wire the materializer to its parent AgentPackage
_setAgentPackage(piCodingAgent);

export default piCodingAgent;
