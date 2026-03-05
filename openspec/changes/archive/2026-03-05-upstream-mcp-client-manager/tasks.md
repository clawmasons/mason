## 1. Add @modelcontextprotocol/sdk Dependency

- [ ] 1.1 Install `@modelcontextprotocol/sdk` as a runtime dependency

## 2. Implement UpstreamManager

- [ ] 2.1 Create `src/proxy/upstream.ts` with `UpstreamAppConfig` type and `UpstreamManager` class
- [ ] 2.2 Implement constructor — stores app configs, initializes empty client map
- [ ] 2.3 Implement `initialize(timeoutMs?)` — creates transports, connects all clients in parallel with timeout
- [ ] 2.4 Implement transport factory — creates `StdioClientTransport`, `SSEClientTransport`, or `StreamableHTTPClientTransport` based on `app.transport`
- [ ] 2.5 Implement `getTools(appName)` — lists tools from upstream client with pagination
- [ ] 2.6 Implement `getResources(appName)` — lists resources from upstream client with pagination
- [ ] 2.7 Implement `getPrompts(appName)` — lists prompts from upstream client with pagination
- [ ] 2.8 Implement `callTool(appName, toolName, args)` — forwards tool call to upstream client
- [ ] 2.9 Implement `readResource(appName, uri)` — forwards resource read to upstream client
- [ ] 2.10 Implement `getPrompt(appName, name, args)` — forwards prompt get to upstream client
- [ ] 2.11 Implement `shutdown()` — closes all clients, catches errors

## 3. Write Tests

- [ ] 3.1 Create `tests/proxy/upstream.test.ts`
- [ ] 3.2 Test: constructor stores configs without connecting
- [ ] 3.3 Test: `initialize()` connects all clients in parallel
- [ ] 3.4 Test: `initialize()` throws on timeout
- [ ] 3.5 Test: `getTools()` returns tools from the correct upstream client
- [ ] 3.6 Test: `getTools()` throws for unknown app name
- [ ] 3.7 Test: `callTool()` forwards to the correct upstream client
- [ ] 3.8 Test: `shutdown()` closes all clients
- [ ] 3.9 Test: transport factory creates correct transport type based on app.transport
