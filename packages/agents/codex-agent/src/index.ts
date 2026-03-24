import type { AgentPackage } from "@clawmasons/agent-sdk";
import { codexAgentMaterializer } from "./materializer.js";

export { codexAgentMaterializer } from "./materializer.js";
export { generateConfigToml } from "./materializer.js";

const codexAgent: AgentPackage = {
  name: "codex-agent",
  aliases: ["codex"],
  materializer: codexAgentMaterializer,
};

export default codexAgent;
