import {
  type Agent,
  type AgentSideConnection,
  type InitializeRequest,
  type InitializeResponse,
  type NewSessionRequest,
  type NewSessionResponse,
  type PromptRequest,
  type PromptResponse,
  type CancelNotification,
  type ListSessionsRequest,
  type ListSessionsResponse,
  type LoadSessionRequest,
  type LoadSessionResponse,
  type CloseSessionRequest,
  type CloseSessionResponse,
  type SetSessionConfigOptionRequest,
  type SetSessionConfigOptionResponse,
  type ContentBlock,
  type ClientCapabilities,
  type Implementation,
  type SessionConfigOption,
  PROTOCOL_VERSION,
  RequestError,
} from "@agentclientprotocol/sdk";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  createSession,
  readSession,
  updateSession,
  listSessions as listSessionsFromStore,
  closeSession as closeSessionFromStore,
  resolveRole,
} from "@clawmasons/shared";
import { discoverForCwd } from "./discovery-cache.js";
import { executePromptStreaming } from "./prompt-executor.js";
import { initAcpLogger, acpLog, acpError } from "./acp-logger.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const pkgPath = resolve(__dirname, "..", "..", "package.json");
const { version: CLI_VERSION } = JSON.parse(readFileSync(pkgPath, "utf-8")) as { version: string };

// ---------------------------------------------------------------------------
// In-memory session state (runtime data not persisted to meta.json)
// ---------------------------------------------------------------------------

export interface SessionState {
  sessionId: string;
  cwd: string;
  role: string;
  agent: string;
  abortController?: AbortController;
}

/** Runtime session state keyed by sessionId. */
const sessions = new Map<string, SessionState>();

/** Expose sessions map for testing. */
export function getSessionState(sessionId: string): SessionState | undefined {
  return sessions.get(sessionId);
}

/** Clear all in-memory session state. Used by tests to reset between runs. */
export function clearSessionStates(): void {
  sessions.clear();
}

// ---------------------------------------------------------------------------
// Config options builder (shared by newSession, loadSession, setConfigOption)
// ---------------------------------------------------------------------------

/**
 * Build the `configOptions` array for an ACP session response.
 * Reused by `newSession`, `loadSession`, and `setConfigOption`.
 */
export function buildConfigOptions(
  discovery: { roles: { metadata: { name: string }; source: { type: string; packageName?: string } }[]; agentNames: string[] },
  currentRole: string,
  currentAgent: string,
): SessionConfigOption[] {
  return [
    {
      id: "role",
      name: "Role",
      type: "select" as const,
      category: "role",
      currentValue: currentRole,
      options: discovery.roles.map((r) => ({
        value: r.metadata.name,
        name: r.metadata.name,
        description:
          r.source.type === "package"
            ? `(packaged: ${r.source.packageName ?? "unknown"})`
            : "(local)",
      })),
    },
    {
      id: "agent",
      name: "Agent",
      type: "select" as const,
      category: "model",
      currentValue: currentAgent,
      options: discovery.agentNames.map((name) => ({
        value: name,
        name,
      })),
    },
  ];
}

// ---------------------------------------------------------------------------
// Client capabilities storage
// ---------------------------------------------------------------------------

/**
 * Stored client capabilities from the most recent `initialize` request.
 * Future handlers use this to check which client features are available.
 */
let storedClientCapabilities: ClientCapabilities | undefined;
let storedClientInfo: Implementation | null | undefined;

/**
 * Returns the client capabilities from the last `initialize` call,
 * or undefined if `initialize` has not been called yet.
 */
export function getClientCapabilities(): ClientCapabilities | undefined {
  return storedClientCapabilities;
}

/**
 * Returns the client info from the last `initialize` call,
 * or undefined if `initialize` has not been called yet.
 */
export function getClientInfo(): Implementation | null | undefined {
  return storedClientInfo;
}

// ---------------------------------------------------------------------------
// Text extraction helper
// ---------------------------------------------------------------------------

/**
 * Extract text content from an ACP `ContentBlock[]` prompt.
 * Concatenates all `TextContent` blocks, separated by newlines.
 * Non-text blocks (images, resources, etc.) are silently skipped.
 */
export function extractTextFromPrompt(prompt: ContentBlock[]): string {
  return prompt
    .filter((block): block is ContentBlock & { type: "text" } => block.type === "text")
    .map((block) => block.text)
    .join("\n");
}

// ---------------------------------------------------------------------------
// Agent factory
// ---------------------------------------------------------------------------

/**
 * Creates the mason ACP agent handler.
 *
 * Implements the `Agent` interface from `@agentclientprotocol/sdk`.
 * All session lifecycle handlers are implemented: initialize, newSession,
 * prompt, cancel, listSessions, loadSession, closeSession, and setConfigOption.
 */
