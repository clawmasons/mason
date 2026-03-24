import type { AgentPackage, AgentValidationResult } from "@clawmasons/agent-sdk";
import type { ResolvedAgent } from "@clawmasons/shared";
import { codexAgentMaterializer, _setAgentPackage } from "./materializer.js";

export { codexAgentMaterializer } from "./materializer.js";
export { generateConfigToml, generatePromptFile, generatePromptFiles, generateAgentsMd } from "./materializer.js";

const codexAgent: AgentPackage = {
  name: "codex-agent",
  aliases: ["codex"],
  dialect: "codex",
  dialectFields: undefined,

  materializer: codexAgentMaterializer,

  dockerfile: {
    installSteps: "RUN npm install -g @openai/codex",
  },

  runtime: {
    command: "codex",
    args: ["exec", "--full-auto"],
    credentials: [{ key: "OPENAI_API_KEY", type: "env" }],
    supportsAppendSystemPrompt: false,
  },

  tasks: undefined,
  skills: undefined,

  mcpNameTemplate: "${server}_${tool}",

  printMode: {
    jsonStreamArgs: ["--json"],
    buildPromptArgs: (prompt) => [prompt],
    parseJsonStreamFinalResult(line: string): string | null {
      // TODO: Refine once actual `codex exec --json` NDJSON output is captured during E2E testing (CHANGE 7).
      // Best-guess: look for a message event with role=assistant containing the final response.
      const event = JSON.parse(line);
      if (event.type === "message" && event.role === "assistant") {
        return event.content ?? "";
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
