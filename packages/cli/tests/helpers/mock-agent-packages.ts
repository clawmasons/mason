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
  AcpSessionUpdate,
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
    files.set(".claude/settings.json", JSON.stringify({
      permissions: { allow: ["mcp__mason__*"], deny: [] },
      hooks: {
        SessionStart: [{
          hooks: [{
            type: "command",
            command: "node -e \"let s='';process.stdin.on('data',c=>s+=c);process.stdin.on('end',()=>{try{const i=JSON.parse(s);const f='/home/mason/.mason/session/meta.json';if(require('fs').existsSync(f)&&i.session_id){const m=JSON.parse(require('fs').readFileSync(f,'utf8'));m.agentSessionId=i.session_id;require('fs').writeFileSync(f,JSON.stringify(m,null,2))}}catch(e){}})\"",
          }],
        }],
      },
    }, null, 2));
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
  jsonMode: {
    jsonStreamArgs: ["--output-format", "stream-json", "--verbose"],
    buildPromptArgs: (prompt: string) => ["-p", prompt],
    parseJsonStreamAsACP(line: string): AcpSessionUpdate | null {
      const event = JSON.parse(line);
      if (event.type === "assistant" && event.message?.content) {
        for (const block of event.message.content) {
          if (block.type === "text") {
            return { sessionUpdate: "agent_message_chunk", content: { type: "text", text: block.text } };
          }
          if (block.type === "tool_use") {
            return { sessionUpdate: "tool_call", toolCallId: block.id, title: block.name, kind: "other", status: "in_progress" };
          }
        }
      }
      if (event.type === "result" && event.result) {
        return { sessionUpdate: "agent_message_chunk", content: { type: "text", text: event.result } };
      }
      return null;
    },
  },
  resume: {
    flag: "--resume",
    sessionIdField: "agentSessionId",
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
  jsonMode: {
    jsonStreamArgs: ["--mode", "json"],
    buildPromptArgs: (prompt: string) => ["-p", prompt],
    parseJsonStreamAsACP(line: string): AcpSessionUpdate | null {
      const event = JSON.parse(line);
      if (event.type === "assistant_message" && Array.isArray(event.content)) {
        const text = event.content
          .filter((b: { type: string }) => b.type === "text")
          .map((b: { text: string }) => b.text)
          .join("\n");
        return text ? { sessionUpdate: "agent_message_chunk", content: { type: "text", text } } : null;
      }
      if (event.type === "tool_call") {
        return { sessionUpdate: "tool_call", toolCallId: event.id, title: event.name, kind: "other", status: "in_progress" };
      }
      if (event.type === "tool_result") {
        return { sessionUpdate: "tool_call_update", toolCallId: event.id, status: "completed", content: [{ type: "content", content: { type: "text", text: JSON.stringify(event.content) } }] };
      }
      if (event.type === "agent_end" && Array.isArray(event.messages)) {
        const lastAssistant = [...event.messages].reverse().find((m: { role: string }) => m.role === "assistant");
        if (lastAssistant?.content) {
          const text = lastAssistant.content
            .filter((b: { type: string }) => b.type === "text")
            .map((b: { text: string }) => b.text)
            .join("\n");
          return text ? { sessionUpdate: "agent_message_chunk", content: { type: "text", text } } : null;
        }
      }
      return null;
    },
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
  jsonMode: {
    jsonStreamArgs: ["exec", "--dangerously-bypass-approvals-and-sandbox", "--skip-git-repo-check", "--json"],
    buildPromptArgs: (prompt: string) => [prompt],
    parseJsonStreamAsACP(line: string): AcpSessionUpdate | null {
      const event = JSON.parse(line);

      // item.completed + agent_message → agent_message_chunk
      if (event.type === "item.completed" && event.item?.type === "agent_message") {
        return { sessionUpdate: "agent_message_chunk", content: { type: "text", text: event.item.text } };
      }

      // item.completed + reasoning → agent_thought_chunk
      if (event.type === "item.completed" && event.item?.type === "reasoning") {
        return { sessionUpdate: "agent_thought_chunk", content: { type: "text", text: event.item.text } };
      }

      // item.started + command_execution → tool_call (in_progress)
      if (event.type === "item.started" && event.item?.type === "command_execution") {
        return { sessionUpdate: "tool_call", toolCallId: event.item.id, title: event.item.command, kind: "execute", status: "in_progress" };
      }

      // item.completed + command_execution → tool_call_update (completed)
      if (event.type === "item.completed" && event.item?.type === "command_execution") {
        return { sessionUpdate: "tool_call_update", toolCallId: event.item.id, status: "completed", content: [{ type: "content", content: { type: "text", text: event.item.aggregated_output ?? "" } }] };
      }

      // item.completed + file_change → tool_call_update
      if (event.type === "item.completed" && event.item?.type === "file_change") {
        const changes = event.item.changes?.map((c: { path: string; kind: string }) => `${c.kind}: ${c.path}`).join(", ") ?? "";
        return { sessionUpdate: "tool_call_update", toolCallId: event.item.id, status: "completed", content: [{ type: "content", content: { type: "text", text: changes } }] };
      }

      // item.started + mcp_tool_call → tool_call (in_progress)
      if (event.type === "item.started" && event.item?.type === "mcp_tool_call") {
        return { sessionUpdate: "tool_call", toolCallId: event.item.id, title: `${event.item.server}:${event.item.tool}`, kind: "other", status: "in_progress" };
      }

      // item.completed + mcp_tool_call → tool_call_update (completed)
      if (event.type === "item.completed" && event.item?.type === "mcp_tool_call") {
        const text = event.item.result?.content ? JSON.stringify(event.item.result.content) : "";
        return { sessionUpdate: "tool_call_update", toolCallId: event.item.id, status: "completed", content: [{ type: "content", content: { type: "text", text } }] };
      }

      // todo_list → plan (both item.started and item.updated)
      if ((event.type === "item.started" || event.type === "item.updated") && event.item?.type === "todo_list") {
        const entries = event.item.items.map((i: { text: string; completed: boolean }, idx: number) => {
          let status: "pending" | "in_progress" | "completed" = "pending";
          if (i.completed) {
            status = "completed";
          } else if (idx === event.item.items.findIndex((x: { completed: boolean }) => !x.completed)) {
            status = "in_progress";
          }
          return { content: i.text, priority: "medium" as const, status };
        });
        return { sessionUpdate: "plan", entries };
      }

      return null;
    },
  },
};
