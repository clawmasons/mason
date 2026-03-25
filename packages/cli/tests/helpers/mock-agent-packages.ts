/**
 * Mock agent packages for CLI tests.
 *
 * These replace the real `@clawmasons/claude-code-agent`, `@clawmasons/pi-coding-agent`,
 * and `@clawmasons/codex-agent` packages that have been moved to the `mason-extensions` repo.
 *
 * Each mock provides the minimum AgentPackage shape needed for CLI tests:
 * - name, aliases, dialect, dialectFields, tasks, skills
 * - A stub materializer that returns an empty Map
 * - A validate function for LLM config checks
 * - Config schema and credentialsFn for Pi agent
 */

import type {
  AgentPackage,
  RuntimeMaterializer,
  AgentValidationResult,
  AgentConfigSchema,
  AgentCredentialRequirement,
} from "@clawmasons/agent-sdk";
import type { ResolvedAgent } from "@clawmasons/shared";

// ---------------------------------------------------------------------------
// Claude Code Agent mock
// ---------------------------------------------------------------------------

export const mockClaudeCodeMaterializer: RuntimeMaterializer = {
  name: "claude-code-agent",
  materializeWorkspace: (_agent, proxyEndpoint, proxyToken) => {
    const files = new Map<string, string>();
    files.set(".claude.json", JSON.stringify({ mcpServers: { mason: { type: "sse", url: `${proxyEndpoint || "http://proxy:3100"}/sse` } } }, null, 2));
    files.set(".claude/settings.json", JSON.stringify({ permissions: { allow: ["mcp__mason__*"], deny: [] } }, null, 2));
    files.set("agent-launch.json", JSON.stringify({ agent: "claude-code-agent", proxy: proxyEndpoint || "http://proxy:3100", token: proxyToken || "" }, null, 2));
    return files;
  },
};

export const mockClaudeCodeAgent: AgentPackage = {
  name: "claude-code-agent",
  aliases: ["claude", "claude-code"],
  materializer: mockClaudeCodeMaterializer,
  dialect: "claude",
  dialectFields: {
    tasks: "commands",
    apps: "mcp_servers",
    skills: "skills",
  },
  tasks: {
    projectFolder: ".claude/commands",
    nameFormat: "{scopePath}/{taskName}.md",
    scopeFormat: "path",
    supportedFields: "all",
    prompt: "markdown-body",
  },
  skills: {
    projectFolder: ".claude/skills",
  },
  runtime: {
    command: "claude",
    credentials: [{ key: "CLAUDE_CODE_OAUTH_TOKEN", type: "env" }],
  },
  dockerfile: {
    installSteps: "RUN npm install -g @anthropic-ai/claude-code",
  },
  validate: (agent: ResolvedAgent): AgentValidationResult => {
    const errors: AgentValidationResult["errors"] = [];
    const warnings: AgentValidationResult["warnings"] = [];
    if (agent.llm) {
      warnings.push({
        category: "llm-config",
        message: `Agent "${agent.agentName}" uses claude-code-agent runtime — LLM config will be ignored (Claude uses its own API).`,
        context: { agent: agent.name, runtime: "claude-code-agent" },
      });
    }
    return { errors, warnings };
  },
};

// ---------------------------------------------------------------------------
// Pi Coding Agent mock
// ---------------------------------------------------------------------------

const PROVIDER_MODELS: Record<string, Array<{ label: string; value: string }>> = {
  openrouter: [
    { label: "Claude Sonnet 4", value: "anthropic/claude-sonnet-4" },
    { label: "GPT-4o", value: "openai/gpt-4o" },
    { label: "Claude Opus 4", value: "anthropic/claude-opus-4" },
  ],
  openai: [
    { label: "GPT-4o", value: "gpt-4o" },
    { label: "GPT-4o mini", value: "gpt-4o-mini" },
  ],
  anthropic: [
    { label: "Claude Sonnet 4", value: "claude-sonnet-4" },
    { label: "Claude Opus 4", value: "claude-opus-4" },
  ],
  together: [
    { label: "Llama 3.1 70B", value: "meta-llama/Meta-Llama-3.1-70B-Instruct-Turbo" },
  ],
};

