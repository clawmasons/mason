import type { AgentPackage } from "@clawmasons/agent-sdk";
import { claudeCodeMaterializer, _setAgentPackage } from "./materializer.js";

export { claudeCodeMaterializer } from "./materializer.js";

const claudeCodeAgent: AgentPackage = {
  name: "claude-code-agent",
  aliases: ["claude"],
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
};

// Wire the materializer to its parent AgentPackage
_setAgentPackage(claudeCodeAgent);

export default claudeCodeAgent;
