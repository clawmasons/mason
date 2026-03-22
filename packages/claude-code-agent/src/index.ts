import type { AgentPackage, AgentValidationResult } from "@clawmasons/agent-sdk";
import type { ResolvedAgent } from "@clawmasons/shared";
import { claudeCodeMaterializer, _setAgentPackage } from "./materializer.js";

export { claudeCodeMaterializer } from "./materializer.js";

const claudeCodeAgent: AgentPackage = {
  name: "claude-code-agent",
  aliases: ["claude"],
  dialect: "claude",
  dialectFields: { tasks: "commands" },
  materializer: claudeCodeMaterializer,
  dockerfile: {
    installSteps: `
# Install claude-code-agent runtime
RUN npm install -g @anthropic-ai/claude-code
`,
  },
  acp: {
    command: "claude-agent-acp",
  },
  runtime: {
    command: "claude",
    args: ["--effort", "max"],
    credentials: [
      { key: "CLAUDE_CODE_OAUTH_TOKEN", type: "env" },
    ],
    supportsAppendSystemPrompt: true,
  },
  tasks: {
    projectFolder: ".claude/commands",
    nameFormat: "{scopePath}/{taskName}.md",
    scopeFormat: "path",
    supportedFields: ["name->displayName", "description", "category", "tags"],
    prompt: "markdown-body",
  },
  skills: {
    projectFolder: ".claude/skills",
  },

  validate: (agent: ResolvedAgent): AgentValidationResult => {
    const warnings = [];
    if (agent.llm) {
      warnings.push({
        category: "llm-config",
        message: `Agent "${agent.agentName}" uses runtime "claude-code-agent" with an "llm" configuration. Claude Code only supports Anthropic — the "llm" field will be ignored.`,
        context: { agent: agent.name, runtime: "claude-code-agent" },
      });
    }
    return { errors: [], warnings };
  },
};

// Wire the materializer to its parent AgentPackage
_setAgentPackage(claudeCodeAgent);

export default claudeCodeAgent;