const PROVIDER_ENV_MAP: Record<string, string> = {
  openrouter: "OPENROUTER_API_KEY",
  openai: "OPENAI_API_KEY",
  anthropic: "ANTHROPIC_API_KEY",
  together: "TOGETHER_API_KEY",
  google: "GEMINI_API_KEY",
  mistral: "MISTRAL_API_KEY",
  groq: "GROQ_API_KEY",
  xai: "XAI_API_KEY",
};

export const mockPiCodingAgentConfigSchema: AgentConfigSchema = {
  groups: [
    {
      key: "llm",
      label: "LLM Configuration",
      fields: [
        {
          key: "provider",
          label: "LLM Provider",
          options: [
            { label: "OpenRouter", value: "openrouter" },
            { label: "OpenAI", value: "openai" },
            { label: "Anthropic", value: "anthropic" },
            { label: "Together", value: "together" },
          ],
        },
        {
          key: "model",
          label: "Model",
          optionsFn: (resolved: Record<string, string>) => {
            const provider = resolved["llm.provider"] ?? resolved["provider"];
            return PROVIDER_MODELS[provider] ?? [];
          },
        },
      ],
    },
  ],
};

export const mockPiCodingAgentMaterializer: RuntimeMaterializer = {
  name: "pi-coding-agent",
  materializeWorkspace: (_agent, proxyEndpoint, proxyToken) => {
    const files = new Map<string, string>();
    files.set("agent-launch.json", JSON.stringify({ agent: "pi-coding-agent", proxy: proxyEndpoint || "http://proxy:3100", token: proxyToken || "" }, null, 2));
    return files;
  },
};

export const mockPiCodingAgent: AgentPackage = {
  name: "pi-coding-agent",
  aliases: ["pi", "pi-coding"],
  materializer: mockPiCodingAgentMaterializer,
  dialect: "pi",
  dialectFields: {
    tasks: "prompts",
    apps: "mcp_servers",
    skills: "skills",
  },
  tasks: {
    projectFolder: ".pi/prompts",
    nameFormat: "{scopePath}/{taskName}.md",
    scopeFormat: "path",
    supportedFields: ["description"],
    prompt: "markdown-body",
  },
  skills: {
    projectFolder: "skills",
  },
  runtime: {
    command: "pi",
    credentials: [],
  },
  configSchema: mockPiCodingAgentConfigSchema,
  credentialsFn: (config: Record<string, string>): AgentCredentialRequirement[] => {
    const provider = config["llm.provider"];
    const envVar = PROVIDER_ENV_MAP[provider];
    if (!envVar) return [];
    return [{
      key: envVar,
      type: "env" as const,
      label: `${provider} API Key`,
      ...(provider === "openrouter" ? { obtainUrl: "https://openrouter.ai/keys" } : {}),
    }];
  },
  validate: (agent: ResolvedAgent): AgentValidationResult => {
    const errors: AgentValidationResult["errors"] = [];
    if (!agent.llm) {
      errors.push({
        category: "llm-config",
        message: `Agent "${agent.agentName}" uses pi-coding-agent runtime but has no LLM configuration. Set llm.provider and llm.model in the agent config.`,
        context: { agent: agent.name, runtime: "pi-coding-agent" },
      });
    }
    return { errors, warnings: [] };
  },
};

// ---------------------------------------------------------------------------
// Codex Agent mock
// ---------------------------------------------------------------------------

export const mockCodexAgentMaterializer: RuntimeMaterializer = {
  name: "codex-agent",
  materializeWorkspace: (_agent, proxyEndpoint, proxyToken) => {
    const files = new Map<string, string>();
    files.set("agent-launch.json", JSON.stringify({ agent: "codex-agent", proxy: proxyEndpoint || "http://proxy:3100", token: proxyToken || "" }, null, 2));
    return files;
  },
};

export const mockCodexAgent: AgentPackage = {
  name: "codex-agent",
  aliases: ["codex"],
  materializer: mockCodexAgentMaterializer,
  dialect: "codex",
  dialectFields: {
    tasks: "tasks",
    apps: "mcp_servers",
    skills: "skills",
  },
};
