## 1. Implement ToolRouter

- [ ] 1.1 Create `src/proxy/router.ts` with `RouteEntry` type and `ToolRouter` class
- [ ] 1.2 Implement constructor — iterates upstream tools, applies filters, builds routing table with prefixed names
- [ ] 1.3 Implement `listTools()` — returns all prefixed, filtered Tool objects
- [ ] 1.4 Implement `resolve(prefixedName)` — looks up RouteEntry by prefixed name
- [ ] 1.5 Implement `static prefixName(appShortName, toolName)` — joins with underscore
- [ ] 1.6 Implement `static unprefixName(appShortName, prefixedName)` — strips prefix + underscore
- [ ] 1.7 Add duplicate prefixed name detection in constructor

## 2. Write Tests

- [ ] 2.1 Create `tests/proxy/router.test.ts`
- [ ] 2.2 Test: `prefixName` and `unprefixName` static helpers
- [ ] 2.3 Test: constructor builds routing table with correctly prefixed tools
- [ ] 2.4 Test: `listTools()` returns prefixed Tool objects with correct names and preserved descriptions/schemas
- [ ] 2.5 Test: `listTools()` excludes tools not in the allow-list
- [ ] 2.6 Test: `listTools()` excludes all tools for apps with no filter entry
- [ ] 2.7 Test: `resolve()` returns correct RouteEntry for known prefixed name
- [ ] 2.8 Test: `resolve()` returns null for unknown/filtered prefixed name
- [ ] 2.9 Test: constructor throws on duplicate prefixed names
- [ ] 2.10 Test: empty upstream tools produces empty routing table
- [ ] 2.11 Test: tools from multiple apps are all prefixed and merged correctly
