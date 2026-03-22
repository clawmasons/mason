import type { AgentPackage } from "@clawmasons/agent-sdk";
import { mcpAgentMaterializer, _setAgentPackage } from "./materializer.js";

export { mcpAgentMaterializer } from "./materializer.js";

const mcpAgent: AgentPackage = {
  name: "mcp-agent",
  aliases: ["mcp"],
  dialect: "mcp",
  dialectFields: { tasks: "commands" },
  materializer: mcpAgentMaterializer,
  dockerfile: {
    // mcp-agent uses @clawmasons/mcp-agent from node_modules (no global install needed)
  },
  acp: {
    command: "mcp-agent --acp",
  },
  runtime: {
    command: "mcp-agent",
  },
};

// Wire the materializer to its parent AgentPackage
_setAgentPackage(mcpAgent);

export default mcpAgent;
