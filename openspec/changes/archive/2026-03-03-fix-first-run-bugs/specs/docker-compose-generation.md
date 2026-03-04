## MODIFIED Requirements

### Requirement: mcp-proxy always includes PAM_PROXY_TOKEN

**Modified.** The mcp-proxy service environment SHALL always include `PAM_PROXY_TOKEN=${PAM_PROXY_TOKEN}` regardless of which app env vars are collected. This is required for proxy authentication.
