import type { AgentPackage } from "@clawmasons/agent-sdk";
import { codexAgentMaterializer, _setAgentPackage } from "./materializer.js";

export { codexAgentMaterializer } from "./materializer.js";
export { generateConfigToml, generatePromptFile, generatePromptFiles, generateAgentsMd } from "./materializer.js";

const codexAgent: AgentPackage = {
  name: "codex-agent",
  aliases: ["codex"],
  materializer: codexAgentMaterializer,
  mcpNameTemplate: "${server}_${tool}",
};

// Wire the materializer to its parent AgentPackage
_setAgentPackage(codexAgent);

export default codexAgent;
