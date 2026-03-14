/**
 * ACP SDK Bridge — Dual-Connection ACP Protocol Mediator
 *
 * The bridge presents an AgentSideConnection to the editor (via ndjson
 * on provided streams) and a ClientSideConnection to the container agent
 * (via docker compose run piped stdio). It handles deferred startup:
 * `initialize` responds immediately with local capabilities, `session/new`
 * starts the container, and subsequent messages are forwarded bidirectionally.
 *
 * PRD refs: REQ-SDK-002, REQ-SDK-003, REQ-SDK-004, REQ-SDK-009,
 *           REQ-SDK-010, REQ-SDK-013
 */

import { Readable, Writable } from "node:stream";
import type { ChildProcess } from "node:child_process";
import {
  AgentSideConnection,
  ClientSideConnection,
  ndJsonStream,
  PROTOCOL_VERSION,
  type Agent,
  type Client,
  type InitializeRequest,
  type InitializeResponse,
  type NewSessionRequest,
  type NewSessionResponse,
  type PromptRequest,
  type PromptResponse,
  type CancelNotification,
  type AuthenticateRequest,
  type AuthenticateResponse,
  type SessionNotification,
  type RequestPermissionRequest,
  type RequestPermissionResponse,
  type ReadTextFileRequest,
  type ReadTextFileResponse,
  type WriteTextFileRequest,
  type WriteTextFileResponse,
  type CreateTerminalRequest,
  type CreateTerminalResponse,
  type TerminalOutputRequest,
  type TerminalOutputResponse,
  type ReleaseTerminalRequest,
  type ReleaseTerminalResponse,
  type WaitForTerminalExitRequest,
  type WaitForTerminalExitResponse,
  type KillTerminalRequest,
  type KillTerminalResponse,
  RequestError,
} from "@agentclientprotocol/sdk";
import type { AcpLogger } from "./logger.js";

// ── Types ─────────────────────────────────────────────────────────────

export interface AcpSdkBridgeConfig {
  /**
   * Callback invoked when `session/new` arrives with a `cwd` field.
   * Must start the container process and return a ChildProcess with
   * piped stdin/stdout for ACP ndjson communication.
   */
  onSessionNew: (cwd: string) => ChildProcess | Promise<ChildProcess>;
  /** Optional logger for diagnostics. */
  logger?: AcpLogger;
}

// ── AcpSdkBridge ─────────────────────────────────────────────────────

export class AcpSdkBridge {
  private readonly config: AcpSdkBridgeConfig;
  private readonly logger?: AcpLogger;

  private editorConnection: AgentSideConnection | null = null;
  private containerConnection: ClientSideConnection | null = null;
  private childProcess: ChildProcess | null = null;
  private initializeParams: InitializeRequest | null = null;
  private sessionActive = false;

  constructor(config: AcpSdkBridgeConfig) {
    this.config = config;
    this.logger = config.logger;
  }

  /**
   * Start the bridge with the given editor-facing streams.
   * Creates an AgentSideConnection that handles the ACP protocol
   * with the editor.
   */
  start(
    editorInput: ReadableStream<Uint8Array>,
    editorOutput: WritableStream<Uint8Array>,
  ): void {
    if (this.editorConnection) return;

    const stream = ndJsonStream(editorOutput, editorInput);

    this.editorConnection = new AgentSideConnection(
      (conn) => this.createEditorAgent(conn),
      stream,
    );

    this.logger?.log("[bridge] AgentSideConnection started for editor");

    // Monitor editor connection lifecycle (REQ-SDK-009)
    void this.editorConnection.closed.then(() => {
      this.logger?.log("[bridge] Editor connection closed");
      void this.cleanupContainer();
    });
  }

  /**
   * Promise that resolves when the editor connection closes.
   */
  get closed(): Promise<void> {
    if (!this.editorConnection) {
      return Promise.resolve();
    }
    return this.editorConnection.closed;
  }

  /**
   * Stop the bridge: clean up container and editor connections.
   */
  async stop(): Promise<void> {
    await this.cleanupContainer();
    this.editorConnection = null;
    this.logger?.log("[bridge] Bridge stopped");
  }

  // ── Editor-Facing Agent Implementation ──────────────────────────────

  private createEditorAgent(_conn: AgentSideConnection): Agent {
    return {
      initialize: (params) => this.handleInitialize(params),
      newSession: (params) => this.handleNewSession(params),
      prompt: (params) => this.handlePrompt(params),
      cancel: (params) => this.handleCancel(params),
      authenticate: (params) => this.handleAuthenticate(params),
    };
  }

