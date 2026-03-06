# Spec: Resource & Prompt Passthrough

The proxy SHALL forward MCP resource and prompt operations from upstream servers to downstream runtimes, with `<appShortName>_` name prefixing. Resources and prompts are NOT filtered by role permissions.

---

## Resource Routing

### Requirement: ResourceRouter prefixes resource names with app short name

The `ResourceRouter` SHALL prefix all resource `name` fields using `<appShortName>_<originalName>`.

#### Scenario: Resource from single app
- **WHEN** app `@clawmasons/app-github` exposes resource with name `repository`
- **THEN** `listResources()` returns resource with name `github_repository`
- **AND** the original `uri`, `description`, and `mimeType` are preserved

#### Scenario: Resources from multiple apps
- **WHEN** app `@clawmasons/app-github` exposes `repository` and app `@clawmasons/app-slack` exposes `channel`
- **THEN** `listResources()` returns `github_repository` and `slack_channel`

#### Scenario: No resources from any app
- **WHEN** no upstream apps expose resources
- **THEN** `listResources()` returns an empty array

### Requirement: ResourceRouter resolves URI to upstream app

The `ResourceRouter` SHALL map resource URIs back to the originating app for `resources/read` forwarding.

#### Scenario: Known URI
- **WHEN** `resolveUri("repo://owner/name")` is called
- **AND** app `@clawmasons/app-github` exposed a resource with that URI
- **THEN** it returns `{ appName: "@clawmasons/app-github", originalUri: "repo://owner/name" }`

#### Scenario: Unknown URI
- **WHEN** `resolveUri("unknown://foo")` is called
- **AND** no upstream app exposed a resource with that URI
- **THEN** it returns `null`

---

## Prompt Routing

### Requirement: PromptRouter prefixes prompt names with app short name

The `PromptRouter` SHALL prefix all prompt `name` fields using `<appShortName>_<originalName>`.

#### Scenario: Prompt from single app
- **WHEN** app `@clawmasons/app-github` exposes prompt with name `pr_review`
- **THEN** `listPrompts()` returns prompt with name `github_pr_review`
- **AND** the original `description` and `arguments` are preserved

#### Scenario: Prompts from multiple apps
- **WHEN** app `@clawmasons/app-github` exposes `pr_review` and app `@clawmasons/app-slack` exposes `standup`
- **THEN** `listPrompts()` returns `github_pr_review` and `slack_standup`

### Requirement: PromptRouter resolves prefixed name to upstream app

#### Scenario: Known prefixed name
- **WHEN** `resolve("github_pr_review")` is called
- **THEN** it returns a `PromptRouteEntry` with `appName: "@clawmasons/app-github"` and `originalName: "pr_review"`

#### Scenario: Unknown prefixed name
- **WHEN** `resolve("unknown_prompt")` is called
- **THEN** it returns `null`

---

## Server Handlers

### Requirement: resources/list returns prefixed resources from ResourceRouter

#### Scenario: Runtime calls resources/list
- **WHEN** a runtime calls `resources/list` through the proxy
- **THEN** the proxy returns the result of `resourceRouter.listResources()`
- **AND** all resource names are prefixed with their app short name

### Requirement: resources/read forwards to correct upstream via ResourceRouter

#### Scenario: Valid resource URI
- **WHEN** a runtime calls `resources/read` with URI `repo://owner/name`
- **AND** the URI maps to app `@clawmasons/app-github`
- **THEN** the proxy calls `upstream.readResource("@clawmasons/app-github", "repo://owner/name")`
- **AND** returns the result to the runtime

#### Scenario: Unknown resource URI
- **WHEN** a runtime calls `resources/read` with an unrecognized URI
- **THEN** the proxy returns an error with text "Unknown resource: <uri>"

### Requirement: prompts/list returns prefixed prompts from PromptRouter

#### Scenario: Runtime calls prompts/list
- **WHEN** a runtime calls `prompts/list` through the proxy
- **THEN** the proxy returns the result of `promptRouter.listPrompts()`
- **AND** all prompt names are prefixed with their app short name

### Requirement: prompts/get forwards to correct upstream via PromptRouter

#### Scenario: Valid prompt name
- **WHEN** a runtime calls `prompts/get` with name `github_pr_review` and arguments `{ "pr_number": "42" }`
- **AND** the name maps to app `@clawmasons/app-github` with original name `pr_review`
- **THEN** the proxy calls `upstream.getPrompt("@clawmasons/app-github", "pr_review", { "pr_number": "42" })`
- **AND** returns the result to the runtime

#### Scenario: Unknown prompt name
- **WHEN** a runtime calls `prompts/get` with an unrecognized name
- **THEN** the proxy returns an error with text "Unknown prompt: <name>"

### Requirement: MCP server declares resources and prompts capabilities

#### Scenario: Routers provided
- **WHEN** the `ChapterProxyServer` is created with `resourceRouter` and `promptRouter`
- **THEN** the MCP server capabilities include `resources: {}` and `prompts: {}`

#### Scenario: Routers not provided
- **WHEN** the `ChapterProxyServer` is created without resource/prompt routers
- **THEN** the MCP server capabilities only include `tools: {}`
