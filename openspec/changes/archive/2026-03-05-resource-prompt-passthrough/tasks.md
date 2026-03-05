# Tasks: Resource & Prompt Passthrough

## 1. Resource Router

- [x] 1.1 Define `ResourceRouteEntry` interface in `src/proxy/router.ts` with fields: `appName`, `appShortName`, `originalName`, `prefixedName`, `originalUri`, `resource` (MCP Resource with prefixed name)
- [x] 1.2 Implement `ResourceRouter` class with constructor accepting `Map<string, Resource[]>` (appName → resources)
- [x] 1.3 Constructor prefixes resource names using `getAppShortName()` + underscore, stores URI→app mapping
- [x] 1.4 Implement `listResources(): Resource[]` returning all prefixed resources
- [x] 1.5 Implement `resolveUri(uri: string): { appName: string; originalUri: string } | null` for read routing
- [x] 1.6 Add tests for ResourceRouter: prefixing, listing, URI resolution, unknown URI returns null, multiple apps (7 tests)

## 2. Prompt Router

- [x] 2.1 Define `PromptRouteEntry` interface in `src/proxy/router.ts` with fields: `appName`, `appShortName`, `originalName`, `prefixedName`, `prompt` (MCP Prompt with prefixed name)
- [x] 2.2 Implement `PromptRouter` class with constructor accepting `Map<string, Prompt[]>` (appName → prompts)
- [x] 2.3 Constructor prefixes prompt names using `getAppShortName()` + underscore, builds routing map
- [x] 2.4 Implement `listPrompts(): Prompt[]` returning all prefixed prompts
- [x] 2.5 Implement `resolve(prefixedName: string): PromptRouteEntry | null` for get routing
- [x] 2.6 Add tests for PromptRouter: prefixing, listing, resolution, unknown name returns null, multiple apps (7 tests)

## 3. Server Handlers

- [x] 3.1 Add `resourceRouter` and `promptRouter` optional fields to `ForgeProxyServerConfig`
- [x] 3.2 Update `createMcpServer()` to declare `resources: {}` and `prompts: {}` capabilities when routers are provided
- [x] 3.3 Register `ListResourcesRequestSchema` handler delegating to `resourceRouter.listResources()`
- [x] 3.4 Register `ReadResourceRequestSchema` handler: resolve URI via `resourceRouter.resolveUri()`, forward to `upstream.readResource()`
- [x] 3.5 Register `ListPromptsRequestSchema` handler delegating to `promptRouter.listPrompts()`
- [x] 3.6 Register `GetPromptRequestSchema` handler: resolve name via `promptRouter.resolve()`, forward to `upstream.getPrompt()`
- [x] 3.7 Return errors for unknown resource URIs and unknown prompt names

## 4. Server Integration Tests

- [x] 4.1 Add mock helpers for resource router and prompt router
- [x] 4.2 Test `resources/list` returns prefixed resources via SSE
- [x] 4.3 Test `resources/read` with valid URI forwards to upstream
- [x] 4.4 Test `resources/read` with unknown URI returns error
- [x] 4.5 Test `prompts/list` returns prefixed prompts via SSE
- [x] 4.6 Test `prompts/get` with valid name forwards to upstream
- [x] 4.7 Test `prompts/get` with unknown name returns error
- [x] 4.8 Test resources/prompts work via streamable-http transport