  /**
   * Handle `initialize` from the editor.
   * Returns capabilities locally without starting a container. (REQ-SDK-004)
   */
  private async handleInitialize(params: InitializeRequest): Promise<InitializeResponse> {
    this.logger?.log("[bridge] initialize from editor");
    // Store for forwarding to container later
    this.initializeParams = params;

    return {
      protocolVersion: params.protocolVersion ?? PROTOCOL_VERSION,
      agentCapabilities: {},
      agentInfo: { name: "mason", version: "1.0.0" },
    };
  }

  /**
   * Handle `session/new` from the editor.
   * Starts the container, creates ClientSideConnection, forwards
   * initialize + session/new, returns the container's response. (REQ-SDK-004)
   */
  private async handleNewSession(params: NewSessionRequest): Promise<NewSessionResponse> {
    const cwd = params.cwd ?? process.cwd();
    this.logger?.log(`[bridge] session/new from editor — cwd: "${cwd}"`);

    if (this.sessionActive) {
      this.logger?.log("[bridge] Cleaning up previous session");
      await this.cleanupContainer();
    }

    // Start the container process
    const child = await Promise.resolve(this.config.onSessionNew(cwd));
    this.childProcess = child;

    if (!child.stdin || !child.stdout) {
      throw RequestError.internalError(undefined, "Container process missing stdin/stdout");
    }

    // Create ClientSideConnection to the container (REQ-SDK-003)
    const containerOutput = Writable.toWeb(child.stdin) as WritableStream<Uint8Array>;
    const containerInput = Readable.toWeb(child.stdout) as ReadableStream<Uint8Array>;
    const containerStream = ndJsonStream(containerOutput, containerInput);

    this.containerConnection = new ClientSideConnection(
      (agent) => this.createContainerClient(agent),
      containerStream,
    );

    this.sessionActive = true;

    // Monitor container connection lifecycle (REQ-SDK-013)
    void this.containerConnection.closed.then(() => {
      this.logger?.log("[bridge] Container connection closed");
      this.handleContainerDisconnect();
    });

    // Monitor child process exit (REQ-SDK-013)
    child.on("exit", (code, signal) => {
      this.logger?.log(`[bridge] Container process exited (code=${code}, signal=${signal})`);
      this.handleContainerDisconnect();
    });

    child.on("error", (err) => {
      this.logger?.error(`[bridge] Container process error: ${err.message}`);
      this.handleContainerDisconnect();
    });

    // Pipe container stderr to logger
    if (child.stderr) {
      child.stderr.on("data", (chunk: Buffer) => {
        this.logger?.log(`[container] ${chunk.toString().trimEnd()}`);
      });
    }

    // Forward initialize to the container
    const initParams = this.initializeParams ?? {
      protocolVersion: PROTOCOL_VERSION,
    };
    this.logger?.log("[bridge] Forwarding initialize to container");
    await this.containerConnection.initialize(initParams);

    // Forward session/new to the container
    this.logger?.log("[bridge] Forwarding session/new to container");
    const response = await this.containerConnection.newSession(params);

    return response;
  }

  /**
   * Handle `prompt` from the editor.
   * Forwards to the container and returns its response.
   */
  private async handlePrompt(params: PromptRequest): Promise<PromptResponse> {
    if (!this.containerConnection) {
      throw RequestError.internalError(
        undefined,
        "No active session — send session/new first",
      );
    }

    this.logger?.log("[bridge] Forwarding prompt to container");
    return this.containerConnection.prompt(params);
  }

  /**
   * Handle `cancel` from the editor.
   * Forwards cancel notification to the container. (REQ-SDK-010)
   */
  private async handleCancel(params: CancelNotification): Promise<void> {
    if (!this.containerConnection) {
      this.logger?.log("[bridge] cancel received but no container connection");
      return;
    }

    this.logger?.log("[bridge] Forwarding cancel to container");
    await this.containerConnection.cancel(params);
  }

  /**
   * Handle `authenticate` from the editor.
   * Forwards to the container if connected, otherwise returns empty.
   */
  private async handleAuthenticate(params: AuthenticateRequest): Promise<AuthenticateResponse> {
    if (!this.containerConnection) {
      return {};
    }
    return this.containerConnection.authenticate(params);
  }

  // ── Container-Facing Client Implementation ──────────────────────────