export function createMasonAcpAgent(conn: AgentSideConnection): Agent {
  return {
    async initialize(params: InitializeRequest): Promise<InitializeResponse> {
      // Store client capabilities for future use
      storedClientCapabilities = params.clientCapabilities ?? undefined;
      storedClientInfo = params.clientInfo ?? undefined;

      acpLog("initialize", { clientInfo: storedClientInfo, capabilities: storedClientCapabilities });

      return {
        protocolVersion: PROTOCOL_VERSION,
        agentCapabilities: {
          loadSession: true,
          promptCapabilities: {
            image: true,
            audio: false,
            embeddedContext: true,
          },
          mcpCapabilities: {
            http: true,
            sse: false,
          },
          sessionCapabilities: {
            list: {},
            stop: {},
          },
        },
        agentInfo: {
          name: "mason",
          title: "Mason",
          version: CLI_VERSION,
        },
      };
    },

    async newSession(params: NewSessionRequest): Promise<NewSessionResponse> {
      const { cwd } = params;
      if (!cwd) {
        throw RequestError.invalidParams("cwd is required for session/new");
      }

      // Initialize file logger now that we have a cwd
      initAcpLogger(cwd);
      acpLog("session/new", { cwd });

      // Discover roles and agents for this project directory
      const discovery = await discoverForCwd(cwd);
      const { defaultRole, defaultAgent } = discovery;
      acpLog("session/new discovery", {
        roles: discovery.roles.map((r) => r.metadata.name),
        agents: discovery.agentNames,
        defaultRole: defaultRole.metadata.name,
        defaultAgent,
      });

      // Persist session to disk
      const session = await createSession(cwd, defaultAgent, defaultRole.metadata.name);

      // Track in-memory state
      sessions.set(session.sessionId, {
        sessionId: session.sessionId,
        cwd,
        role: defaultRole.metadata.name,
        agent: defaultAgent,
      });
      acpLog("session/new created", { sessionId: session.sessionId, role: defaultRole.metadata.name, agent: defaultAgent });

      // Build configOptions
      const configOptions = buildConfigOptions(discovery, defaultRole.metadata.name, defaultAgent);

      const response: NewSessionResponse = {
        sessionId: session.sessionId,
        configOptions,
      };

      // Send available_commands_update after response (fire-and-forget)
      const availableCommands = (defaultRole.tasks ?? []).map((task) => ({
        name: task.name,
        description: task.ref ?? task.name,
        input: { hint: "command arguments" },
      }));

      // Use setImmediate-style scheduling so the response is sent first
      void conn.sessionUpdate({
        sessionId: session.sessionId,
        update: {
          sessionUpdate: "available_commands_update" as const,
          availableCommands,
        },
      });

      return response;
    },

    async prompt(params: PromptRequest): Promise<PromptResponse> {
      const { sessionId, prompt: contentBlocks } = params;

      // 1. Look up session state
      const session = sessions.get(sessionId);
      if (!session) {
        acpError("prompt: session not found", { sessionId });
        throw RequestError.invalidParams(`Session not found: ${sessionId}`);
      }

      // 2. Extract text from ContentBlock[]
      const text = extractTextFromPrompt(contentBlocks);
      acpLog("prompt", { sessionId, agent: session.agent, role: session.role, textLength: text.length, text: text.slice(0, 200) });

      // 3. Create AbortController for cancellation support
      const abortController = new AbortController();
      session.abortController = abortController;

      try {
        // 4. Execute prompt via subprocess (streaming mode)
        const result = await executePromptStreaming({
          agent: session.agent,
          role: session.role,
          text,
          cwd: session.cwd,
          signal: abortController.signal,
          onSessionUpdate: (update) => {
            // Forward each parsed NDJSON line as a session update to the editor
            void conn.sessionUpdate({
              sessionId,
              update: update as Parameters<typeof conn.sessionUpdate>[0]["update"],
            });
          },
        });

        if (result.cancelled) {
          acpLog("prompt cancelled", { sessionId });
          return { stopReason: "cancelled" };
        }
        acpLog("prompt completed", { sessionId });

        // 6. Update meta.json (firstPrompt on first prompt, lastUpdated always)
        const now = new Date().toISOString();
        const updates: Record<string, unknown> = { lastUpdated: now };
        // Only set firstPrompt on the very first prompt
        const sessionMeta = await readSession(session.cwd, sessionId);
        if (sessionMeta && !sessionMeta.firstPrompt) {
          updates.firstPrompt = text;
        }
        await updateSession(session.cwd, sessionId, updates);

        // 7. Send session_info_update
        const title = (updates.firstPrompt as string) ?? sessionMeta?.firstPrompt ?? text;
        await conn.sessionUpdate({
          sessionId,
          update: {
            sessionUpdate: "session_info_update" as const,
            title: title.slice(0, 100),
            updatedAt: now,
          },
        });

        // 8. Return end_turn
        return { stopReason: "end_turn" };
      } catch (error) {
        // If cancelled via abort, return cancelled stop reason
        if (abortController.signal.aborted) {
          acpLog("prompt aborted", { sessionId });
          return { stopReason: "cancelled" };
        }
        acpError("prompt error", { sessionId, error: error instanceof Error ? error.message : String(error) });
        throw RequestError.internalError(
          error instanceof Error ? error.message : String(error),
        );
      } finally {
        // 9. Cleanup abort controller
        session.abortController = undefined;
      }
    },

    async cancel(params: CancelNotification): Promise<void> {
      const { sessionId } = params;
      acpLog("cancel", { sessionId });
      const session = sessions.get(sessionId);
      if (session?.abortController) {
        session.abortController.abort();
      }
      // Notification — no response expected
    },

    async listSessions(params: ListSessionsRequest): Promise<ListSessionsResponse> {
      const { cwd } = params;
      acpLog("listSessions", { cwd });

      if (!cwd) {
        // Without a cwd we don't know which .mason/sessions/ to scan
        return { sessions: [], nextCursor: null };
      }

      const stored = await listSessionsFromStore(cwd);
      const sessionInfos = stored.map((s) => ({
        sessionId: s.sessionId,
        cwd: s.cwd,
        title: s.firstPrompt,
        updatedAt: s.lastUpdated,
      }));

      return { sessions: sessionInfos, nextCursor: null };
    },

    async loadSession(params: LoadSessionRequest): Promise<LoadSessionResponse> {
      const { sessionId, cwd } = params;
      acpLog("loadSession", { sessionId, cwd });

      // Ensure logger is initialized if this is the first handler with a cwd
      initAcpLogger(cwd);

      const meta = await readSession(cwd, sessionId);
      if (!meta) {
        acpError("loadSession: session not found", { sessionId, cwd });
        throw RequestError.invalidParams(`Session not found: ${sessionId}`);
      }

      // Run discovery so we can build configOptions
      const discovery = await discoverForCwd(cwd);

      // Populate in-memory state
      sessions.set(sessionId, {
        sessionId,
        cwd,
        role: meta.role,
        agent: meta.agent,
      });

      const configOptions = buildConfigOptions(discovery, meta.role, meta.agent);

      // History replay is deferred to P1 — no session/update notifications sent
      return { configOptions };
    },

    async unstable_closeSession(params: CloseSessionRequest): Promise<CloseSessionResponse> {
      const { sessionId } = params;
      acpLog("closeSession", { sessionId });

      // Look up in-memory state to get cwd
      const session = sessions.get(sessionId);
      if (!session) {
        acpError("closeSession: session not found", { sessionId });
        throw RequestError.invalidParams(`Session not found: ${sessionId}`);
      }

      // Persist closed state
      await closeSessionFromStore(session.cwd, sessionId);

      // Remove from in-memory state
      sessions.delete(sessionId);

      return {};
    },

    async setSessionConfigOption(params: SetSessionConfigOptionRequest): Promise<SetSessionConfigOptionResponse> {
      const { sessionId, configId, value } = params;
      acpLog("setSessionConfigOption", { sessionId, configId, value });

      const session = sessions.get(sessionId);
      if (!session) {
        acpError("setSessionConfigOption: session not found", { sessionId });
        throw RequestError.invalidParams(`Session not found: ${sessionId}`);
      }

      const stringValue = String(value);

      if (configId === "agent") {
        session.agent = stringValue;
        await updateSession(session.cwd, sessionId, { agent: stringValue });
      } else if (configId === "role") {
        session.role = stringValue;
        await updateSession(session.cwd, sessionId, { role: stringValue });

        // Resolve the new role and send notifications
        const resolvedRole = await resolveRole(stringValue, session.cwd);
        const availableCommands = (resolvedRole.tasks ?? []).map((task) => ({
          name: task.name,
          description: task.ref ?? task.name,
          input: { hint: "command arguments" },
        }));

        // Send available_commands_update
        void conn.sessionUpdate({
          sessionId,
          update: {
            sessionUpdate: "available_commands_update" as const,
            availableCommands,
          },
        });

        // Send config_option_update after building updated options
        const discovery = await discoverForCwd(session.cwd);
        const configOptions = buildConfigOptions(discovery, session.role, session.agent);

        void conn.sessionUpdate({
          sessionId,
          update: {
            sessionUpdate: "config_option_update" as const,
            configOptions,
          },
        });

        return { configOptions };
      } else {
        throw RequestError.invalidParams(`Unknown configId: ${configId}`);
      }

      // For non-role changes, just return updated configOptions
      const discovery = await discoverForCwd(session.cwd);
      const configOptions = buildConfigOptions(discovery, session.role, session.agent);
      return { configOptions };
    },

    async authenticate() {
      // No auth needed for local stdio transport
      return {};
    },

    async setSessionMode() {
      throw RequestError.methodNotFound("session/setSessionMode");
    },
  };
}
