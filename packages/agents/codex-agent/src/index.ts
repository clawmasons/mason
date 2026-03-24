import type { AgentPackage, AgentValidationResult } from "@clawmasons/agent-sdk";
import type { ResolvedAgent } from "@clawmasons/shared";
import { codexAgentMaterializer, _setAgentPackage } from "./materializer.js";

export { codexAgentMaterializer } from "./materializer.js";
export { generateConfigToml, generateAgentsMd } from "./materializer.js";

const codexAgent: AgentPackage = {
  name: "codex-agent",
  aliases: ["codex"],
  dialect: "codex",
  dialectFields: undefined,

  materializer: codexAgentMaterializer,

  dockerfile: {
    installSteps: "RUN npm install -g @openai/codex",
    aptPackages: ["ca-certificates", "bubblewrap"],
  },

  runtime: {
    command: "codex",
    credentials: [{ key: "OPENAI_API_KEY", type: "env" }],
    supportsAppendSystemPrompt: false,
  },

  tasks: {
    projectFolder: ".codex/prompts",
    nameFormat: "{taskName}.md",
    scopeFormat: "kebab-case-prefix",
    supportedFields: ["description"],
    prompt: "markdown-body",
  },
  skills: {
    projectFolder: ".agents/skills",
  },

  mcpNameTemplate: "${server}_${tool}",

  printMode: {
    jsonStreamArgs: ["exec", "--dangerously-bypass-approvals-and-sandbox", "--skip-git-repo-check", "--json"],
    buildPromptArgs: (prompt) => [prompt],
    parseJsonStreamFinalResult(line: string): string | null {
      const event = JSON.parse(line);
      if (event.type === "item.completed" && event.item?.type === "agent_message") {
        return event.item.text ?? "";
      }
      return null;
    },
  },

  validate: (agent: ResolvedAgent): AgentValidationResult => {
    const warnings = [];
    if (agent.llm) {
      warnings.push({
        category: "llm-config",
        message: `Agent "${agent.agentName}" uses runtime "codex-agent" with an "llm" configuration. Codex only supports OpenAI models — the "llm" field will be ignored.`,
        context: { agent: agent.name, runtime: "codex-agent" },
      });
    }
    return { errors: [], warnings };
  },
};

// Wire the materializer to its parent AgentPackage
_setAgentPackage(codexAgent);

export default codexAgent;