  /**
   * Create a Client implementation for the ClientSideConnection.
   * Forwards notifications from the container back to the editor. (REQ-SDK-010)
   */
  private createContainerClient(_agent: Agent): Client {
    return {
      requestPermission: (params: RequestPermissionRequest) => this.forwardRequestPermission(params),
      sessionUpdate: (params: SessionNotification) => this.forwardSessionUpdate(params),
      readTextFile: (params: ReadTextFileRequest) => this.forwardReadTextFile(params),
      writeTextFile: (params: WriteTextFileRequest) => this.forwardWriteTextFile(params),
      createTerminal: (params: CreateTerminalRequest) => this.forwardCreateTerminal(params),
      terminalOutput: (params: TerminalOutputRequest) => this.forwardTerminalOutput(params),
      releaseTerminal: (params: ReleaseTerminalRequest) => this.forwardReleaseTerminal(params),
      waitForTerminalExit: (params: WaitForTerminalExitRequest) => this.forwardWaitForTerminalExit(params),
      killTerminal: (params: KillTerminalRequest) => this.forwardKillTerminal(params),
    };
  }

  private async forwardSessionUpdate(params: SessionNotification): Promise<void> {
    if (!this.editorConnection) return;
    this.logger?.log("[bridge] Forwarding sessionUpdate to editor");
    await this.editorConnection.sessionUpdate(params);
  }

  private async forwardRequestPermission(params: RequestPermissionRequest): Promise<RequestPermissionResponse> {
    if (!this.editorConnection) {
      throw RequestError.internalError(undefined, "Editor connection not available");
    }
    this.logger?.log("[bridge] Forwarding requestPermission to editor");
    return this.editorConnection.requestPermission(params);
  }

  private async forwardReadTextFile(params: ReadTextFileRequest): Promise<ReadTextFileResponse> {
    if (!this.editorConnection) {
      throw RequestError.internalError(undefined, "Editor connection not available");
    }
    return this.editorConnection.readTextFile(params);
  }

  private async forwardWriteTextFile(params: WriteTextFileRequest): Promise<WriteTextFileResponse> {
    if (!this.editorConnection) {
      throw RequestError.internalError(undefined, "Editor connection not available");
    }
    return this.editorConnection.writeTextFile(params);
  }

  private async forwardCreateTerminal(params: CreateTerminalRequest): Promise<CreateTerminalResponse> {
    if (!this.editorConnection) {
      throw RequestError.internalError(undefined, "Editor connection not available");
    }
    // createTerminal returns a TerminalHandle; extract the terminalId for the raw response
    const handle = await this.editorConnection.createTerminal(params);
    return { terminalId: handle.id };
  }

  private async forwardTerminalOutput(params: TerminalOutputRequest): Promise<TerminalOutputResponse> {
    if (!this.editorConnection) {
      throw RequestError.internalError(undefined, "Editor connection not available");
    }
    return this.editorConnection.extMethod("terminal/output", params as unknown as Record<string, unknown>) as Promise<TerminalOutputResponse>;
  }

  private async forwardReleaseTerminal(params: ReleaseTerminalRequest): Promise<ReleaseTerminalResponse | void> {
    if (!this.editorConnection) return;
    return this.editorConnection.extMethod("terminal/release", params as unknown as Record<string, unknown>) as Promise<ReleaseTerminalResponse>;
  }

  private async forwardWaitForTerminalExit(params: WaitForTerminalExitRequest): Promise<WaitForTerminalExitResponse> {
    if (!this.editorConnection) {
      throw RequestError.internalError(undefined, "Editor connection not available");
    }
    return this.editorConnection.extMethod("terminal/waitForExit", params as unknown as Record<string, unknown>) as Promise<WaitForTerminalExitResponse>;
  }

  private async forwardKillTerminal(params: KillTerminalRequest): Promise<KillTerminalResponse | void> {
    if (!this.editorConnection) return;
    return this.editorConnection.extMethod("terminal/kill", params as unknown as Record<string, unknown>) as Promise<KillTerminalResponse>;
  }

  // ── Container Lifecycle ─────────────────────────────────────────────

  private handleContainerDisconnect(): void {
    if (!this.sessionActive) return;
    this.logger?.log("[bridge] Container disconnected — cleaning up for next session");
    this.containerConnection = null;
    this.childProcess = null;
    this.sessionActive = false;
  }

  private async cleanupContainer(): Promise<void> {
    this.sessionActive = false;

    if (this.childProcess) {
      this.logger?.log("[bridge] Killing container child process");
      this.childProcess.kill();
      this.childProcess = null;
    }

    this.containerConnection = null;
  }
}
