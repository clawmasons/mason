## MODIFIED Requirements

### Requirement: materializeWorkspace signature extended

**Modified.** The `materializeWorkspace` method signature SHALL be:
```
materializeWorkspace(agent: ResolvedAgent, proxyEndpoint: string, proxyToken?: string): MaterializationResult
```

When `proxyToken` is provided, materializers SHALL bake the actual token value into configuration files instead of using environment variable placeholders.
