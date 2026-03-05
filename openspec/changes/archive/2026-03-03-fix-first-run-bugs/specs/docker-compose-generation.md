## MODIFIED Requirements

### Requirement: mcp-proxy always includes FORGE_PROXY_TOKEN

**Modified.** The mcp-proxy service environment SHALL always include `FORGE_PROXY_TOKEN=${FORGE_PROXY_TOKEN}` regardless of which app env vars are collected. This is required for proxy authentication.
