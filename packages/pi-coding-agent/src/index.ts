import type { AgentPackage } from "@clawmasons/agent-sdk";
import { piCodingAgentMaterializer, _setAgentPackage } from "./materializer.js";

export { piCodingAgentMaterializer } from "./materializer.js";

const piCodingAgent: AgentPackage = {
  name: "pi-coding-agent",
  aliases: ["pi"],
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
};

// Wire the materializer to its parent AgentPackage
_setAgentPackage(piCodingAgent);

export default piCodingAgent;
