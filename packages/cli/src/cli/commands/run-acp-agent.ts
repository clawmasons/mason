/**
 * @deprecated This module is a backward-compatibility re-export.
 * The `acp` command has been consolidated into `run --acp`.
 * All exports now live in `./run-agent.ts`.
 */
export {
  runAcpAgent,
  collectEnvCredentials,
  registerRunAcpAgentCommand,
  bootstrapChapter,
  RUN_ACP_AGENT_HELP_EPILOG,
  type RunAcpAgentDeps,
  type RunAgentDeps,
  type BootstrapChapterDeps,
  type RunAcpAgentOptions,
} from "./run-agent.js";
