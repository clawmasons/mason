## 1. Agent Schema — Remove `image` field

- [ ] 1.1 Remove `image: z.string().optional()` from `proxySchema` in `src/schemas/agent.ts`
- [ ] 1.2 Remove `image?: string` from `ResolvedAgent.proxy` in `src/resolver/types.ts`
- [ ] 1.3 Remove all `proxy.image` references from test fixtures across the codebase

## 2. Proxy Dockerfile — Generate forge-based image

- [ ] 2.1 Rewrite `generateProxyDockerfile()` in `src/generator/proxy-dockerfile.ts` to generate a multi-stage Dockerfile that: copies forge source, builds it, copies workspace, runs `forge proxy`
- [ ] 2.2 Change return type from `string | null` to `string` (always returns a Dockerfile)
- [ ] 2.3 Accept `agentName` parameter so the Dockerfile CMD can specify the agent
- [ ] 2.4 Update `tests/generator/proxy-dockerfile.test.ts` — replace all old tests: no more null return, no more mcp-proxy binary references, verify forge build steps and workspace copy

## 3. Docker Compose — Use forge proxy service

- [ ] 3.1 Update `generateDockerCompose()` in `src/compose/docker-compose.ts`: remove `image` variable, always use `build: ./forge-proxy`, replace mcp-proxy entrypoint/command with `forge proxy` command, remove config.json volume mount, keep logs mount
- [ ] 3.2 Remove `hasProxyDockerfile` parameter (always builds)
- [ ] 3.3 Pass agent name to compose generator so it can be used in the command
- [ ] 3.4 Update `tests/compose/docker-compose.test.ts` — remove image tests, remove hasProxyDockerfile tests, add tests for forge proxy command and build context

## 4. Install Command — Stop generating proxy config

- [ ] 4.1 Remove `generateProxyConfig` import and usage from `src/cli/commands/install.ts`
- [ ] 4.2 Remove `mcp-proxy/config.json` from generated files
- [ ] 4.3 Generate `forge-proxy/Dockerfile` instead of `mcp-proxy/Dockerfile`
- [ ] 4.4 Copy forge project source into `forge-proxy/forge/` build context (package.json, src/, bin/, tsconfig)
- [ ] 4.5 Copy agent workspace directories into `forge-proxy/workspace/` build context
- [ ] 4.6 Update `tests/cli/install.test.ts` — verify `forge-proxy/Dockerfile` exists (not `mcp-proxy/`), verify no `mcp-proxy/config.json`, verify workspace is copied into build context

## 5. Update Example Agent Output

- [ ] 5.1 Update `example/.forge/agents/note-taker/` to reflect the new output structure (run `forge install` to regenerate)

## 6. Delta Spec

- [ ] 6.1 Create/update delta specs documenting the changes to docker-compose-generation and forge-install-command capabilities
