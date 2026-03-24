import type { AgentPackage, RuntimeMaterializer, MaterializationResult } from "@clawmasons/agent-sdk";

const codexAgentMaterializer: RuntimeMaterializer = {
  name: "codex-agent",

  materializeWorkspace(): MaterializationResult {
    return new Map<string, string>();
  },
};

const codexAgent: AgentPackage = {
  name: "codex-agent",
  aliases: ["codex"],
  materializer: codexAgentMaterializer,
};

export default codexAgent;
